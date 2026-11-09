'use strict';
/* Smoke test: every main tab opens without a JavaScript error, on desktop and phone, for each role. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const role of ['tech', 'est', 'senior', 'office', 'crew']) {
    test(`all tabs open (${label}, ${role})`, async () => {
      const app = await openApp({ viewport, role });
      const tabs = await app.page.$$eval('#tabs [data-v]', b => b.filter(x => x.offsetParent !== null || getComputedStyle(x).display !== 'none').map(x => x.dataset.v));
      assert.ok(tabs.length >= 5, 'tabs found: ' + tabs.join(','));
      const empty = [];
      for (const v of tabs) {
        await app.page.evaluate(v => document.querySelector(`#tabs [data-v="${v}"]`).click(), v);
        await app.page.waitForTimeout(250);
        const txt = await app.page.evaluate(() => (document.querySelector('#screen')?.innerText || '') + (document.querySelector('section:not([hidden])')?.innerText || ''));
        if (txt.trim().length < 20) empty.push(v);
      }
      assert.deepEqual(app.errors, [], 'page errors');
      assert.deepEqual(empty, [], 'tabs that rendered nothing');
      await app.close();
    });
  }
}

test('fixture estimate opens for every role without errors', async () => {
  const app = await openApp();
  for (const role of ['tech', 'est', 'senior', 'office']) {
    await app.setRole(role);
    await app.page.evaluate(() => openEstimate(ests[0].id)); await app.page.waitForTimeout(400);
  }
  assert.deepEqual(app.errors, []);
  await app.close();
});
