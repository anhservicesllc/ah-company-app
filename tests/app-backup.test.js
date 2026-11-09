'use strict';
/* Moving records from claude.ai to the company server with a backup file: pick what to bring in. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { openApp, closeBrowser, defaultSeed } = require('./lib/harness');
after(closeBrowser);

test('restore lets you choose; sign-in records from the other app start unticked', async () => {
  const a = await openApp({ seed: defaultSeed({
    'homes/H-1001': { address: '1 Test St', city: 'Cedar City', state: 'UT', zip: '84721', systems: [], photos: [], todo: [], finishes: [] },
    'accounts/A-1001': { name: 'Home Depot', type: 'Installer program', rates: [] },
    'staff/S1': { name: 'Pat Example', type: 'Full-time', active: true },
    'training/u_ron__MT-101': { uid: 'u_ron', course: 'MT-101', best: 100, passed: true } }) });
  const B = await a.page.evaluate(() => backupData());
  await a.close();
  assert.equal(B.from, 'claude.ai');
  const file = path.join(os.tmpdir(), 'ah-backup-test.json'); fs.writeFileSync(file, JSON.stringify(B));

  const s = await openApp({ seed: { 'config/main': defaultSeed()['config/main'] } });
  const p = s.page;
  await p.evaluate(() => { window._selfHost = true; });
  await p.click('#tabs [data-v="book"]'); await p.waitForTimeout(300);
  await p.setInputFiles('#bkFile', file); await p.waitForTimeout(300);
  const boxes = await p.$$eval('[data-bkcol]', b => Object.fromEntries(b.map(x => [x.dataset.bkcol, x.checked])));
  assert.equal(boxes.homes, true); assert.equal(boxes.accounts, true); assert.equal(boxes.staff, true);
  assert.equal(boxes.training, false, 'training records belong to claude.ai sign-ins');
  await p.uncheck('[data-bkcol="accounts"]');
  await p.click('[data-bkgo]'); await p.click('[data-bkgo]'); await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({ h: !!window.__store.get('homes/H-1001'), a: !!window.__store.get('accounts/A-1001'), s: !!window.__store.get('staff/S1'), t: !!window.__store.get('training/u_ron__MT-101') }));
  assert.deepEqual(st, { h: true, a: false, s: true, t: false });
  assert.deepEqual(s.errors, []);
  await s.close();
});
