'use strict';
/* Office can type in a job # (e.g. one already used in the old tracker); duplicates are refused, linked invoices follow, and the next new number continues after it. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

test('change a job number to the old tracker number', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  const ids = await p.evaluate(async () => {
    const a = newJob('Home Depot program'); a.name = 'A'; a.channel = 10; a.jobNo = nextJobNo(10); await saveItem('jobs', a);
    const b = newJob('Home Depot program'); b.name = 'B'; b.channel = 10; b.jobNo = '26-10-777'; await saveItem('jobs', b);
    const i = newInvoice({ kind: 'created', src: 'job', ref: a.id, jobNo: a.jobNo, job: 'A', lines: [{ desc: 'Deposit', amt: 100 }] }); await saveItem('invoices', i);
    window._jbid = a.id; go('job'); return { a: a.id, b: b.id, inv: i.id, old: a.jobNo };
  });
  await p.waitForTimeout(200);
  await p.click(`[data-jned="job|${ids.a}"]`); await p.waitForTimeout(150);
  await p.fill('#jnIn', '26-10-777'); await p.click('[data-jnsave]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate((id) => jobs.find(j => j.id === id).jobNo, ids.a), ids.old, 'duplicate refused');
  await p.fill('#jnIn', '26-10-900'); await p.click('[data-jnsave]'); await p.waitForTimeout(250);
  assert.equal(await p.evaluate((id) => jobs.find(j => j.id === id).jobNo, ids.a), '26-10-900');
  assert.equal(await p.evaluate((id) => invoices.find(i => i.id === id).jobNo, ids.inv), '26-10-900', 'invoice follows');
  assert.equal(await p.evaluate(() => nextJobNo(10).split('-').slice(1).join('-')), '10-901', 'counter continues after the highest number');
  assert.match(await p.locator('#screen').innerText(), /26-10-900/);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('crew cannot change job numbers', async () => {
  const app = await openApp({ role: 'crew', admin: false });
  const p = app.page;
  await p.evaluate(async () => { const a = newJob('Service work'); a.jobNo = '26-100-050'; await saveItem('jobs', a); window._jbid = a.id; });
  assert.equal(await p.evaluate(() => jnEdit('job', window._jbid, '26-100-050').includes('data-jned')), false);
  await app.close();
});
