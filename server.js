/*
  A&H Estimating App — company server (no outside packages needed).
  Runs the same app file on your own hosting (for example SiteGround Node.js, or any computer with Node 18+).

  What it provides, in place of claude.ai:
    - shared database   (one JSON file per record under ./data/db — easy to back up and read)
    - photo storage     (./data/blobs, served at /_blob/<id>)
    - sign-in           (company users with passwords; turning a user off locks them out at once)
    - user admin page   (/admin — owner/admins add, reset, turn off users)

  Start:   node server.js            (port from PORT, default 3000)
  Files:   app.html must sit next to this file (download it from the app or ask for the latest copy).
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), url = require('url');

const ROOT = __dirname;
/* Where the app keeps its data. AH_DATA wins if set. On SiteGround Node.js hosting each update deploys into a new
   build folder under public_html/.nodeapp/, so data kept beside server.js would be lost on the next update; there it
   goes to <site folder>/ah-data instead, outside public_html (not reachable from the web) and outside every build. */
function dataDir() {
  if (process.env.AH_DATA) return process.env.AH_DATA;
  let real = ROOT; try { real = fs.realpathSync(ROOT); } catch (e) {}
  const i = real.indexOf(path.sep + 'public_html' + path.sep + '.nodeapp' + path.sep);
  if (i > 0) return path.join(real.slice(0, i), 'ah-data');
  return path.join(ROOT, 'data');
}
const DATA = dataDir();
const DBDIR = path.join(DATA, 'db'), BLOBS = path.join(DATA, 'blobs');
const AI_F = path.join(DATA, 'ai.json');
const USERS_F = path.join(DATA, 'users.json'), SESS_F = path.join(DATA, 'sessions.json'), LOG_F = path.join(DATA, 'audit.log');
const PORT = +process.env.PORT || 3000;
const MAX_UPLOAD = 25 * 1024 * 1024, MAX_JSON = 5 * 1024 * 1024, SESSION_DAYS = 30;
for (const d of [DATA, DBDIR, BLOBS]) fs.mkdirSync(d, { recursive: true });
/* access-check records the app reads to know who may see customers (same as on claude.ai) */
for (const [rel, purpose] of [['office/private/team/check', 'Access check: everyone signed in can read this, so the app shows them customer details read-only.'], ['office/private/meta/check', 'Access check: only admins can read this, so the app lets them edit customers.']]) {
  const f = path.join(DBDIR, rel + '.json'); if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ purpose })); }
}

/* ---------- small helpers ---------- */
const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };
const writeJSON = (f, v) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
const audit = (who, what) => { try { fs.appendFileSync(LOG_F, `${new Date().toISOString()}\t${who || '-'}\t${what}\n`); } catch (e) {} };
const id = (n = 16) => crypto.randomBytes(n).toString('hex');
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function segs(p) { const s = String(p || '').split('/'); if (!s.length || s.length > 15 || s.some(x => !SEG.test(x) || x === '.' || x === '..')) return null; return s; }

/* ---------- users and sessions ---------- */
let users = readJSON(USERS_F, []);
let sessions = readJSON(SESS_F, {});
const saveUsers = () => writeJSON(USERS_F, users), saveSess = () => writeJSON(SESS_F, sessions);
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
function checkPw(u, pw) { const h = Buffer.from(hashPw(pw, u.salt), 'hex'), k = Buffer.from(u.hash, 'hex'); return h.length === k.length && crypto.timingSafeEqual(h, k); }
function makeUser({ email, name, password, admin }) {
  const salt = id(8);
  return { id: 'u_' + id(11), email: String(email).trim().toLowerCase(), name: String(name || '').trim(), admin: !!admin, owner: false, disabled: false, salt, hash: hashPw(password, salt), created: new Date().toISOString() };
}
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function currentUser(req) {
  const t = cookies(req).ah_s; const s = t && sessions[t];
  if (!s || s.exp < Date.now()) return null;
  const u = users.find(x => x.id === s.uid);
  return u && !u.disabled ? u : null;
}
function startSession(res, req, u) {
  const t = id(24); sessions[t] = { uid: u.id, exp: Date.now() + SESSION_DAYS * 864e5 }; saveSess();
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ah_s=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function endSessionsFor(uid) { for (const [t, s] of Object.entries(sessions)) if (s.uid === uid) delete sessions[t]; saveSess(); }

/* ---------- access rules: the same as the app's rules on claude.ai ----------
   office/private/...            owner and admins only
   office/private/customers      everyone reads, admins write
   office/private/custreq        everyone reads and writes
   office/private/team           everyone reads, admins write
   everything else               every signed-in user reads and writes                     */
function allowed(u, s, op) {
  if (!u) return false;
  if (s[0] === 'office' && s[1] === 'private') {
    const sub = s[2];
    if (sub === 'customers' || sub === 'team') return op === 'read' || u.admin;
    if (sub === 'custreq') return true;
    return u.admin;
  }
  return true;
}

/* ---------- documents on disk ---------- */
let rev = Date.now();
const docFile = s => path.join(DBDIR, ...s.slice(0, -1), s[s.length - 1] + '.json');
const colDir = s => path.join(DBDIR, ...s);
function readDoc(s) { const f = docFile(s); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return undefined; } }
function listCol(s) {
  const d = colDir(s); let names = [];
  try { names = fs.readdirSync(d).filter(n => n.endsWith('.json')); } catch (e) {}
  return names.map(n => ({ id: n.slice(0, -5), data: readJSON(path.join(d, n), null) })).filter(x => x.data !== null);
}

/* ---------- http plumbing ---------- */
function send(res, code, body, type) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': type || (isObj ? 'application/json' : 'text/plain; charset=utf-8'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((ok, bad) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { bad(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', bad);
  });
}
async function readJSONBody(req) { const b = await readBody(req, MAX_JSON); try { return JSON.parse(b.toString('utf8') || 'null'); } catch (e) { throw Object.assign(new Error('bad json'), { code: 400 }); } }
const IMG_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'application/pdf': '.pdf', 'video/mp4': '.mp4', 'video/quicktime': '.mov' };

/* ---------- pages ---------- */
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
:root{--bg:#f3f5f7;--panel:#fff;--ink:#18212b;--muted:#5d6b78;--line:#d9e0e6;--accent:#1d4f8c;--red:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#11161c;--panel:#18202a;--ink:#e6ebf0;--muted:#93a1ae;--line:#2b3644;--accent:#7fb0ec;--red:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px}h1{font-size:1.4rem;margin:0 0 12px}.box{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:12px}
label{display:grid;gap:4px;font-size:.8rem;font-weight:600;color:var(--muted);margin-bottom:10px}input,select{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:9px 10px;min-height:42px}
button{font:inherit;border:1px solid var(--accent);background:var(--accent);color:var(--panel);border-radius:6px;padding:9px 14px;min-height:42px;cursor:pointer}button.ghost{background:none;color:var(--ink);border-color:var(--line)}
.err{color:var(--red)}table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{padding:7px 6px;border-bottom:1px solid var(--line);text-align:left}.note{color:var(--muted);font-size:.85rem}
</style></head><body><main>${body}</main></body></html>`;
const loginPage = (msg, firstRun) => page('Sign in · A&H', `<h1>A&amp;H Estimating App</h1><div class="box">${firstRun
  ? `<p><strong>First start:</strong> create the owner account. You can add everyone else after.</p><form method="post" action="setup"><label>Your name<input name="name" required></label><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password (10+ characters)<input name="password" type="password" minlength="10" required autocomplete="new-password"></label><button>Create owner and sign in</button></form>`
  : `<form method="post" action="login"><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button>Sign in</button></form>`}
  ${msg ? `<p class="err">${msg}</p>` : ''}</div>`);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const adminPage = (u, msg) => page('Users · A&H', `<h1>Users</h1><p class="note">Signed in as ${esc(u.name || u.email)} · <a href="./">Back to the app</a></p>${msg ? `<p class="err">${esc(msg)}</p>` : ''}
<div class="box"><table><thead><tr><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead><tbody>${users.map(x => `<tr><td>${esc(x.name)}${x.owner ? ' (owner)' : ''}</td><td>${esc(x.email)}</td><td>${x.disabled ? '<span class="err">Turned off</span>' : x.admin ? 'Admin' : 'Member'}</td><td>${x.owner ? '' : `<form method="post" action="admin/user" style="display:flex;gap:6px;flex-wrap:wrap"><input type="hidden" name="id" value="${x.id}"><select name="do"><option value="">Change…</option><option value="admin">Make admin</option><option value="member">Make member</option><option value="off">Turn off (person leaves)</option><option value="on">Turn back on</option><option value="reset">Set new password</option></select><input name="password" type="password" placeholder="New password" style="width:9em"><button class="ghost">Apply</button></form>`}</td></tr>`).join('')}</tbody></table></div>
<div class="box"><h2 style="font-size:1.05rem;margin-top:0">Add a person</h2><form method="post" action="admin/add"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Temporary password (10+ characters)<input name="password" type="password" minlength="10" required></label><label>Access<select name="admin"><option value="">Member (uses the app; roles set in the app's Team list)</option><option value="1">Admin (also manages users, customers, settings)</option></select></label><button>Add</button></form>
<p class="note">Turning someone off signs them out everywhere at once. Their past work stays in the app.</p></div>${aiBox(u)}${mailBox(u)}`);
const form = b => Object.fromEntries(new URLSearchParams(b.toString('utf8')));
const redirect = (res, to) => { res.writeHead(303, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };

/* ---------- AI for "Fill it in for me" (optional) ----------
   provider "anthropic": Claude API (needs an API key from console.anthropic.com)
   provider "openai":    any OpenAI-compatible server, including your own AI on an office computer
                         (Ollama: url http://<computer>:11434/v1, model e.g. llama3.1; LM Studio: http://<computer>:1234/v1)
   Settings live in data/ai.json (owner sets them on the /admin page) or in AH_AI_PROVIDER / AH_AI_URL / AH_AI_MODEL / AH_AI_KEY. The key never reaches a phone. */
function aiConf() { const f = readJSON(AI_F, {}); return { provider: process.env.AH_AI_PROVIDER || f.provider || '', url: process.env.AH_AI_URL || f.url || '', model: process.env.AH_AI_MODEL || f.model || '', key: process.env.AH_AI_KEY || f.key || '' }; }
const aiOn = () => { const c = aiConf(); return !!(c.provider && c.model && (c.provider === 'openai' ? c.url : c.key)); };
let aiCalls = [];
async function aiAsk(prompt) {
  const c = aiConf(); if (typeof fetch !== 'function') throw Object.assign(new Error('Node 18 or newer is needed for AI'), { code: 501 });
  const now = Date.now(); aiCalls = aiCalls.filter(t => now - t < 60000); if (aiCalls.length >= 20) throw Object.assign(new Error('busy'), { code: 429 }); aiCalls.push(now);
  if (c.provider === 'anthropic') {
    const r = await fetch((c.url || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: c.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || ('AI error ' + r.status)), { code: 502 });
    return (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  }
  if (c.provider === 'openai') {
    const h = { 'content-type': 'application/json' }; if (c.key) h.authorization = 'Bearer ' + c.key;
    const r = await fetch(c.url.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: h, body: JSON.stringify({ model: c.model, temperature: 0, messages: [{ role: 'system', content: 'Answer with JSON only.' }, { role: 'user', content: prompt }] }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j.error && (j.error.message || j.error)) || ('AI error ' + r.status)), { code: 502 });
    return ((j.choices || [])[0] || {}).message ? j.choices[0].message.content : '';
  }
  throw Object.assign(new Error('AI is not set up'), { code: 501 });
}
const aiBox = u => { const c = aiConf(); return `<div class="box"><h2 style="font-size:1.05rem;margin-top:0">AI for "Fill it in for me"</h2><p class="note">Status: ${aiOn() ? 'on (' + esc(c.provider === 'anthropic' ? 'Claude API' : 'own / OpenAI-compatible AI') + ', ' + esc(c.model) + ')' : 'off: the app uses its built-in reader'}.</p>${u.owner ? `<form method="post" action="admin/ai"><label>Which AI<select name="provider"><option value=""${!c.provider ? ' selected' : ''}>Off (built-in reader only)</option><option value="anthropic"${c.provider === 'anthropic' ? ' selected' : ''}>Claude API (Anthropic)</option><option value="openai"${c.provider === 'openai' ? ' selected' : ''}>Our own AI or another OpenAI-compatible service</option></select></label><label>Address (own AI only, e.g. http://office-pc:11434/v1)<input name="url" value="${esc(c.url)}"></label><label>Model (e.g. claude-haiku-5-5, or llama3.1 on your own AI)<input name="model" value="${esc(c.model)}"></label><label>API key ${c.key ? '(saved; leave blank to keep it)' : ''}<input name="key" type="password" autocomplete="off"></label><button type="submit">Save AI settings</button></form>` : '<p class="note">Only the owner can change this.</p>'}</div>`; };


/* ---------- training export by email ----------
   claude.ai's scheduled tasks can't reach this server, so once a day (after 3 pm Mountain) the server emails its
   training records (training + trmiles collections, plus the names of the people in them) as JSON to the A&H office
   inbox. The daily "training milestones and archive" task reads that email, sends the milestone emails and keeps the
   Drive training archive, the same as for records on claude.ai. Owner sets the outgoing mailbox on /admin. */
const MAIL_F = path.join(DATA, 'mail.json'), EXP_F = path.join(DATA, 'export.json');
function mailConf() { const f = readJSON(MAIL_F, {}); return { host: f.host || process.env.AH_SMTP_HOST || '', port: +(f.port || process.env.AH_SMTP_PORT || 465), user: f.user || process.env.AH_SMTP_USER || '', pass: f.pass || process.env.AH_SMTP_PASS || '', from: f.from || process.env.AH_SMTP_FROM || f.user || process.env.AH_SMTP_USER || '', to: f.to || process.env.AH_EXPORT_TO || 'info@anhservicesllc.com' }; }
const mailOn = () => { const c = mailConf(); return !!(c.host && c.user && c.pass && c.to); };
function smtpSend({ subject, text }) {
  const c = mailConf(), tls = require('tls');
  return new Promise((ok, bad) => {
    const sock = tls.connect({ host: c.host, port: c.port, servername: c.host, rejectUnauthorized: process.env.AH_SMTP_INSECURE !== '1' });
    let buf = '', step = 0; const t = setTimeout(() => { sock.destroy(); bad(new Error('mail server timed out')); }, 30000);
    const b64 = x => Buffer.from(x, 'utf8').toString('base64');
    const msg = [`From: A&H company server <${c.from}>`, `To: ${c.to}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${id(12)}@ah-company-server>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{1,76}/g, '$&\r\n')].join('\r\n');
    const steps = [[220, 'EHLO ah-company-server'], [250, 'AUTH LOGIN'], [334, b64(c.user)], [334, b64(c.pass)], [235, `MAIL FROM:<${c.from}>`], [250, `RCPT TO:<${c.to}>`], [250, 'DATA'], [354, msg + '\r\n.'], [250, 'QUIT']];
    sock.on('data', d => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (/^\d{3}-/.test(line)) continue; const code = +line.slice(0, 3);
      if (step >= steps.length) { clearTimeout(t); sock.end(); return ok(); }
      const [want, cmd] = steps[step]; if (code !== want) { clearTimeout(t); sock.destroy(); return bad(new Error(`mail server said: ${step === 4 ? 'login failed' : line.slice(0, 120)}`)); }
      sock.write(cmd + '\r\n'); step++; } });
    sock.on('error', e => { clearTimeout(t); bad(e); });
  });
}
const mtDate = d => new Date(d.getTime() - 7 * 3600e3).toISOString().slice(0, 10);
async function exportTraining(force, who) {
  const st = readJSON(EXP_F, {});
  const training = listCol(['training']).map(x => ({ id: x.id, ...x.data })), trmiles = listCol(['trmiles']).map(x => ({ id: x.id, ...x.data }));
  const uids = new Set([...training, ...trmiles].map(x => x.uid).concat(training.map(x => x.sign && x.sign.by)).filter(Boolean));
  const names = {}; users.filter(u => uids.has(u.id)).forEach(u => { names[u.id] = u.name || ''; });
  const body = { kind: 'ah-training-export', v: 1, from: 'app.anhservicesllc.com', at: new Date().toISOString(), names, training, trmiles };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ names, training, trmiles })).digest('hex');
  if (!force && (hash === st.hash || (!training.length && !trmiles.length))) { writeJSON(EXP_F, { ...st, checked: body.at }); return 'nothing new'; }
  try { await smtpSend({ subject: `A&H server training export ${mtDate(new Date())}`, text: JSON.stringify(body) });
    writeJSON(EXP_F, { ...st, hash, sentAt: body.at, checked: body.at, err: '', count: training.length + trmiles.length }); audit(who || 'server', `training export sent (${training.length} records, ${trmiles.length} milestones)`); return 'sent';
  } catch (e) { writeJSON(EXP_F, { ...st, checked: body.at, err: String(e.message || e).slice(0, 200), errAt: body.at }); audit(who || 'server', 'training export failed: ' + e.message); throw e; }
}
setInterval(() => { if (!mailOn()) return; const now = new Date(), st = readJSON(EXP_F, {}); const mtHour = (now.getUTCHours() + 24 - 7) % 24;
  if (mtHour >= 15 && (!st.checked || mtDate(new Date(st.checked)) !== mtDate(now))) exportTraining(false).catch(() => {}); }, 15 * 60e3).unref();
const mailBox = u => { const c = mailConf(), st = readJSON(EXP_F, {}); return `<div class="box"><h2 style="font-size:1.05rem;margin-top:0">Training updates to the office</h2><p class="note">Once a day after 3 pm the server emails new training progress to ${esc(c.to)}, so milestone emails and the Drive training archive include people who train here. Status: ${mailOn() ? 'on' : 'off: set the outgoing mailbox below'}${st.sentAt ? ' · last sent ' + esc(st.sentAt.slice(0, 16).replace('T', ' ')) + ' UTC' : ''}${st.err ? ` · <span class="err">last try failed: ${esc(st.err)}</span>` : ''}.</p>${u.owner ? `<form method="post" action="admin/mail"><label>Mail server (SiteGround: Site Tools > Email > Accounts > Mail configuration)<input name="host" value="${esc(c.host)}" placeholder="e.g. mail.anhservicesllc.com"></label><label>Port (SSL)<input name="port" value="${esc(String(c.port))}"></label><label>Mailbox login (email address)<input name="user" value="${esc(c.user)}"></label><label>Mailbox password ${c.pass ? '(saved; leave blank to keep it)' : ''}<input name="pass" type="password" autocomplete="off"></label><label>Send to<input name="to" value="${esc(c.to)}"></label><button type="submit">Save mail settings</button></form>${mailOn() ? '<form method="post" action="admin/export" style="margin-top:8px"><button class="ghost">Send training update now</button></form>' : ''}` : '<p class="note">Only the owner can change this.</p>'}</div>`; };

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u0 = url.parse(req.url, true), p = u0.pathname.replace(/\/+$/, '') || '/', q = u0.query, me = currentUser(req);
    const who = me ? me.email : '';

    if (p === '/api/health') return send(res, 200, { ok: true, app: 'ah-estimating', users: users.length > 0, ai: aiOn() });

    /* sign in / out / first run */
    if (p === '/login' && req.method === 'GET') return send(res, 200, loginPage('', users.length === 0), 'text/html; charset=utf-8');
    if (p === '/setup' && req.method === 'POST') {
      if (users.length) return redirect(res, 'login');
      const f = form(await readBody(req, 1e5));
      if (!f.email || String(f.password || '').length < 10) return send(res, 400, loginPage('Email and a password of 10+ characters are needed.', true), 'text/html; charset=utf-8');
      const u = makeUser({ ...f, admin: true }); u.owner = true; users.push(u); saveUsers(); audit(u.email, 'owner created'); startSession(res, req, u); return redirect(res, './');
    }
    if (p === '/login' && req.method === 'POST') {
      const f = form(await readBody(req, 1e5)); const u = users.find(x => x.email === String(f.email || '').trim().toLowerCase());
      if (!u || u.disabled || !checkPw(u, f.password || '')) { audit(f.email, 'sign-in refused'); return send(res, 401, loginPage('That email and password don\'t match an active user.', false), 'text/html; charset=utf-8'); }
      audit(u.email, 'signed in'); startSession(res, req, u); return redirect(res, './');
    }
    if (p === '/logout') { const t = cookies(req).ah_s; if (t) { delete sessions[t]; saveSess(); } res.setHeader('Set-Cookie', 'ah_s=; Path=/; Max-Age=0'); return redirect(res, 'login'); }

    /* the app itself */
    if (p === '/' || p === '/index.html' || p === '/app.html') {
      if (!me) return redirect(res, users.length ? 'login' : 'login');
      const f = path.join(ROOT, 'app.html'); if (!fs.existsSync(f)) return send(res, 500, 'app.html is missing next to server.js');
      return send(res, 200, fs.readFileSync(f), 'text/html; charset=utf-8');
    }

    /* user admin */
    if (p === '/admin' && req.method === 'GET') { if (!me) return redirect(res, 'login'); if (!me.admin) return send(res, 403, 'Admins only'); return send(res, 200, adminPage(me, q.m), 'text/html; charset=utf-8'); }
    if (p === '/admin/add' && req.method === 'POST') {
      if (!me || !me.admin) return send(res, 403, 'Admins only');
      const f = form(await readBody(req, 1e5)), em = String(f.email || '').trim().toLowerCase();
      if (!em || String(f.password || '').length < 10) return redirect(res, '../admin?m=' + encodeURIComponent('Email and a 10+ character password are needed.'));
      if (users.some(x => x.email === em)) return redirect(res, '../admin?m=' + encodeURIComponent('That email is already a user.'));
      users.push(makeUser({ email: em, name: f.name, password: f.password, admin: f.admin === '1' })); saveUsers(); audit(who, 'added ' + em); return redirect(res, '../admin');
    }
    if (p === '/admin/ai' && req.method === 'POST') {
      if (!me || !me.owner) return send(res, 403, 'Owner only');
      const f = form(await readBody(req, 1e5)), old = readJSON(AI_F, {}), prov = ['anthropic', 'openai'].includes(f.provider) ? f.provider : '';
      writeJSON(AI_F, { provider: prov, url: String(f.url || '').trim().slice(0, 300), model: String(f.model || '').trim().slice(0, 100), key: String(f.key || '').trim() || old.key || '' });
      audit(who, 'ai settings ' + (prov || 'off')); return redirect(res, '../admin?m=' + encodeURIComponent('AI settings saved'));
    }
    if (p === '/admin/mail' && req.method === 'POST') {
      if (!me || !me.owner) return send(res, 403, 'Owner only');
      const f = form(await readBody(req, 1e5)), old = readJSON(MAIL_F, {});
      writeJSON(MAIL_F, { host: String(f.host || '').trim().slice(0, 200), port: +f.port || 465, user: String(f.user || '').trim().slice(0, 200), pass: String(f.pass || '').trim() || old.pass || '', from: String(f.user || '').trim().slice(0, 200), to: String(f.to || '').trim().slice(0, 200) || 'info@anhservicesllc.com' });
      audit(who, 'mail settings saved'); return redirect(res, '../admin?m=' + encodeURIComponent('Mail settings saved'));
    }
    if (p === '/admin/export' && req.method === 'POST') {
      if (!me || !me.owner) return send(res, 403, 'Owner only');
      let m; try { m = await exportTraining(true, who) === 'sent' ? 'Training update sent.' : 'Nothing to send.'; } catch (e) { m = 'Could not send: ' + e.message; }
      return redirect(res, '../admin?m=' + encodeURIComponent(m));
    }
    if (p === '/admin/user' && req.method === 'POST') {
      if (!me || !me.admin) return send(res, 403, 'Admins only');
      const f = form(await readBody(req, 1e5)), u = users.find(x => x.id === f.id);
      if (!u || u.owner) return redirect(res, '../admin');
      if (f.do === 'admin') u.admin = true; else if (f.do === 'member') u.admin = false;
      else if (f.do === 'off') { u.disabled = true; endSessionsFor(u.id); }
      else if (f.do === 'on') u.disabled = false;
      else if (f.do === 'reset') { if (String(f.password || '').length < 10) return redirect(res, '../admin?m=' + encodeURIComponent('New password must be 10+ characters.')); u.salt = id(8); u.hash = hashPw(f.password, u.salt); endSessionsFor(u.id); }
      else return redirect(res, '../admin');
      saveUsers(); audit(who, `${f.do} ${u.email}`); return redirect(res, '../admin');
    }

    /* everything below needs a signed-in user */
    if (!me) return send(res, 401, { error: 'signed out' });

    if (p === '/api/ai' && req.method === 'POST') {
      if (!aiOn()) return send(res, 501, { error: 'AI is not set up' });
      const b = await readJSONBody(req), prompt = String((b && b.prompt) || '').slice(0, 60000); if (!prompt) return send(res, 400, { error: 'empty' });
      try { const text = await aiAsk(prompt); audit(who, 'ai fill ' + prompt.length); return send(res, 200, { text }); }
      catch (e) { return send(res, e.code || 502, { error: String(e.message || e).slice(0, 300) }); }
    }
    if (p === '/api/me') return send(res, 200, { id: me.id, name: me.name, email: me.email, admin: me.admin, owner: me.owner });
    if (p === '/api/users') return send(res, 200, users.filter(x => !x.disabled).map(x => ({ id: x.id, name: x.name })));
    if (p === '/api/rev') return send(res, 200, { rev });

    if (p === '/api/col' || p === '/api/doc') {
      const s = segs(q.path); const isCol = p === '/api/col';
      if (!s || (isCol ? s.length % 2 !== 1 : s.length % 2 !== 0)) return send(res, 400, { error: 'bad path' });
      if (req.method === 'GET') {
        if (!allowed(me, s, 'read')) return send(res, 403, { error: 'no access' });
        if (isCol) return send(res, 200, { docs: listCol(s), rev });
        const d = readDoc(s); return send(res, 200, { exists: d !== undefined, data: d === undefined ? null : d });
      }
      if (isCol) return send(res, 405, { error: 'method' });
      if (!allowed(me, s, 'write')) return send(res, 403, { error: 'no access' });
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = await readJSONBody(req); if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'object expected' });
        const v = req.method === 'PATCH' ? { ...(readDoc(s) || {}), ...body } : body;
        fs.mkdirSync(path.dirname(docFile(s)), { recursive: true }); writeJSON(docFile(s), v); rev++; audit(who, 'saved ' + s.join('/')); return send(res, 200, { ok: true, rev });
      }
      if (req.method === 'DELETE') { try { fs.unlinkSync(docFile(s)); } catch (e) {} rev++; audit(who, 'deleted ' + s.join('/')); return send(res, 200, { ok: true, rev }); }
      return send(res, 405, { error: 'method' });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(), ext = IMG_TYPES[type];
      if (!ext) return send(res, 415, { error: 'photos, videos and PDFs only' });
      const b = await readBody(req, MAX_UPLOAD), bid = id(16);
      fs.writeFileSync(path.join(BLOBS, bid + ext), b); writeJSON(path.join(BLOBS, bid + '.meta.json'), { type, by: me.id, at: new Date().toISOString(), bytes: b.length });
      audit(who, 'uploaded ' + bid); return send(res, 200, { id: bid, url: '/_blob/' + bid, sizeBytes: b.length, contentType: type });
    }
    if (p.startsWith('/_blob/')) {
      const bid = p.slice(7); if (!/^[a-f0-9]{32}$/.test(bid)) return send(res, 404, 'not found');
      const meta = readJSON(path.join(BLOBS, bid + '.meta.json'), null); if (!meta) return send(res, 404, 'not found');
      const f = path.join(BLOBS, bid + (IMG_TYPES[meta.type] || '')); if (!fs.existsSync(f)) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': meta.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" });
      return fs.createReadStream(f).pipe(res);
    }

    return send(res, 404, 'not found');
  } catch (e) {
    return send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? 'too large' : e.code === 400 ? 'bad request' : 'server error' });
  }
});
server.listen(PORT, () => console.log(`A&H app server on port ${PORT}. Data folder: ${DATA}`));
