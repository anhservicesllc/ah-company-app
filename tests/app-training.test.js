'use strict';
/* Training: question banks, levels, milestones and the quiz flow. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

test('academies have the right courses and valid quiz questions', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => TRN.filter(a => a.courses).map(a => ({ id: a.id, n: a.courses.length, doc: a.doc,
    bad: a.courses.flatMap(c => (c.q.length !== 5 ? [c.c + ': ' + c.q.length + ' questions'] : []).concat(c.q.filter(q => !(q.a >= 0 && q.a < q.o.length) || !q.x).map(q => c.c + ': ' + q.p))),
    dup: a.courses.length - new Set(a.courses.map(c => c.c)).size })));
  const by = Object.fromEntries(r.map(a => [a.id, a]));
  assert.equal(by.pm.n, 17); assert.equal(by.cab.n, 17); assert.equal(by.est.n, 18);
  for (const a of r) { assert.deepEqual(a.bad, [], a.id + ' has bad questions'); assert.equal(a.dup, 0, a.id + ' duplicate codes'); assert.match(a.doc, /^https:\/\/claude\.ai\/artifact\//); }
  await app.close();
});

test('PM levels and milestones follow sign-offs, not quiz passes', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => {
    const uid = myId(), sign = c => trUp(trnP, { id: trKey(uid, c), uid, course: c, best: 100, passed: true, task: { note: 'x', at: '2026-11-01' }, sign: { by: 'u_x', at: '2026-11-01T10:00:00Z' } });
    trUp(trnP, { id: trKey(uid, 'PM-110'), uid, course: 'PM-110', best: 100, passed: true });   // passed, not signed
    ['PM-101', 'PM-102', 'PM-103', 'PM-104', 'PM-105', 'PM-106', 'PM-107', 'PM-109', 'PM-111'].forEach(sign);
    return { lv: trLevels(uid), miles: trMiles(uid).map(m => m.key) };
  });
  assert.equal(r.lv.done, 9);
  assert.match(r.lv.level, /^PM-I /);
  assert.ok(r.miles.length >= 2, 'first course and PM-I milestones: ' + r.miles.join(','));
  await app.close();
});

test('Estimating and Cabinet milestones', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => {
    const uid = myId();
    TRN_EST.slice(0, 9).concat(TRN_CAB.slice(0, 1)).forEach((c, i) => trUp(trnP, { id: trKey(uid, c.c), uid, course: c.c, best: 100, passed: true, task: { note: 'x', at: '2026-11-02' }, sign: { by: 'u_x', at: `2026-11-0${(i % 9) + 1}T10:00:00Z` } }));
    return trMiles(uid).map(m => m.key).sort();
  });
  assert.deepEqual(r, ['cab1', 'est1', 'est9']);
  await app.close();
});

test('quiz: wrong answers fail, right answers pass and are logged', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  await p.click('[data-v="training"]'); await p.waitForTimeout(300);
  const ans = await p.evaluate(() => TRN_EST.find(c => c.c === 'EST-107').q.map(q => q.a));
  await p.click('[data-trquiz="EST-107"]'); await p.waitForTimeout(200);
  for (let i = 0; i < ans.length; i++) await p.check(`[data-trans="${i}:${(ans[i] + 1) % 4}"]`);
  await p.click('[data-trsubmit]'); await p.waitForTimeout(300);
  assert.match(await p.$eval('.banner', x => x.innerText), /0%/);
  await p.click('[data-trretry]'); await p.waitForTimeout(200);
  for (let i = 0; i < ans.length; i++) await p.check(`[data-trans="${i}:${ans[i]}"]`);
  await p.click('[data-trsubmit]'); await p.waitForTimeout(300);
  assert.match(await p.$eval('.banner', x => x.innerText), /100% · Passed/);
  const rec = await p.evaluate(() => trnP.find(r => r.course === 'EST-107'));
  assert.equal(rec.passed, true); assert.equal(rec.tries, 2); assert.ok(rec.log.length >= 2);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('a supervisor cannot sign off their own course (the owner can)', async () => {
  const app = await openApp({ role: 'office', admin: false });
  const p = app.page;
  await p.evaluate(() => { const uid = myId(); trUp(trnP, { id: trKey(uid, 'CAB-101'), uid, course: 'CAB-101', best: 100, passed: true, task: { note: 'x', at: '2026-11-02' } }); });
  await p.click('[data-v="training"]'); await p.waitForTimeout(200);
  await p.click('[data-trtab="team"]'); await p.waitForTimeout(300);
  await p.click('[data-trac="cab"]'); await p.waitForTimeout(300);
  assert.equal((await p.$$('[data-trsign]')).length, 0);
  assert.match(await p.content(), /Someone else signs off your own courses/);
  await app.close();
  const own = await openApp({ role: 'office', admin: true });
  await own.page.evaluate(() => { const uid = myId(); trUp(trnP, { id: trKey(uid, 'CAB-101'), uid, course: 'CAB-101', best: 100, passed: true, task: { note: 'x', at: '2026-11-02' } }); });
  await own.page.click('[data-v="training"]'); await own.page.waitForTimeout(200);
  await own.page.click('[data-trtab="team"]'); await own.page.waitForTimeout(300);
  await own.page.click('[data-trac="cab"]'); await own.page.waitForTimeout(300);
  assert.equal((await own.page.$$('[data-trsign]')).length, 1, 'owner may sign off');
  await own.close();
});
