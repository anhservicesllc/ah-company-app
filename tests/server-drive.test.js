'use strict';
/* Company server: photos copied to Google Drive, tested against a fake Google (no real account involved). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const ROOT = path.join(__dirname, '..');
const freePort = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

let srv, base, g, gBase; const G = { folders: [], uploads: [], tokens: [] };
function fakeGoogle() {
  let n = 0;
  return new Promise(ok => { g = http.createServer((req, res) => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => {
    const body = Buffer.concat(parts), u = new URL(req.url, 'http://x');
    const j = (code, o, h) => { res.writeHead(code, { 'content-type': 'application/json', ...(h || {}) }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/token') { const f = Object.fromEntries(new URLSearchParams(body.toString())); G.tokens.push(f.grant_type);
      return f.grant_type === 'authorization_code' ? j(200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 }) : j(200, { access_token: 'at2', expires_in: 3600 }); }
    if (req.headers.authorization !== 'Bearer at1' && req.headers.authorization !== 'Bearer at2' && !u.pathname.startsWith('/session/')) return j(401, { error: 'no' });
    if (u.pathname === '/drive/v3/files' && req.method === 'POST') { const m = JSON.parse(body.toString()); G.folders.push({ name: m.name, parents: m.parents || [] }); return j(200, { id: 'F' + (++n) }); }
    if (u.pathname === '/upload/drive/v3/files') { const m = JSON.parse(body.toString()); const sid = ++n; G.uploads.push({ name: m.name, parents: m.parents, sid }); res.writeHead(200, { location: gBase + '/session/' + sid }); return res.end(); }
    if (u.pathname.startsWith('/session/')) { const up = G.uploads.find(x => 'D' + x.sid === 'D' + u.pathname.split('/').pop()); up.bytes = body.length; up.type = req.headers['content-type']; return j(200, { id: 'D' + up.sid }); }
    j(404, {}); }); }).listen(0, () => { gBase = 'http://127.0.0.1:' + g.address().port; ok(); }); });
}
before(async () => {
  await fakeGoogle();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-gd-')), port = await freePort(); base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port), AH_DATA: dataDir, AH_GOOGLE_AUTH: gBase, AH_GOOGLE_OAUTH: gBase, AH_GOOGLE_API: gBase, AH_PUBLIC_URL: base }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { if (srv) srv.kill(); if (g) g.close(); });

let cookie = '';
const go = async (p, o = {}) => { const r = await fetch(base + p, { redirect: 'manual', ...o, headers: { ...(o.headers || {}), ...(cookie ? { cookie } : {}) } }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r; };
const form = (p, f) => go(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
const msg = r => decodeURIComponent((r.headers.get('location') || '').split('m=')[1] || '');

test('health reports the app version', async () => {
  const h = await (await fetch(base + '/api/health')).json();
  assert.equal(h.version, require('../package.json').version.split('.')[0]); assert.equal(h.drive, false);
});

test('owner connects Google Drive and photos are copied into a folder per home', async () => {
  await form('/setup', { name: 'Owner', email: 'owner@test.com', password: 'owner-password-1' });
  let r = await form('/admin/google', { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'secret-1' });
  assert.match(msg(r), /Connect Google Drive/);
  r = await go('/admin/google/start'); const to = new URL(r.headers.get('location'));
  assert.equal(to.origin + to.pathname, gBase + '/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(to.searchParams.get('redirect_uri'), base + '/admin/google/callback');
  r = await go('/admin/google/callback?state=wrong&code=x'); assert.match(msg(r), /expired/);
  r = await go('/admin/google/callback?state=' + to.searchParams.get('state') + '&code=abc'); assert.match(msg(r), /Google Drive connected/);
  assert.equal((await (await fetch(base + '/api/health')).json()).drive, true);

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b70000000049454e44ae426082', 'hex');
  const up = await (await go('/api/upload', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })).json();
  await go('/api/doc?path=homes/H-1001', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: '1 Test St', city: 'Cedar City', photos: [{ id: up.id, url: up.url }] }) });
  await new Promise(r => setTimeout(r, 300));   /* the connect step may already be copying */
  r = await form('/admin/google/sync', {}); assert.match(msg(r), /Copied|already running/);
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(G.folders.map(f => f.name), ['A&H App Photos', 'Homes', '1 Test St, Cedar City (H-1001)']);
  assert.equal(G.uploads.length, 1); assert.equal(G.uploads[0].bytes, png.length); assert.equal(G.uploads[0].type, 'image/png');
  assert.deepEqual(G.uploads[0].parents, ['F3'], 'inside the home folder');
  r = await form('/admin/google/sync', {}); assert.match(msg(r), /Copied 0 photos/, 'never copied twice');
  const page = await (await go('/admin')).text(); assert.match(page, /1 of 1 photos copied/); assert.doesNotMatch(page, /secret-1/, 'secret never shown');
});

test('only the owner can connect Drive', async () => {
  const saved = cookie; cookie = '';
  const r = await go('/admin/google/start'); assert.equal(r.status, 403);
  cookie = saved;
});
