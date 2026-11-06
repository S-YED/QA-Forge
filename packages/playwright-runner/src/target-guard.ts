// SSRF guard: the browser under test may only reach public addresses (plus explicitly allowed hosts).
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { chromium, firefox, webkit, type Browser, type LaunchOptions } from 'playwright';

// Separate lists: a single BlockList also matches IPv4 addresses against IPv6 rules via ::ffff: mapping.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
// Loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast and reserved.
for (const [range, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) BLOCKED_V4.addSubnet(range, prefix, 'ipv4');
// ::/96 covers ::, ::1 and IPv4-compatible; ::ffff:0:0/96 and 64:ff9b::/96 embed IPv4 addresses.
for (const [range, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) BLOCKED_V6.addSubnet(range, prefix, 'ipv6');

/** Header the guard proxy sets on the response it returns instead of contacting a blocked host. */
export const BLOCKED_HEADER = 'x-qaforge-blocked';

/**
 * Resolve `hostname` and return the address to connect to, or throw if it is private/reserved.
 * Hosts in `allowedPrivateHosts` (or `*`) skip the address check.
 */
async function resolveAllowed(hostname: string, allowedPrivateHosts: readonly string[]): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (allowedPrivateHosts.includes('*') || allowedPrivateHosts.includes(host)) return host;
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  for (const { address, family } of addresses) {
    if (family === 6 ? BLOCKED_V6.check(address, 'ipv6') : BLOCKED_V4.check(address, 'ipv4')) {
      throw new Error(`Refusing to open ${hostname}: it resolves to a private or reserved address (${address})`);
    }
  }
  return addresses[0].address;
}

/** Throw unless `rawUrl` is http(s) and its host resolves only to public addresses (or is allowed). */
export async function assertAllowedTarget(rawUrl: string, allowedPrivateHosts: readonly string[] = []): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Refusing to open ${url.protocol} URL`);
  await resolveAllowed(url.hostname, allowedPrivateHosts);
}

/**
 * Local forward proxy that checks every destination and connects to the vetted IP itself,
 * so redirects, subresources, WebSockets and DNS rebinding can't reach internal addresses.
 */
async function startGuardProxy(allowedPrivateHosts: readonly string[]): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    // Plain HTTP: the request line carries the absolute URL.
    try {
      const url = new URL(req.url ?? '');
      const address = await resolveAllowed(url.hostname, allowedPrivateHosts);
      const headers = { ...req.headers };
      delete headers['proxy-connection'];
      const upstream = http.request(
        { host: address, port: url.port || 80, method: req.method, path: url.pathname + url.search, headers },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
      req.pipe(upstream);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      res.writeHead(403, { [BLOCKED_HEADER]: reason, 'Content-Type': 'text/plain' }).end(reason);
    }
  });
  // HTTPS and WebSockets arrive as CONNECT host:port tunnels.
  server.on('connect', async (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    client.on('error', () => {});
    try {
      const target = new URL(`http://${req.url}`);
      const address = await resolveAllowed(target.hostname, allowedPrivateHosts);
      const upstream = net.connect(Number(target.port) || 443, address, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
      client.on('close', () => upstream.destroy());
    } catch (err) {
      client.end(`HTTP/1.1 403 Forbidden\r\n${BLOCKED_HEADER}: ${err instanceof Error ? err.message : err}\r\n\r\n`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

const BROWSERS = { chromium, firefox, webkit };

/**
 * Launch a headless browser whose traffic all goes through the guard proxy.
 * With `*` allowed (local dev) there is nothing to guard, so no proxy is started.
 * ponytail: loopback is forced through the proxy for Chromium and Firefox; WebKit may bypass it for
 * localhost, so runs on WebKit rely on the up-front URL checks for loopback targets.
 */
export async function launchGuardedBrowser(
  name: keyof typeof BROWSERS,
  allowedPrivateHosts: readonly string[] = [],
): Promise<Browser> {
  if (allowedPrivateHosts.includes('*')) return BROWSERS[name].launch({ headless: true });

  const proxy = await startGuardProxy(allowedPrivateHosts);
  const options: LaunchOptions = {
    headless: true,
    proxy: { server: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, bypass: '<-loopback>' },
    ...(name === 'firefox' && { firefoxUserPrefs: { 'network.proxy.allow_hijacking_localhost': true } }),
  };
  try {
    const browser = await BROWSERS[name].launch(options);
    browser.on('disconnected', () => proxy.close());
    return browser;
  } catch (err) {
    proxy.close();
    throw err;
  }
}
