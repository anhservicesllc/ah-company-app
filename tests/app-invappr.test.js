'use strict';
/* Invoice approvals: PM approves, then the office approves and sends; changing the amount needs re-approval; exports locked until approved. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

test('PM approves → office approves → sent; amount change resets', async () => {
  const app = await openApp({ role: 'pm' });
  const p = app.page;
  await p.evaluate(() => { me.admin = false; const j = newJob('Service work'); j.name = 'Garbage disposal'; j.contract = 300; const i = { id: 'INV-A1', number: 'A1', src: 'job', ref: j.id, co: companies()[0].name, lines: [{ desc: 'Work', amt: 300 }], date: '2026-11-12', payments: [] }; invoices.push(i); window._iid = i.id; go('inv'); });
  await p.waitForTimeout(300);
  assert.match(await p.textContent('[data-invappr]'), /Needs PM approval/);
  assert.equal(await p.locator('button[data-invpdf]').isDisabled(), true);
  await p.click('button[data-invappr="pm"]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => invStage(invoices.find(x => x.id === 'INV-A1'))), 'Needs office approval');
  assert.equal(await p.locator('button[data-invappr="office"]').count(), 0, 'a PM cannot do the office step');
  await app.setRole('office'); await p.evaluate(() => go('inv')); await p.waitForTimeout(200);
  await p.click('button[data-invappr="office"]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => invStage(invoices.find(x => x.id === 'INV-A1'))), 'Ready to send');
  assert.equal(await p.locator('button[data-invpdf]').isDisabled(), false);
  await p.click('button[data-invappr="sent"]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => invStage(invoices.find(x => x.id === 'INV-A1'))), 'Sent');
  // change the amount: back to needing approval
  await p.evaluate(async () => { const i = invoices.find(x => x.id === 'INV-A1'); i.lines[0].amt = 350; await saveItem('invoices', i); renderScreen(); });
  assert.equal(await p.evaluate(() => invStage(invoices.find(x => x.id === 'INV-A1'))), 'Needs PM approval');
  assert.match(await p.textContent('[data-invappr]'), /amount changed since/);
  // older invoices are not affected
  assert.equal(await p.evaluate(() => invStage({ id: 'old', date: '2026-10-01', lines: [{ amt: 5 }], payments: [] })), '');
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('AI proposal writer: drafts wording from the description and estimate, asks questions, redrafts with answers', async () => {
  const app = await openApp({ role: 'senior' });
  const p = app.page;
  await p.evaluate(() => { window._prompts = []; window._aiEng = { json: async (pr) => { window._prompts.push(pr); return { questions: window._prompts.length === 1 ? ['Who supplies the shower valve?'] : [], summary: 'We will turn your tub into a walk-in shower.', sections: [{ index: 0, title: 'Walk-in shower', wording: ['Remove the tub', 'Build the shower pan', 'Tile to the ceiling'] }], provide: ['Shower valve and trim'], excluded: ['Painting outside the bathroom'] }; } }; const e = ests[0]; e.status = 'estimator'; window._eT = e.id; openEstimate(e.id); });
  await p.waitForTimeout(500);
  await p.fill('#propBrief', 'Tub to curbless shower, tile to ceiling');
  await p.click('[data-propaigo]'); await p.waitForTimeout(500);
  let e = await p.evaluate(() => { const e = ests.find(x => x.id === window._eT); return { sum: e.prop.summary, t: e.scopes[0].custTitle, d: e.scopes[0].custDesc, prov: e.prop.provide, ex: e.prop.excl, q: e.propAI.questions, prompt: window._prompts[0] }; });
  assert.equal(e.sum, 'We will turn your tub into a walk-in shower.'); assert.equal(e.t, 'Walk-in shower'); assert.equal(e.d, 'Remove the tub\nBuild the shower pan\nTile to the ceiling');
  assert.equal(e.prov, 'Shower valve and trim'); assert.equal(e.ex, 'Painting outside the bathroom'); assert.deepStrictEqual(e.q, ['Who supplies the shower valve?']);
  assert.match(e.prompt, /Tub to curbless shower, tile to ceiling/); assert.match(e.prompt, /"sections":\[/); assert.doesNotMatch(e.prompt, /"price"/);
  await p.fill('[data-propaia="0"]', 'Customer bought it'); await p.waitForTimeout(100);
  await p.click('[data-propaigo]'); await p.waitForTimeout(500);
  const pr2 = await p.evaluate(() => window._prompts[1]);
  assert.match(pr2, /Q: Who supplies the shower valve\?\nA: Customer bought it/);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
