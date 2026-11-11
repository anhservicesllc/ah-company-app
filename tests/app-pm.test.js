'use strict';
/* Project manager role: shows in "Working as", has job-management tabs, and time cards carry the role clocked in under. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser, defaultSeed, fixture } = require('./lib/harness');
after(closeBrowser);

test('project manager: tabs, clock in under the role, switch role mid-shift', async () => {
  const app = await openApp({ role: 'pm' });
  const { page } = app;
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#role option')].some(o => o.value === 'pm' && o.textContent === 'Project manager')));
  const tabs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#tabs button[data-v]')].map(b => [b.dataset.v, !b.hidden])));
  assert.strictEqual(tabs.board, true); assert.strictEqual(tabs.vendors, true); assert.strictEqual(tabs.money, false);
  assert.strictEqual(await page.evaluate(() => canOffice()), true);
  await page.evaluate(() => go('time')); await page.waitForTimeout(300);
  assert.match(await page.textContent('[data-tcin]'), /Clock in as Project manager/);
  await page.click('[data-tcin]'); await page.waitForTimeout(300);
  let T = await page.evaluate(() => tclock.map(t => ({ role: t.role, out: t.out })));
  assert.deepStrictEqual(T.map(t => t.role), ['pm']);
  assert.match(await page.textContent('#view, body'), /as Project manager/);
  await app.setRole('crew'); await page.evaluate(() => go('time')); await page.waitForTimeout(300);
  await page.click('[data-tcrole]'); await page.waitForTimeout(300);
  T = await page.evaluate(() => tclock.map(t => ({ role: t.role, closed: !!t.out })));
  assert.deepStrictEqual(T, [{ role: 'pm', closed: true }, { role: 'crew', closed: false }]);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('tab and calendar settings saved before the role existed still let a PM in', async () => {
  const cfg = fixture('config.json');
  cfg.tabRoles = { home: ['tech', 'est', 'senior', 'office'], board: ['tech', 'est', 'senior', 'office', 'crew', 'view'], money: ['office'] };
  const app = await openApp({ seed: defaultSeed({ 'config/main': cfg }), role: 'pm' });
  const { page } = app;
  assert.strictEqual(await page.evaluate(() => tabOK('board')), true);
  assert.strictEqual(await page.evaluate(() => tabOK('money')), false);
  assert.strictEqual(await page.evaluate(() => calCan({ view: ['senior'], edit: ['senior'] }, 'edit')), true);
  assert.strictEqual(await page.evaluate(() => calCan({ view: ['senior'], edit: [], pmSet: 1 }, 'view')), false);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
