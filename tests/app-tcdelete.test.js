'use strict';
/* Whole time entries can be deleted: needs a reason and a second tap; office can delete anyone's from the employee card; approved time is office-only. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

async function addEntry(p, extra) {
  return p.evaluate((extra) => { const d = new Date(); d.setHours(7, 0, 0, 0); const t = { id: newId('T'), by: myId(), role: role(), job: 'shop', code: '', note: '', in: d.toISOString(), out: new Date(d.getTime() + 4 * 3600e3).toISOString(), breaks: [], status: 'open', edits: [], ...extra }; tclock.push(t); go('time'); return t.id; }, extra || {});
}

test('delete my own entry: reason required, then tap twice', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  const id = await addEntry(p);
  await p.waitForTimeout(200);
  await p.click(`[data-tcedit="${id}"]`); await p.waitForTimeout(200);
  await p.click('[data-tedel]'); await p.waitForTimeout(100);
  assert.ok(await p.evaluate((id) => tclock.some(t => t.id === id), id), 'no reason, kept');
  await p.fill('#teWhy', 'Clocked in by mistake');
  await p.click('[data-tedel]'); await p.waitForTimeout(100);
  assert.ok(await p.evaluate((id) => tclock.some(t => t.id === id), id), 'first tap only arms');
  assert.match(await p.locator('[data-tedel]').innerText(), /Tap again/);
  await p.click('[data-tedel]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate((id) => tclock.some(t => t.id === id), id), false, 'deleted');
  assert.equal(await p.locator(`[data-tcedit="${id}"]`).count(), 0);
  const rec = await p.evaluate((id) => window.__store.get('timedel/' + id), id);
  assert.equal(await p.evaluate((id) => window.__store.has('timeclock/' + id), id), false, 'gone from the store');
  assert.equal(rec.why, 'Clocked in by mistake');
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('approved time: no delete for the worker, office can delete', async () => {
  let app = await openApp({ role: 'crew', admin: false });
  let p = app.page;
  let id = await addEntry(p, { status: 'approved' });
  assert.equal(await p.evaluate(() => canOffice()), false);
  assert.equal(await p.evaluate((id) => tcCanDel(tclock.find(t => t.id === id)), id), false);
  assert.equal(await p.evaluate((id) => tcCanDel({ ...tclock.find(t => t.id === id), status: 'submitted' }), id), true, 'own submitted time can still be deleted');
  await app.close();
  app = await openApp({ role: 'office' });
  p = app.page;
  id = await addEntry(p, { status: 'approved' });
  await p.waitForTimeout(200);
  await p.click(`[data-tcedit="${id}"]`); await p.waitForTimeout(200);
  assert.equal(await p.locator('[data-tedel]').count(), 1);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
