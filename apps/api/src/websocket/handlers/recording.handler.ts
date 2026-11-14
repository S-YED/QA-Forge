import type { Server, Socket } from 'socket.io';
import type { Browser, BrowserContext, Page } from 'playwright';
import { assertAllowedTarget, launchGuardedBrowser } from '@qaforge/playwright-runner';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

interface StartRecordingPayload {
  session_id: string;
  project_id: string;
  base_url: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
}

// Global registry of active recording sessions to keep track of their browsers
const activeRecordings = new Map<
  string,
  {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    startTime: number;
    /** Inputs from the viewport, applied one after another in arrival order */
    queue: Promise<void>;
  }
>();

/** What the workbench viewport sends: a click at viewport coordinates, typed text, a key, or a scroll. */
type RecordingInput =
  | { session_id: string; kind: 'click'; x: number; y: number }
  | { session_id: string; kind: 'type'; text: string }
  | { session_id: string; kind: 'key'; key: string }
  | { session_id: string; kind: 'scroll'; dy: number };

const VIEWPORT = { width: 1280, height: 720 };
/** Keys the viewport may press; printable characters arrive as 'type'. */
const KEYS = new Set(['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const clamp = (n: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number(n) || 0));

/**
 * Expose a function in the browser page context to capture events.
 * Inserts a script that listens to clicks, input changes, and page navigations
 * and routes them to the server-side exposed node function.
 */
async function injectRecorderScript(
  page: Page,
  onAction: (action: {
    type: string;
    selector?: string;
    value?: string;
    url: string;
    timestamp: number;
  }) => void
) {
  await page.exposeFunction('emitRecordedAction', async (action: {
    type: string;
    selector?: string;
    value?: string;
    url: string;
  }) => {
    // This will be called from the browser runtime context
    const pageUrl = page.url();

    // Call callback back to main handler
    onAction({
      ...action,
      url: pageUrl,
      timestamp: Date.now(),
    });
  });

  // Some TypeScript runners (tsx/esbuild keepNames) wrap named functions in __name(...); the script below is sent
  // to the page as source, where that helper does not exist. Define a no-op first so it runs under any build.
  await page.addInitScript('window.__name = window.__name || ((fn) => fn);');

  // Inject element selector and listener script on DOM ready
  await page.addInitScript(() => {
    const words = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const FIELDS = 'input, textarea, select';
    const CONTROLS =
      'button, a, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], summary, input[type=submit], input[type=button], input[type=checkbox], input[type=radio]';
    const fieldName = (f: Element) => {
      const field = f as HTMLInputElement;
      return words(field.labels?.[0]?.innerText) || words(field.getAttribute('aria-label')) || words(field.getAttribute('placeholder'));
    };
    const controlText = (c: Element) =>
      words((c as HTMLElement).innerText) || words((c as HTMLInputElement).value) || words(c.getAttribute('aria-label'));

    /**
     * Name an element the way a person would (a field's label, a button's text), so recorded steps read like
     * Click "Sign in" and replay through the runner's plain-word lookup. Words are used only when they are unique on
     * the page; otherwise data-testid, id, then a CSS path.
     */
    function getTarget(el: HTMLElement): string {
      const field = el.closest(FIELDS);
      if (field) {
        const name = fieldName(field);
        if (name && name.length <= 60 && Array.from(document.querySelectorAll(FIELDS)).filter((x) => fieldName(x) === name).length === 1) {
          return name;
        }
      } else {
        const control = el.closest(CONTROLS) ?? el;
        const text = controlText(control);
        // Replay tries buttons before links (runner locate.ts): a button only has to be unique among buttons,
        // anything else among all controls (a same-named button would win).
        const BUTTONS = 'button, [role=button], input[type=submit], input[type=button]';
        const pool = control.matches(BUTTONS) ? BUTTONS : CONTROLS;
        if (text && text.length <= 60 && Array.from(document.querySelectorAll(pool)).filter((x) => controlText(x) === text).length === 1) {
          return text;
        }
      }
      const node = (field ?? el.closest(CONTROLS) ?? el) as HTMLElement;
      const testId = node.closest('[data-testid]');
      if (testId) return `[data-testid="${testId.getAttribute('data-testid')}"]`;
      return getCleanSelector(node);
    }

    // CSS fallback for elements with no readable or stable name
    function getCleanSelector(el: HTMLElement): string {
      if (el.id) return `#${CSS.escape(el.id)}`;

      const tagName = el.tagName.toLowerCase();
      if (tagName === 'body' || tagName === 'html') return tagName;

      // Buttons/Inputs with unique name/type attributes
      if (el.getAttribute('name')) {
        return `${tagName}[name="${el.getAttribute('name')}"]`;
      }

      // Fallback: build a clean selector path
      let selector = tagName;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
        if (classes.length > 0) {
          selector += `.${classes.slice(0, 2).join('.')}`;
        }
      }

      // Add child index if siblings exist to make it unique
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      return selector;
    }

    // Attach click listener
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const field = target.closest('input, textarea, select') as HTMLInputElement | null;
      if (field && !['checkbox', 'radio', 'submit', 'button', 'file'].includes(field.type)) return;

      const selector = getTarget(target);

      // Expose event
      (window as any).emitRecordedAction({
        type: 'click',
        selector,
        url: window.location.href,
      });
    }, true);

    // Attach input change listener
    document.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!target || !target.tagName) return;

      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        if (['checkbox', 'radio', 'submit', 'button'].includes((target as HTMLInputElement).type)) return; // recorded as clicks
        const selector = getTarget(target);
        (window as any).emitRecordedAction({
          type: tagName === 'select' ? 'select' : 'type',
          selector,
          value: target.value,
          url: window.location.href,
        });
      }
    }, true);
  });
}

/**
 * Capture a screenshot from the page and stream it as base64 to the room.
 */
async function captureAndStreamFrame(io: Server, roomName: string, sessionId: string, page: Page) {
  try {
    if (page.isClosed()) return;

    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70 });
    io.to(roomName).emit('recording:frame', {
      session_id: sessionId,
      screenshot_base64: screenshotBuffer.toString('base64'),
      mime: 'image/jpeg',
    });
  } catch (err) {
    logger.debug(`Failed to stream frame for session ${sessionId}: ${err}`);
  }
}

/**
 * Conclude and close an active recording session cleanly.
 */
export async function closeRecordingSession(sessionId: string) {
  const active = activeRecordings.get(sessionId);
  if (!active) return;

  try {
    // A field still focused has not fired "change" yet: blur it so its typed value becomes a step.
    await active.queue.catch(() => {});
    await active.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {});
    await active.page.waitForTimeout(400).catch(() => {});
    const durationMs = Date.now() - active.startTime;
    await active.browser.close();
    activeRecordings.delete(sessionId);

    // Update DB status to completed
    await supabase
      .from('recorded_sessions')
      .update({
        status: 'completed',
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    logger.info({ event: 'recording:session:closed', sessionId, durationMs });
  } catch (err) {
    logger.error(`Failed to close recording session ${sessionId}`, err);
  }
}

/** Sessions this socket has proved it owns (joined or started), so it may send input to them. */
function ownedRecordings(socket: Socket): Set<string> {
  return ((socket.data.recordings as Set<string> | undefined) ??= new Set<string>());
}

/**
 * Register recording socket event handlers.
 */
export function registerRecordingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  // ── Join a live recording room ──
  socket.on('recording:join', async (payload: { session_id: string }) => {
    const { session_id } = payload;
    const roomName = `recording:${session_id}`;

    try {
      // Verify session ownership
      const { data: session } = await supabase
        .from('recorded_sessions')
        .select('id')
        .eq('id', session_id)
        .eq('user_id', userId)
        .single();

      if (!session) {
        socket.emit('recording:error', { session_id, message: 'Unauthorized session access' });
        return;
      }

      socket.join(roomName);
      ownedRecordings(socket).add(session_id);
      logger.info({ event: 'recording:room:joined', socketId: socket.id, session_id });

      // Stream an initial frame if the browser is already running
      const active = activeRecordings.get(session_id);
      if (active) {
        await captureAndStreamFrame(io, roomName, session_id, active.page);
      }
    } catch (err) {
      socket.emit('recording:error', { session_id, message: String(err) });
    }
  });

  // ── Start a live browser recording session ──
  socket.on('recording:start', async (payload: StartRecordingPayload) => {
    const { session_id } = payload;
    const roomName = `recording:${session_id}`;

    try {
      // Double check session ownership
      const { data: session } = await supabase
        .from('recorded_sessions')
        .select('id, status, base_url')
        .eq('id', session_id)
        .eq('user_id', userId)
        .single();

      if (!session) {
        socket.emit('recording:error', { session_id, message: 'Unauthorized session access' });
        return;
      }

      if (session.status !== 'recording') {
        socket.emit('recording:error', { session_id, message: `Session status is already '${session.status}'` });
        return;
      }

      // Check if session is already running
      if (activeRecordings.has(session_id)) {
        socket.emit('recording:error', { session_id, message: 'Recording is already running' });
        return;
      }

      // Only the URL stored (and validated) with the session is opened, never one from the socket payload.
      const base_url: string = session.base_url;
      await assertAllowedTarget(base_url, env.ALLOWED_PRIVATE_HOSTS);
      logger.info({ event: 'recording:browser:launching', session_id, base_url });

      // Launch headless browser (headed can be tricky to view inside docker/headless boxes, 
      // but virtual frame buffers allow running headless browsers perfectly with streaming!)
      const browser = await launchGuardedBrowser('chromium', env.ALLOWED_PRIVATE_HOSTS);
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();

      // Store in memory
      activeRecordings.set(session_id, {
        browser,
        context,
        page,
        startTime: Date.now(),
        queue: Promise.resolve(),
      });

      // Join the socket room
      socket.join(roomName);
      ownedRecordings(socket).add(session_id);

      // Capture and stream frame after any DOM content load or paint
      page.on('load', async () => {
        await captureAndStreamFrame(io, roomName, session_id, page);
      });

      // Keep counter of actions
      let actionCount = 0;

      // Inject recorder listener script with real-time callback
      await injectRecorderScript(page, async (action) => {
        try {
          actionCount++;
          const timeOffsetMs = action.timestamp - (activeRecordings.get(session_id)?.startTime || action.timestamp);

          // Save action event directly to PostgreSQL
          const { data: insertedAction } = await supabase
            .from('session_actions')
            .insert({
              session_id,
              action_number: actionCount,
              action_type: action.type,
              selector: action.selector || null,
              value: action.value || null,
              url: action.url,
              timestamp_ms: Math.max(0, timeOffsetMs),
              metadata: {},
            })
            .select()
            .single();

          if (insertedAction) {
            // Notify frontend room of captured action
            io.to(roomName).emit('recording:action:captured', {
              session_id,
              action: insertedAction,
            });
          }

          // Trigger a frame capture and broadcast the fresh viewport frame
          await captureAndStreamFrame(io, roomName, session_id, page);
        } catch (err) {
          logger.error(`Error saving recorded action for session ${session_id}`, err);
        }
      });

      // Navigate to the start base URL
      await page.goto(base_url, { waitUntil: 'domcontentloaded' });

      // Notify room that recording setup is running
      io.to(roomName).emit('recording:started', {
        session_id,
        base_url,
      });

      // Stream initial viewport frame
      await captureAndStreamFrame(io, roomName, session_id, page);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to launch recording session ${session_id}`, err);

      await supabase
        .from('recorded_sessions')
        .update({ status: 'error' })
        .eq('id', session_id);

      io.to(roomName).emit('recording:error', {
        session_id,
        message: `Failed to launch browser: ${errorMsg}`,
      });

      const active = activeRecordings.get(session_id);
      if (active) {
        await active.browser.close().catch(() => {});
        activeRecordings.delete(session_id);
      }
    }
  });

  // ── Input from the workbench viewport: the user drives the recording browser ──
  socket.on('recording:input', (payload: RecordingInput) => {
    const session_id = payload?.session_id;
    // Only a socket that proved ownership (join/start) may drive this session's browser.
    const active = session_id && ownedRecordings(socket).has(session_id) ? activeRecordings.get(session_id) : undefined;
    if (!active) return;
    const { page } = active;
    active.queue = active.queue
      .then(async () => {
        if (payload.kind === 'click') {
          await page.mouse.click(clamp(payload.x, 0, VIEWPORT.width - 1), clamp(payload.y, 0, VIEWPORT.height - 1));
        } else if (payload.kind === 'type' && typeof payload.text === 'string') {
          await page.keyboard.type(payload.text.slice(0, 500));
        } else if (payload.kind === 'key' && KEYS.has(payload.key)) {
          await page.keyboard.press(payload.key);
        } else if (payload.kind === 'scroll') {
          await page.mouse.wheel(0, clamp(payload.dy, -2000, 2000));
        } else {
          return;
        }
        // Let a navigation or re-render settle, then show the result.
        await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => {});
        await page.waitForTimeout(250);
        await captureAndStreamFrame(io, `recording:${session_id}`, session_id, page);
      })
      .catch((err) => {
        logger.debug({ event: 'recording:input_failed', session_id, error: String(err) });
      });
  });

  // ── Stop a live browser recording session ──
  socket.on('recording:stop', async (payload: { session_id: string }) => {
    const { session_id } = payload;
    const roomName = `recording:${session_id}`;

    try {
      // Close browser and update DB
      await closeRecordingSession(session_id);

      // Notify room of completion
      io.to(roomName).emit('recording:completed', { session_id });

      socket.leave(roomName);
    } catch (err) {
      socket.emit('recording:error', { session_id, message: String(err) });
    }
  });
}
