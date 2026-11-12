import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT ?? 3000);

function loadEnvLocal() {
  const file = path.join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    if (!process.env[key]) process.env[key] = match[2].trim();
  }
}
loadEnvLocal();

const apiRoutes: Record<string, string> = {
  '/api/auth/create-parent': 'api/auth/create-parent.ts',
  '/api/auth/create-user': 'api/auth/create-user.ts',
  '/api/auth/delete-user': 'api/auth/delete-user.ts',
  '/api/auth/login-parent': 'api/auth/login-parent.ts',
  '/api/auth/login-staff': 'api/auth/login-staff.ts',
  '/api/auth/set-password': 'api/auth/set-password.ts',
  '/api/finance/settle-payment': 'api/finance/settle-payment.ts',
  '/api/finance/validated': 'api/finance/validated.ts',
  '/api/sycapay/card': 'api/sycapay/card.ts',
  '/api/sycapay/initiate': 'api/sycapay/initiate.ts',
  '/api/sycapay/status': 'api/sycapay/status.ts',
  '/api/sycapay/webhook': 'api/sycapay/webhook.ts',
};

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(dist, safePath);
  if (!filePath.startsWith(dist)) filePath = path.join(dist, 'index.html');
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    const body = await readFile(path.join(dist, 'index.html'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(body);
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = (req.url ?? '/').split('?')[0];
    const handlerPath = apiRoutes[pathname];
    if (handlerPath) {
      const mod = await import(pathToFileURL(path.join(root, handlerPath)).href);
      await mod.default(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify({ ok: false, error: 'Erreur interne du serveur.' }));
  }
});

server.listen(port, () => {
  console.log(`O RESTO server listening on http://localhost:${port}`);
});
