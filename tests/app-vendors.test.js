'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser, defaultSeed } = require('./lib/harness');
after(closeBrowser);

const seed = () => defaultSeed({ 'subs/V-1': { name: 'Strata Electric', kind: 'Sub', status: 'Existing contact', email: 'office@strata.test', contact: 'Sam' } });

test('vendors: request wording names Services as holder and both companies as additional insured; Drive folder link saves', async () => {
  const app = await openApp({ seed: seed(), role: 'office' });
  const p = app.page;
  await p.evaluate(() => { me.owner = true; go('vendors'); }); await p.waitForTimeout(300);
  const tpl = await p.evaluate(() => vreqTpl());
  assert.match(tpl, /Certificate holder: A&H Services LLC, 225 Carson Way/);
  assert.match(tpl, /Additional insured: A&H Services LLC and A&H Construction LLC/);
  assert.doesNotMatch(tpl, /list A&H Construction LLC .* as the certificate holder/);
  /* an old saved copy of the previous wording is treated as the standard wording */
  assert.equal(await p.evaluate(() => { cfg.vendReq = { tpl: VREQ_TPL_OLD }; return vreqTpl() === VREQ_TPL0; }), true);
  const needs = await p.evaluate(() => vNeeds(subs[0]).join('\n'));
  assert.match(needs, /naming A&H Services LLC and A&H Construction LLC as additional insured/);
  await p.click('[data-vedit="V-1"]'); await p.waitForTimeout(200);
  await p.fill('#vf_driveFolder', 'https://example.com/x'); await p.click('[data-vsave]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => subs[0].driveFolder || ''), '', 'non-Drive link refused');
  await p.fill('#vf_driveFolder', 'https://drive.google.com/drive/folders/abc123'); await p.click('[data-vsave]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => subs[0].driveFolder), 'https://drive.google.com/drive/folders/abc123');
  assert.equal(await p.locator('a[href="https://drive.google.com/drive/folders/abc123"]').count() > 0, true, 'Drive folder button shown');
  assert.deepEqual(app.errors, []);
  await app.close();
});
