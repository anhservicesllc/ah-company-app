'use strict';
/* Company server (server.js): sign-in, access rules, records, admin, and the daily training email. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), tls = require('tls');
const ROOT = path.join(__dirname, '..');

const freePort = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
let srv, base, dataDir, smtp, smtpPort, mails = [];

async function startServer() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-test-'));
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port), AH_DATA: dataDir, AH_SMTP_INSECURE: '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start');
}
/* tiny cookie-keeping client */
function client() {
  let cookie = '';
  const go = async (p, o = {}) => {
    const r = await fetch(base + p, { redirect: 'manual', ...o, headers: { ...(o.headers || {}), ...(cookie ? { cookie } : {}) } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  const form = (p, f) => go(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  const json = (p, method, body) => go(p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { go, form, json };
}

/* fake TLS mail server that records what it receives */
function startSmtp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-smtp-'));
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' }); }
  catch (e) { return null; }
  return new Promise(ok => {
    smtp = tls.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, s => {
      s.write('220 test\r\n'); let buf = '', inData = false, msg = '', step = 0;
      s.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (l === '.') { inData = false; mails.push(msg); msg = ''; s.write('250 ok\r\n'); } else msg += l + '\n'; continue; }
        if (l.startsWith('EHLO')) s.write('250-test\r\n250 AUTH LOGIN\r\n');
        else if (l === 'AUTH LOGIN') { step = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
        else if (step === 1) { step = 2; s.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (step === 2) { step = 3; s.write(Buffer.from(l, 'base64').toString() === 'right-password' ? '235 ok\r\n' : '535 no\r\n'); }
        else if (l.startsWith('MAIL') || l.startsWith('RCPT')) s.write('250 ok\r\n');
        else if (l === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (l === 'QUIT') { s.write('221 bye\r\n'); s.end(); } } });
    }).listen(0, () => { smtpPort = smtp.address().port; ok(true); });
  });
}

before(startServer);
after(() => { if (srv) srv.kill(); if (smtp) smtp.close(); });

const owner = client(), member = client();

test('health check before and after the owner exists', async () => {
  let h = await (await fetch(base + '/api/health')).json();
  assert.equal(h.ok, true); assert.equal(h.users, false);
  const r = await owner.form('/setup', { email: 'owner@test.local', name: 'Owner', password: 'owner-password-1' });
  assert.equal(r.status, 303);
  h = await (await fetch(base + '/api/health')).json();
  assert.equal(h.users, true);
  const me = await (await owner.go('/api/me')).json();
  assert.equal(me.owner, true);
});

test('second /setup is refused once an owner exists', async () => {
  const r = await client().form('/setup', { email: 'x@test.local', password: 'another-password' });
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /login/);
  const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json')));
  assert.equal(users.length, 1);
});

test('signed-out requests get no data', async () => {
  const r = await fetch(base + '/api/col?path=estimates');
  assert.equal(r.status, 401);
});

test('owner adds a member; wrong password is refused; right one works', async () => {
  let r = await owner.form('/admin/add', { name: 'Field Tech', email: 'tech@test.local', password: 'member-password-1', admin: '' });
  assert.equal(r.status, 303);
  r = await member.form('/login', { email: 'tech@test.local', password: 'wrong-password' });
  assert.equal(r.status, 401);
  r = await member.form('/login', { email: 'tech@test.local', password: 'member-password-1' });
  assert.equal(r.status, 303);
  assert.equal((await (await member.go('/api/me')).json()).admin, false);
});

test('records: save, merge, list, delete', async () => {
  let r = await member.json('/api/doc?path=training/u_x__CAB-101', 'PUT', { course: 'CAB-101', best: 80 });
  assert.equal(r.status, 200);
  r = await member.json('/api/doc?path=training/u_x__CAB-101', 'PATCH', { best: 100 });
  const d = await (await member.go('/api/doc?path=training/u_x__CAB-101')).json();
  assert.deepEqual(d.data, { course: 'CAB-101', best: 100 });
  const col = await (await member.go('/api/col?path=training')).json();
  assert.equal(col.docs.length, 1);
  r = await member.go('/api/doc?path=training/u_x__CAB-101', { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal((await (await member.go('/api/col?path=training')).json()).docs.length, 0);
});

test('access rules match claude.ai', async () => {
  const put = (c, p) => c.json('/api/doc?path=' + p, 'PUT', { a: 1 });
  assert.equal((await put(member, 'office/private/pay/x')).status, 403, 'member cannot write private office records');
  assert.equal((await member.go('/api/doc?path=office/private/pay/x')).status, 403, 'or read them');
  assert.equal((await put(member, 'office/private/customers/c1')).status, 403, 'member cannot change customers');
  assert.equal((await member.go('/api/col?path=office/private/customers')).status, 200, 'but can read them');
  assert.equal((await put(member, 'office/private/custreq/r1')).status, 200, 'member can file customer requests');
  assert.equal((await put(owner, 'office/private/pay/x')).status, 200, 'owner can');
});

test('bad paths are rejected', async () => {
  for (const p of ['../../etc/passwd', 'estimates/..', 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p', 'estimates']) {
    const r = await member.json('/api/doc?path=' + encodeURIComponent(p), 'PUT', { a: 1 });
    assert.equal(r.status, 400, p);
  }
});

test('members cannot open the admin page', async () => {
  assert.equal((await member.go('/admin')).status, 403);
  assert.equal((await member.form('/admin/add', { email: 'z@test.local', password: 'zzzzzzzzzzzz' })).status, 403);
});

test('daily training email: sends records with names; wrong password reported', async t => {
  if (!(await startSmtp())) { t.skip('openssl not available'); return; }
  await member.json('/api/doc?path=training/u_t__CAB-101', 'PUT', { uid: 'u_t', course: 'CAB-101', best: 100, passed: true });
  const me = await (await member.go('/api/me')).json();
  await member.json('/api/doc?path=trmiles/' + me.id + '__cab1', 'PUT', { uid: me.id, key: 'cab1', title: 'First Cabinet Academy course completed' });
  let r = await owner.form('/admin/mail', { host: 'localhost', port: String(smtpPort), user: 'server@test.local', pass: 'wrong', to: 'office@test.local' });
  assert.equal(r.status, 303);
  r = await owner.form('/admin/export', {});
  assert.match(decodeURIComponent(r.headers.get('location')), /login failed/);
  await owner.form('/admin/mail', { host: 'localhost', port: String(smtpPort), user: 'server@test.local', pass: 'right-password', to: 'office@test.local' });
  r = await owner.form('/admin/export', {});
  assert.match(decodeURIComponent(r.headers.get('location')), /sent/);
  assert.equal(mails.length, 1);
  const [head, body] = mails[0].split('\n\n');
  assert.match(head, /Subject: A&H server training export \d{4}-\d{2}-\d{2}/);
  assert.match(head, /To: office@test\.local/);
  const j = JSON.parse(Buffer.from(body.replace(/\s/g, ''), 'base64').toString());
  assert.equal(j.kind, 'ah-training-export'); assert.equal(j.from, 'app.anhservicesllc.com');
  assert.equal(j.training.length, 1); assert.equal(j.trmiles.length, 1);
  assert.equal(j.names[me.id], 'Field Tech');
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'mail.json')));
  assert.equal(saved.pass, 'right-password', 'password kept on the server only');
});

test('data stays outside the app folder', async () => {
  assert.ok(fs.existsSync(path.join(dataDir, 'db')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'data', 'db', 'training')), 'nothing written beside server.js');
});

test('admins fix a typo in a name or email; the person signs in with the new email', async () => {
  const add = await owner.form('/admin/add', { name: 'Rachael aaLEXANDER', email: 'typo@test.local', password: 'typo-password-1', admin: '' });
  assert.equal(add.status, 303);
  const id = (await (await owner.go('/api/users')).json()).find(u => u.name === 'Rachael aaLEXANDER').id;
  let r = await owner.form('/admin/edit', { id, name: 'Rachael Alexander', email: 'tech@test.local' });
  assert.match(decodeURIComponent(r.headers.get('location')), /already used/);
  r = await owner.form('/admin/edit', { id, name: 'Rachael Alexander', email: 'rachael@test.local' });
  assert.match(decodeURIComponent(r.headers.get('location')), /sign in with rachael@test\.local/);
  assert.ok((await (await owner.go('/api/users')).json()).some(u => u.name === 'Rachael Alexander'));
  const c = client();
  assert.equal((await c.form('/login', { email: 'typo@test.local', password: 'typo-password-1' })).status, 401);
  assert.equal((await c.form('/login', { email: 'rachael@test.local', password: 'typo-password-1' })).status, 303);
  assert.equal((await member.form('/admin/edit', { id, name: 'X', email: 'x@test.local' })).status, 403, 'members cannot edit');
});
