'use strict';
/* Cost codes per job: tick groups or single codes on a job made without an estimate; job # channel and program (account) defaults load automatically; save picked codes as a new group. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

const mkJob = (p, extra) => p.evaluate(async (extra) => { const j = newJob('Service work'); Object.assign(j, { name: 'Test job', noEstimate: true, how: 'Service call' }, extra || {}); await saveItem('jobs', j); window._jbid = j.id; go('job'); return j.id; }, extra);
const codesOf = (p, id) => p.evaluate((id) => codesFor('job|' + id).map(c => String(c.code)), id);

test('pick groups and single codes on a job without an estimate', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  const id = await mkJob(p, { channel: 100 });
  await p.waitForTimeout(200);
  const all = await p.evaluate(() => CODES().length);
  assert.equal((await codesOf(p, id)).length, all, 'nothing picked: every code');
  await p.check(`[data-cbox="job|${id}"] [data-cg="Flooring"]`); await p.waitForTimeout(250);
  assert.deepStrictEqual((await codesOf(p, id)).sort(), ['010', '020', '120', '130', '800', '820', '830']);
  await p.click(`[data-cbox="job|${id}"] summary`);
  await p.check(`[data-cbox="job|${id}"] [data-cx="900"]`); await p.waitForTimeout(250);
  assert.ok((await codesOf(p, id)).includes('900'), 'single code added');
  assert.match(await p.locator(`[data-cbox="job|${id}"]`).innerText(), /Picked for this job/);
  // save as a group
  await p.click(`[data-cbox="job|${id}"] [data-cgsave]`); await p.waitForTimeout(150);
  await p.fill('#cgNew', 'HD floor install'); await p.click('[data-cgsave2]'); await p.waitForTimeout(250);
  const g = await p.evaluate(() => profiles().find(x => x.name === 'HD floor install'));
  assert.ok(g && g.codes.includes('900') && g.codes.includes('120'));
  assert.deepStrictEqual(await p.evaluate((id) => jobs.find(j => j.id === id).codeGroups, id), ['HD floor install']);
  assert.ok(await p.evaluate(() => profiles().some(x => x.name === 'Bathroom remodel')), 'starter groups kept');
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('a job # channel default loads on every job in that channel; program defaults come next', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  const a = await mkJob(p, { channel: 30 });
  await p.waitForTimeout(200);
  await p.check(`[data-cbox="job|${a}"] [data-cg="Countertops"]`); await p.waitForTimeout(250);
  await p.click(`[data-cbox="job|${a}"] [data-cchdef]`); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.evaluate(() => cfg.chCodes['30'].codeGroups), ['Countertops']);
  const b = await mkJob(p, { channel: 30 });
  await p.waitForTimeout(200);
  const S = await p.evaluate((id) => jobCodeSrc('job|' + id), b);
  assert.equal(S.src, 'channel');
  assert.deepStrictEqual((await codesOf(p, b)).sort(), ['010', '020', '040', '110', '800', '820', '830']);
  assert.match(await p.locator(`[data-cbox="job|${b}"]`).innerText(), /job # channel 30/);
  // program default when the channel has none
  await p.evaluate(async () => { const acc = { id: newId('A'), name: 'Home Depot', codeGroups: ['Flooring'] }; accounts.push(acc); await saveItem('accounts', acc); });
  const c = await mkJob(p, { channel: 100, account: 'Home Depot' });
  assert.equal(await p.evaluate((id) => jobCodeSrc('job|' + id).src, c), 'program');
  assert.ok((await codesOf(p, c)).includes('120'));
  // the channel box shows in Settings-style editor and saves
  await p.evaluate(() => { document.querySelector('#screen').innerHTML = chCodesHtml(); });
  assert.match(await p.locator('#screen').innerText(), /30 · HDI Services/);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('estimators pick cost code groups on the estimate; they carry to the won job', async () => {
  const app = await openApp({ role: 'est' });
  const p = app.page;
  const id = await p.evaluate(() => { const e = ests[0]; e.status = 'estimator'; openEstimate(e.id); return e.id; });
  await p.waitForTimeout(400);
  const box = p.locator(`[data-cbox="est|${id}"]`);
  assert.equal(await box.count(), 1, 'cost code box on the estimate');
  await box.locator('[data-cg="Steel building"]').check(); await p.waitForTimeout(300);
  assert.ok(await p.evaluate((id) => (ests.find(e => e.id === id).codeGroups || []).includes('Steel building'), id));
  assert.equal(await p.evaluate((id) => jobCodeSrc('est|' + id).src, id), 'job');
  await p.locator(`[data-cbox="est|${id}"] [data-cclear]`).click(); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.evaluate((id) => ests.find(e => e.id === id).codeGroups, id), []);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
