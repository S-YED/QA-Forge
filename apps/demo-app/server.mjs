// Zero-dependency demo shop that QA Forge tests run against locally.
// Run: node server.mjs   (PORT env, default 4100; PORT=0 picks a free port)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/dashboard': 'dashboard.html',
  '/items': 'items.html',
  '/checkout': 'checkout.html',
};

async function send(res, status, file) {
  try {
    const body = await readFile(join(root, file));
    res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Internal error');
  }
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://demo').pathname;
  if (path === '/500') return send(res, 500, 'error.html');
  // Only known pages and flat asset names are served, so no path can escape public/.
  const file = PAGES[path] ?? (/^\/[\w-]+\.(css|js)$/.test(path) ? path.slice(1) : null);
  return file ? send(res, 200, file) : send(res, 404, 'not-found.html');
});

const port = Number(process.env.PORT ?? 4100);
// Loopback only: the demo shop is for this machine.
server.listen(port, '127.0.0.1', () => {
  console.log(`demo-app listening on http://127.0.0.1:${server.address().port}`);
});
