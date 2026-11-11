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

test('insurance proof for audit: lists subs paid in the dates and flags payments with no certificate', async () => {
  const s = defaultSeed({
    'subs/V-1': { name: 'Strata Electric LLC', kind: 'Sub', glFrom: '2026-01-01', glExp: '2026-12-31', wcFrom: '2026-01-01', wcExp: '2026-12-31',
      docs: [{ type: 'COI GL', from: '2025-01-01', exp: '2025-12-31', file: 'https://drive.google.com/old-gl' }, { type: 'COI WC', from: '2025-01-01', exp: '2025-06-30' }] },
    'subs/V-2': { name: 'Desert Tile', kind: 'Sub', wcExempt: true, glExp: '2026-12-31' },
    'costs/C-1': { job: 'x', kind: 'Sub', vendor: 'Strata Electric', amount: 1000, date: '2025-03-10' },
    'costs/C-2': { job: 'x', kind: 'Sub', vendor: 'Strata Electric', amount: 500, date: '2025-09-10' },
    'costs/C-3': { job: 'x', kind: 'Sub', vendor: 'Desert Tile', amount: 800, date: '2026-05-01' },
    'costs/C-4': { job: 'x', kind: 'Sub', vendor: 'Mystery Drywall', amount: 300, date: '2026-05-02' },
    'costs/C-5': { job: 'x', kind: 'Material', vendor: 'Home Depot', amount: 90, date: '2026-05-02' },
  });
  const app = await openApp({ seed: s, role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('vendors')); await p.waitForTimeout(300);
  const r = await p.evaluate(() => auditRows('2025-01-01', '2026-12-31').map(x => ({ name: x.name, n: x.pays.length, gaps: x.gaps, rec: !!x.v })));
  const by = Object.fromEntries(r.map(x => [x.name, x]));
  assert.equal(r.length, 3, 'materials are not listed');
  assert.deepEqual(by['Strata Electric LLC'].gaps, ['2025-09-10'], 'workers comp lapsed after June 2025');
  assert.equal(by['Strata Electric LLC'].n, 2, 'name without LLC still matches');
  assert.deepEqual(by['Desert Tile'].gaps, [], 'exempt from workers comp, GL assumed one year back from expiry');
  assert.equal(by['Mystery Drywall'].rec, false);
  await p.click('[data-auditbox] summary'); await p.waitForTimeout(100);
  await p.fill('[data-auf="from"]', '2025-01-01'); await p.locator('[data-auf="from"]').dispatchEvent('change'); await p.waitForTimeout(300);
  assert.match(await p.$eval('[data-auditbox]', e => e.innerText), /Not covered on Sep 10, 2025/i);
  assert.deepEqual(app.errors, []);
  await app.close();
});
