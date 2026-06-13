import type { Server, Socket } from 'socket.io';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
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
  }
>();

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

  // Inject element selector and listener script on DOM ready
  await page.addInitScript(() => {
    // Helper to calculate a clean, unique CSS selector for an element
    function getCleanSelector(el: HTMLElement): string {
      if (el.id) return `#${el.id}`;
      
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
      
      // Calculate selector
      const selector = getCleanSelector(target);
      
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
        const selector = getCleanSelector(target);
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
    
    const screenshotBuffer = await page.screenshot({ type: 'png' });
    io.to(roomName).emit('recording:frame', {
      session_id: sessionId,
      screenshot_base64: screenshotBuffer.toString('base64'),
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
    const { session_id, project_id, base_url } = payload;
    const roomName = `recording:${session_id}`;
    
    try {
      // Double check session ownership
      const { data: session } = await supabase
        .from('recorded_sessions')
        .select('id, status')
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

      logger.info({ event: 'recording:browser:launching', session_id, base_url });
      
      // Launch headless browser (headed can be tricky to view inside docker/headless boxes, 
      // but virtual frame buffers allow running headless browsers perfectly with streaming!)
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      // Store in memory
      activeRecordings.set(session_id, {
        browser,
        context,
        page,
        startTime: Date.now(),
      });

      // Join the socket room
      socket.join(roomName);

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
