'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 4444;
const REPORTS_DIR = path.join(__dirname, '..', 'reports', 'ai-insights');
const ENV_FILE = path.join(__dirname, '..', 'cypress.env.json');
const NO_OPEN = process.argv.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function readEnvJson() {
  try { return JSON.parse(fs.readFileSync(ENV_FILE, 'utf8')); } catch { return {}; }
}

function writeEnvJson(obj) {
  fs.writeFileSync(ENV_FILE, JSON.stringify(obj, null, 2) + '\n');
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── API ─────────────────────────────────────────────────────────────────

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/exclude-rule') {
    const { ruleId } = await parseBody(req);
    if (!ruleId || typeof ruleId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ruleId required' }));
      return;
    }
    const env = readEnvJson();
    const rules = Array.isArray(env.WCAG_IGNORE_RULES) ? env.WCAG_IGNORE_RULES : [];
    if (!rules.includes(ruleId)) { rules.push(ruleId); env.WCAG_IGNORE_RULES = rules; writeEnvJson(env); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rules }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/include-rule') {
    const { ruleId } = await parseBody(req);
    if (!ruleId || typeof ruleId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ruleId required' }));
      return;
    }
    const env = readEnvJson();
    env.WCAG_IGNORE_RULES = (Array.isArray(env.WCAG_IGNORE_RULES) ? env.WCAG_IGNORE_RULES : [])
      .filter(r => r !== ruleId);
    writeEnvJson(env);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rules: env.WCAG_IGNORE_RULES }));
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────

  const filePath = pathname === '/' ? '/latest.html' : pathname;
  const absPath = path.normalize(path.join(REPORTS_DIR, decodeURIComponent(filePath)));

  // Path traversal guard
  const rel = path.relative(REPORTS_DIR, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const data = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${filePath}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wcag] Report server: http://localhost:${PORT}`);
  if (!NO_OPEN) openBrowser(`http://localhost:${PORT}/latest.html`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`[wcag] Port ${PORT} already in use — server may already be running`);
  else console.error('[wcag] Server error:', err.message);
  process.exit(1);
});
