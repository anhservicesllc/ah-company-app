'use strict';
/* Business rules: Nevada deposit warning, who may approve, estimator self-approval under $5,000. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser, fixture, defaultSeed } = require('./lib/harness');
after(closeBrowser);

test('Nevada deposit warning shows when the deposit is over $1,000 / 10%', async () => {
  const app = await openApp({ role: 'office' });
  const r = await app.page.evaluate(() => {
    const e = ests[0];
    return { nv: nvPayWarn({ ...e, state: 'NV' }), ut: nvPayWarn({ ...e, state: 'UT' }) };
  });
  assert.match(r.nv, /Nevada deposit rule/);
  assert.equal(r.ut, '', 'no warning outside Nevada');
  await app.close();
});

test('estimators can self-approve only under $5,000 and at target margin', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => {
    const est = (cost, margin, d = 'Service') => ({ id: 'X', division: d, state: 'NV', scopes: [], extras: [{ desc: 'w', cost }], margin });
    return {
      small: selfOK(est(1000, '')),             // ~$1,818 at 45%
      lowMargin: selfOK(est(1000, 30)),         // under target
      big: selfOK(est(5000, '')),               // ~$9,091
      atLimit: selfOK(est(5000 * 0.55, '')),    // exactly $5,000: not "under"
    };
  });
  assert.equal(r.small, true);
  assert.equal(r.lowMargin, false);
  assert.equal(r.big, false);
  assert.equal(r.atLimit, false);
  await app.close();
});

test('approve button: senior only; estimator gets the small-job button', async () => {
  const e = fixture('estimate.json');
  const small = { ...e, id: 'E-SMALL', division: 'Service', margin: '', scopes: [], extras: [{ desc: 'Small repair', cost: 900 }], status: 'estimator' };
  const app = await openApp({ seed: defaultSeed({ ['estimates/E-SMALL']: small }), role: 'est' });
  await app.page.evaluate(() => openEstimate('E-SMALL')); await app.page.waitForTimeout(500);
  assert.ok(await app.page.$('#selfApprove'), 'estimator sees Approve and send');
  await app.page.click('#selfApprove'); await app.page.waitForTimeout(500);
  const after1 = await app.page.evaluate(() => { const x = ests.find(y => y.id === 'E-SMALL'); return { status: x.status, self: x.selfApproved }; });
  assert.deepEqual(after1, { status: 'sent', self: true });
  // the big fixture estimate: estimator can only send for approval
  await app.page.evaluate(id => openEstimate(id), e.id); await app.page.waitForTimeout(500);
  assert.equal(await app.page.$('#selfApprove'), null, 'no self-approval on a $32k estimate');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('only a Senior estimator can approve an estimate waiting for approval', async () => {
  const e = { ...fixture('estimate.json'), status: 'approval' };
  const app = await openApp({ seed: defaultSeed({ ['estimates/' + e.id]: e }), role: 'est' });
  await app.page.evaluate(id => openEstimate(id), e.id); await app.page.waitForTimeout(500);
  assert.equal(await app.page.$eval('#approve', b => b.disabled), true, 'estimator: disabled');
  await app.setRole('senior'); await app.page.evaluate(id => openEstimate(id), e.id); await app.page.waitForTimeout(500);
  assert.equal(await app.page.$eval('#approve', b => b.disabled), false, 'senior: enabled');
  await app.close();
});
