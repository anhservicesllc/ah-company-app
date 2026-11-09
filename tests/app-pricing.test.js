'use strict';
/* Pricing engine: the math every estimate depends on. Expected values are worked out here by hand,
   independently of the app, so a change to the engine shows up as a failing test. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser, fixture } = require('./lib/harness');
after(closeBrowser);
const near = (a, b, tol = 0.01, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('price = cost / (1 - margin), not cost x (1 + markup)', async () => {
  const app = await openApp();
  const p = await app.page.evaluate(() => priceOf({ cost: 10000, lab: 0, sell: 0 }, 0.42));
  near(p, 10000 / 0.58, 0.01, '42% margin');
  assert.ok(p > 14200, 'a 42% markup ($14,200) would be under-priced');
  await app.close();
});

test('labor bills at the higher of cost-based price and the customer rate', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => ({
    sell: sellRate(),
    p: priceOf({ cost: 1000, lab: 410, sell: 1025 }, 0.42),   // 10 hrs: $41 cost, $102.50 blended rate
    p2: priceOf({ cost: 1000, lab: 410, sell: 100 }, 0.42)
  }));
  near(r.sell, 102.5, 0.001, 'blended lead/helper rate');
  near(r.p, 590 / 0.58 + 1025, 0.01, 'customer rate wins');
  near(r.p2, 590 / 0.58 + 410 / 0.58, 0.01, 'cost-based price wins');
  await app.close();
});

test('unit price adds waste and Nevada tax to material, then margin', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => ({ lvp: unitSell('FLR-LVP', 1, 'Remodel', 'NV'), it: cfg.book['FLR-LVP'], m: cfg.margin.Remodel, tax: cfg.tax.NV }));
  const mat = (1 + r.it.waste) * r.it.mat[1] * (1 + r.tax / 100), sub = r.it.sub[1];
  near(r.lvp, (mat + sub) / (1 - r.m / 100), 0.01, 'LVP Better per sq ft');
  await app.close();
});

test('minimum job raises small estimates to the division minimum', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => {
    const t = d => totals({ id: 'T', division: d, state: 'NV', scopes: [], extras: [{ desc: 'small', cost: 100 }], margin: '' });
    return { rem: t('Remodel'), svc: t('Service'), min: cfg.minJob };
  });
  near(r.rem.price, r.min.Remodel, 0.01, 'Remodel minimum');
  near(r.svc.price, r.min.Service, 0.01, 'Service minimum');
  assert.ok(r.rem.minAdj > 0, 'shows the minimum adjustment');
  await app.close();
});

test('fixture estimate prices the same as before (regression snapshot)', async () => {
  const app = await openApp();
  const e = fixture('estimate.json');
  const t = await app.page.evaluate(id => totals(ests.find(x => x.id === id)), e.id);
  // Snapshot taken Nov 9, 2026 (app Version 85). If this changes on purpose, update the number and say why in the PR.
  near(t.price, 31999.85, 0.5, 'fixture price');
  assert.ok(t.gm >= e.margin - 0.01, `gross margin ${t.gm} is at least the estimate margin (labor at the customer rate can lift it)`);
  await app.close();
});

test('margin and markup targets in the live price book', async () => {
  const app = await openApp();
  const c = await app.page.evaluate(() => ({ margin: cfg.margin, rate: cfg.rate, minJob: cfg.minJob, selfLimit: cfg.selfLimit, bigJob: cfg.bigJob }));
  assert.deepEqual(c.margin, { 'Installer programs': 30, Remodel: 42, Service: 45 });
  assert.equal(c.rate, 41);
  assert.equal(c.bigJob, 25000);
  assert.equal(c.selfLimit, 5000);
  await app.close();
});
