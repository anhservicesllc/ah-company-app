'use strict';
/* Clock-out asks for the daily report first; filing it clocks you out; or clock out with a reason. View-only people are told why they can't clock in. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

async function clockInOn(p) {
  await p.evaluate(() => { const j = newJob('Service work'); j.name = 'Garbage disposal'; window._jk = 'job|' + j.id; const t = { id: newId('T'), by: myId(), role: role(), job: window._jk, code: '010', note: '', in: new Date(Date.now() - 3 * 3600e3).toISOString(), out: null, breaks: [], status: 'open', edits: [] }; tclock.push(t); go('time'); });
  await p.waitForTimeout(300);
}

test('Done for the day: report first, then clocked out automatically', async () => {
  const app = await openApp({ role: 'pm' });
  const p = app.page;
  await clockInOn(p);
  await p.click('[data-tcleave]'); await p.click('[data-tcdone]'); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-tcgate]').count(), 1);
  assert.ok(await p.evaluate(() => !!tcOpen(myId())), 'still clocked in');
  await p.click('[data-gatedo]'); await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => screen), 'dlog1');
  await p.evaluate(() => { dlMissing = () => []; renderScreen(); }); await p.waitForTimeout(200);
  await p.click('[data-dlsubmit]'); await p.click('[data-dlsubmit]'); await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => screen), 'time');
  assert.equal(await p.evaluate(() => !!tcOpen(myId())), false, 'clocked out after filing');
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('clock out without the report needs a reason that shows on the time card', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  await clockInOn(p);
  await p.click('[data-tcleave]'); await p.click('[data-tcdone]'); await p.waitForTimeout(300);
  await p.click('[data-gatewhy="1"]'); await p.waitForTimeout(100);
  await p.click('[data-gateskip]'); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => !!tcOpen(myId())), 'no reason, still clocked in');
  await p.fill('#gateWhy', 'Phone died'); await p.click('[data-gateskip]'); await p.waitForTimeout(300);
  const t = await p.evaluate(() => { const t = tclock.find(x => x.job === window._jk); return { out: !!t.out, why: t.noLogWhy }; });
  assert.deepStrictEqual(t, { out: true, why: 'Phone died' });
  assert.match(await p.textContent('body'), /No daily report/);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('someone not on the team list is told why they cannot clock in', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  await p.evaluate(() => { mode = 'shared'; me.admin = false; me.id = 'u_new'; team = [{ id: 'u_other', roles: ['crew'], active: true }]; teamLoaded = true; applyRoles(); go('time'); });
  await p.waitForTimeout(300);
  assert.match(await p.textContent('body'), /You can't clock in yet/);
  await app.close();
});

test('appointments carry calendar-feed copy; schedule shows the calendar links box', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  const fx = await p.evaluate(async () => { const a = { id: 'AP-T1', date: ldate(), time: '10:00', kind: 'Measure', label: 'Smith kitchen', loc: '12 Main St', who: [myId()], status: 'Scheduled' }; appts.push(a); await saveItem('appts', a); return a.fx; });
  assert.equal(fx.title, 'Smith kitchen'); assert.equal(fx.loc, '12 Main St'); assert.ok(fx.who.length >= 1); assert.ok(fx.cal);
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  assert.match(await p.textContent('body'), /See these appointments in Google, iPhone or Outlook/);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
