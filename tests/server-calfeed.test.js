'use strict';
/* Calendar subscription feeds: private link per person, "mine" vs "all", role filtering, new link kills the old one. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const ROOT = path.join(__dirname, '..');
let srv, base, cookie = '';
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-cal-')), port = await freePort(); base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port), AH_DATA: dataDir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { if (srv) srv.kill(); });
const go = async (p, o = {}) => { const r = await fetch(base + p, { redirect: 'manual', ...o, headers: { ...(o.headers || {}), ...(cookie ? { cookie } : {}) } }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r; };
const form = (p, f) => go(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
const put = (p, b) => go('/api/doc?path=' + p, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const post = (p, b) => go(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('feeds: mine, all, revoke', async () => {
  await form('/setup', { name: 'Owner', email: 'owner@test.com', password: 'owner-password-1' });
  const me = await (await go('/api/me')).json();
  const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  await put('appts/A1', { date: day, time: '09:30', dur: 90, kind: 'Measure', status: 'Scheduled', notes: 'Gate code at office', fx: { title: 'Smith; kitchen', loc: '12 Main St, Henderson', cal: 'Estimators', who: [me.id], whoNames: 'Owner' } });
  await put('appts/A2', { date: day, time: '13:00', kind: 'Install start', status: 'Scheduled', fx: { title: 'Jones bath', who: ['u_other'] } });
  await put('appts/A3', { date: day, kind: 'Delivery', status: 'Canceled', fx: { title: 'Canceled one' } });
  let f = await (await post('/api/calfeed', { scope: 'mine' })).json();
  assert.match(f.mine, /^[a-f0-9]{40}$/); assert.equal(f.all, null);
  const r = await fetch(base + '/cal/' + f.mine + '.ics');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/calendar/);
  const ics = await r.text();
  assert.match(ics, /BEGIN:VCALENDAR/); assert.ok(ics.includes('SUMMARY:Measure – Smith\\; kitchen')); assert.match(ics, /DTSTART;TZID=America\/Denver:\d{8}T093000/); assert.match(ics, /DTEND;TZID=America\/Denver:\d{8}T110000/);
  assert.ok(ics.includes('LOCATION:12 Main St\\, Henderson')); assert.doesNotMatch(ics, /Jones bath/); assert.doesNotMatch(ics, /Canceled one/);
  f = await (await post('/api/calfeed', { scope: 'all' })).json();
  const all = await (await fetch(base + '/cal/' + f.all + '.ics')).text();
  assert.match(all, /Jones bath/); assert.match(all, /Smith/); assert.doesNotMatch(all, /Canceled one/);
  const old = f.mine; f = await (await post('/api/calfeed', { scope: 'mine' })).json();
  assert.notEqual(f.mine, old);
  assert.equal((await fetch(base + '/cal/' + old + '.ics')).status, 404, 'old link stops working');
  f = await (await post('/api/calfeed', { scope: 'all', off: true })).json(); assert.equal(f.all, null);
  assert.equal((await fetch(base + '/cal/0000000000000000000000000000000000000000.ics')).status, 404);
});
