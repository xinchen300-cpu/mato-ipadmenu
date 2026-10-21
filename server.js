// Automaat Menu – server zonder externe afhankelijkheden (Node 18+).
//   Start:  node server.js
//   Scherm (iPad):  http://<adres>:3000/
//   Beheer (computer): http://<adres>:3000/admin/
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const SEED_FILE = path.join(PUBLIC_DIR, 'seed.json');
const MAX_UPLOAD = 300 * 1024 * 1024;
const MAX_JSON = 10 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};
// SVG is bewust niet toegestaan als upload: het kan scripts bevatten.
const UPLOAD_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.m4v', '.mov', '.webm']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(MENU_FILE)) fs.copyFileSync(SEED_FILE, MENU_FILE);

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || loadOrCreatePassword();

function loadOrCreatePassword() {
  const file = path.join(DATA_DIR, 'admin-password.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const pw = crypto.randomBytes(6).toString('base64url');
  fs.writeFileSync(file, pw + '\n', { mode: 0o600 });
  return pw;
}

let menuText = fs.readFileSync(MENU_FILE, 'utf8');
JSON.parse(menuText); // stopt direct als het bestand kapot is
let version = Date.now();
let writeQueue = Promise.resolve();
const sseClients = new Set();

// ---------- helpers ----------

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Niet gevonden');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isAdmin(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), ADMIN_USER);
  const passOk = safeEqual(decoded.slice(i + 1), ADMIN_PASSWORD);
  return userOk && passOk;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooLarge = true;
      else chunks.push(c);
    });
    req.on('end', () => (tooLarge ? reject(httpError(413, 'Te groot')) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------- statische bestanden (met Range-ondersteuning, nodig voor video op iPad) ----------

async function serveStatic(req, res, baseDir, relPath, immutable) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
  if (relPath.endsWith('/')) relPath += 'index.html';
  const file = path.join(baseDir, relPath);
  if (!file.startsWith(baseDir + path.sep)) return notFound(res);
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return notFound(res);
  }
  if (!stat.isFile()) return notFound(res);

  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && stat.size > 0) {
    if (m[1] === '') {
      start = Math.max(0, stat.size - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(Number(m[2]), stat.size - 1);
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

// ---------- API ----------

function validMenu(data) {
  return (
    data && typeof data === 'object' &&
    data.settings && typeof data.settings === 'object' &&
    Array.isArray(data.vendors) && Array.isArray(data.sections) && Array.isArray(data.products)
  );
}

async function writeMenu(text) {
  // Eén reservekopie per dag in data/backups, daarna atomisch wegschrijven.
  const backup = path.join(BACKUP_DIR, `menu-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(backup)) await fsp.copyFile(MENU_FILE, backup);
  const tmp = MENU_FILE + '.tmp';
  await fsp.writeFile(tmp, text);
  await fsp.rename(tmp, MENU_FILE);
}

async function saveMenu(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req, MAX_JSON));
  } catch (e) {
    return sendJSON(res, e.status || 400, { error: 'Ongeldige gegevens' });
  }
  if (!validMenu(data)) return sendJSON(res, 400, { error: 'Ongeldig menu-formaat' });
  const text = JSON.stringify(data, null, 2);
  writeQueue = writeQueue.then(() => writeMenu(text));
  await writeQueue;
  menuText = text;
  version = Date.now();
  broadcast();
  sendJSON(res, 200, { ok: true, version });
}

async function upload(req, res, url) {
  const ext = path.extname(url.searchParams.get('name') || '').toLowerCase();
  if (!UPLOAD_EXT.has(ext)) return sendJSON(res, 400, { error: 'Dit bestandstype is niet toegestaan' });
  if (Number(req.headers['content-length']) > MAX_UPLOAD) {
    return sendJSON(res, 413, { error: 'Bestand is te groot (max 300 MB)' });
  }
  const name = crypto.randomBytes(8).toString('hex') + ext;
  const dest = path.join(UPLOAD_DIR, name);
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      cb(size > MAX_UPLOAD ? httpError(413, 'Bestand is te groot (max 300 MB)') : null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(dest));
    if (size === 0) throw httpError(400, 'Leeg bestand');
  } catch (e) {
    await fsp.unlink(dest).catch(() => {});
    return sendJSON(res, e.status || 500, { error: e.status ? e.message : 'Upload mislukt' });
  }
  sendJSON(res, 200, { url: '/uploads/' + name });
}

function events(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 5000\nevent: version\ndata: ${version}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

function broadcast() {
  for (const c of sseClients) c.write(`event: version\ndata: ${version}\n\n`);
}

setInterval(() => {
  for (const c of sseClients) c.write(': ping\n\n');
}, 25000).unref();

// ---------- router ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch {
      return notFound(res);
    }

    if (p === '/api/menu' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(menuText);
    }
    if (p === '/api/events') return events(req, res);
    if (p === '/config.js') {
      // Deze server bewaart het menu zelf; de online instellingen in public/config.js gelden hier niet.
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
      return res.end('window.AM_CONFIG = {};\n');
    }
    if (p === '/admin') {
      res.writeHead(301, { Location: '/admin/' });
      return res.end();
    }
    if (p.startsWith('/admin/')) {
      if (!isAdmin(req)) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Basic realm="Automaat menu beheer", charset="UTF-8"',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        return res.end('Inloggen vereist');
      }
      if (p === '/admin/api/menu' && req.method === 'PUT') return await saveMenu(req, res);
      if (p === '/admin/api/upload' && req.method === 'POST') return await upload(req, res, url);
      return await serveStatic(req, res, PUBLIC_DIR, p);
    }
    if (p.startsWith('/uploads/')) return await serveStatic(req, res, UPLOAD_DIR, p.slice('/uploads'.length), true);
    return await serveStatic(req, res, PUBLIC_DIR, p === '/' ? '/index.html' : p);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Serverfout');
  }
});

// Grote video-uploads over een trage verbinding mogen even duren.
server.requestTimeout = 30 * 60 * 1000;

server.listen(PORT, () => {
  console.log(`\nAutomaat Menu draait op http://localhost:${PORT}`);
  console.log(`  Scherm (iPad):   http://localhost:${PORT}/`);
  console.log(`  Beheer:          http://localhost:${PORT}/admin/`);
  console.log(`  Inloggen:        ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  (wachtwoord staat in ${path.join(DATA_DIR, 'admin-password.txt')})`);
  console.log(`  Gegevens:        ${DATA_DIR}\n`);
});
