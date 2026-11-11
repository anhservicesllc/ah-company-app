'use strict';
/* Crew job file: work order on top, Before/After photos that flow into the photographer's daily report, ticked ones added on submit. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('crew: work order + before/after on the job file, photos land in the daily report', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  const id = await p.evaluate(() => { assets = { upload: async f => ({ id: 'a' + Math.random().toString(36).slice(2), url: '' }) }; const j = newJob('Service work'); j.name = 'Garbage disposal'; j.scope = 'Replace 1/2 hp disposal under kitchen sink'; j.notes = 'Dog in back yard'; j.schedDate = '2026-11-12'; window._dlj = 'job|' + j.id; go('dlog'); return j.id; });
  await p.waitForTimeout(400);
  const wo = await p.textContent('[data-woinfo]');
  assert.match(wo, /Replace 1\/2 hp disposal/); assert.match(wo, /Dog in back yard/);
  // work order and before/after come before the daily log
  assert.ok(await p.evaluate(() => { const a = document.querySelector('[data-ba]'), h = [...document.querySelectorAll('h3')].find(x => x.textContent === 'Daily log'); return !!(a.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await p.setInputFiles('[data-ba] input[data-albtag="Before"][capture="environment"]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(300);
  await p.setInputFiles('[data-ba] input[data-albtag="After"][multiple]', [{ name: 'b.png', mimeType: 'image/png', buffer: PNG }, { name: 'c.png', mimeType: 'image/png', buffer: PNG }]);
  await p.waitForTimeout(400);
  assert.deepStrictEqual(await p.evaluate(() => jobInfo(window._dlj).obj.album.map(f => f.tag)), ['Before', 'After', 'After']);
  // daily report shows them ticked; untick one After, submit
  await p.click('[data-dlnew]'); await p.waitForTimeout(400);
  assert.equal(await p.locator('[data-dlbak]').count(), 3);
  await p.locator('[data-dlbak]').nth(2).uncheck(); await p.waitForTimeout(300);
  await p.evaluate(() => { dlMissing = () => []; renderScreen(); }); await p.waitForTimeout(200);
  await p.click('[data-dlsubmit]'); await p.click('[data-dlsubmit]'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const L = dlCur(); return { sub: L.submitted, tags: (L.photos || []).map(f => f.tag), inRep: jobInfo(L.job).obj.album.filter(f => f.dl).length }; });
  assert.equal(r.sub, true); assert.deepStrictEqual(r.tags, ['Before', 'After']); assert.equal(r.inRep, 2);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('punch list: each item needs a photo; photo of the fix after Mark done', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  await p.evaluate(() => { assets = { upload: async f => ({ id: 'a' + Math.random().toString(36).slice(2), url: '' }) }; const j = newJob('Service work'); j.name = 'Garbage disposal'; window._dlj = 'job|' + j.id; go('dlog'); });
  await p.waitForTimeout(400);
  await p.fill('#pText', 'Caulk sink edge'); await p.fill('#pArea', 'Kitchen');
  await p.click('[data-padd]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => punchItems.length), 0);
  assert.match(await p.textContent('body'), /Add a photo of the item first/);
  assert.equal(await p.inputValue('#pText'), 'Caulk sink edge');
  await p.setInputFiles('input[data-ppnew][capture="environment"]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(300);
  await p.click('[data-padd]'); await p.waitForTimeout(300);
  let it = await p.evaluate(() => punchItems.map(x => ({ t: x.text, a: x.area, ph: x.photos.map(f => f.tag) })));
  assert.deepStrictEqual(it, [{ t: 'Caulk sink edge', a: 'Kitchen', ph: ['Punch'] }]);
  await p.click('[data-pdone]'); await p.waitForTimeout(300);
  await p.setInputFiles('input[data-pfix][multiple]', { name: 'b.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(300);
  it = await p.evaluate(() => punchItems[0].photos.map(f => f.tag));
  assert.deepStrictEqual(it, ['Punch', 'Fixed']);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('60 photos: each saved as it uploads, survives a refresh mid-batch, all shown in See all', async () => {
  const app = await openApp({ role: 'pm' });
  const p = app.page;
  await p.evaluate(() => { let n = 0; assets = { upload: async f => { await new Promise(r => setTimeout(r, 5)); n++; if (n === 20) { const i = jobs.findIndex(x => x.id === window._jid); jobs[i] = JSON.parse(JSON.stringify(jobs[i])); } return { id: 'p' + n + Math.random().toString(36).slice(2), url: '' }; } }; const j = newJob('Service work'); j.name = 'Big job'; window._jid = j.id; window._dlj = 'job|' + j.id; go('dlog'); });
  await p.waitForTimeout(400);
  const files = Array.from({ length: 60 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: PNG }));
  await p.setInputFiles('[data-ba] input[data-albtag="Before"][multiple]', files);
  await p.waitForFunction(() => !window._upBusy && (jobs.find(x => x.id === window._jid).album || []).length === 60, null, { timeout: 20000 });
  await p.waitForTimeout(300);
  await p.click('[data-ba] [data-gal]'); await p.waitForTimeout(300);
  assert.equal(await p.locator('#galOv img').count(), 60);
  assert.match(await p.textContent('#galOv h2'), /\(60\)/);
  await p.click('[data-galclose]');
  assert.equal(await p.locator('#galOv').count(), 0);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
