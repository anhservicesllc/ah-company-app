'use strict';
/* Daily log photos: Take photo (camera) and Upload buttons for every role; each photo keeps the role; photos can be added later to a filed log. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

for (const role of ['crew', 'pm', 'tech']) {
  test(`daily log photo buttons work for ${role}`, async () => {
    const app = await openApp({ role, admin: true });
    const p = app.page;
    await p.evaluate(() => { assets = { upload: async f => ({ id: 'a' + Math.random().toString(36).slice(2), url: '' }) }; const j = newJob('Service work'); j.name = 'Test job'; window._dlj = 'job|' + j.id; go('dlog'); });
    await p.waitForTimeout(300);
    await p.click('[data-dlnew]'); await p.waitForTimeout(400);
    assert.equal(await p.locator('input[data-dlphoto][capture="environment"]').count(), 1);
    assert.equal(await p.locator('input[data-dlphoto][multiple]').count(), 1);
    await p.setInputFiles('input[data-dlphoto][capture="environment"]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForTimeout(400);
    const ph = await p.evaluate(() => dlCur().photos);
    assert.equal(ph.length, 1); assert.equal(ph[0].role, role); assert.equal(ph[0].tag, 'During');
    // file it, then add a photo later
    await p.evaluate(async () => { const L = dlCur(); L.submitted = true; await saveItem('dlogs', L); renderScreen(); });
    await p.waitForTimeout(300);
    await p.setInputFiles('input[data-dllate][multiple]', [{ name: 'b.png', mimeType: 'image/png', buffer: PNG }, { name: 'c.png', mimeType: 'image/png', buffer: PNG }]);
    await p.waitForTimeout(500);
    const ph2 = await p.evaluate(() => dlCur().photos.map(x => x.tag));
    assert.deepStrictEqual(ph2, ['During', 'Added later', 'Added later']);
    assert.deepStrictEqual(app.errors, []);
    await app.close();
  });
}

test('photos on an estimate and a job file: take or upload, tag, whole-house item ticks, remove', async () => {
  const app = await openApp({ role: 'tech' });
  const p = app.page;
  await p.evaluate(() => { assets = { upload: async f => ({ id: 'a' + Math.random().toString(36).slice(2), url: '' }) }; });
  const eid = await p.evaluate(() => ests[0].id);
  await p.evaluate(id => openEst ? openEst(id) : null, eid).catch(() => {});
  await p.evaluate(id => { window._albKeyTest = 'est|' + id; document.body.insertAdjacentHTML('beforeend', '<div id="albT">' + albumHtml('est|' + id, { title: 'Estimate photos', tags: JOB_PHOTOS }) + '</div>'); }, eid);
  await p.selectOption(`#albT select[id="albTag-est|${eid}"]`, 'Main water shut-off');
  await p.setInputFiles(`#albT input[data-alb][capture="environment"]`, { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForTimeout(400);
  let e = await p.evaluate(id => { const e = ests.find(x => x.id === id); return { a: e.album, jp: e.jobPhotos }; }, eid);
  assert.equal(e.a.length, 1); assert.equal(e.a[0].tag, 'Main water shut-off'); assert.equal(e.a[0].role, 'tech'); assert.equal(e.jp['Main water shut-off'], true);
  // job file
  await app.setRole('pm');
  await p.evaluate(() => { const j = newJob('Service work'); j.name = 'Test job'; window._dlj = 'job|' + j.id; go('dlog'); });
  await p.waitForTimeout(400);
  assert.match(await p.textContent('[data-album]'), /Job photos/);
  await p.setInputFiles('[data-album] input[data-alb][multiple]', [{ name: 'b.png', mimeType: 'image/png', buffer: PNG }, { name: 'c.png', mimeType: 'image/png', buffer: PNG }]);
  await p.waitForTimeout(500);
  let a = await p.evaluate(() => jobInfo(window._dlj).obj.album.map(x => x.role + ':' + x.tag));
  assert.deepStrictEqual(a, ['pm:During', 'pm:During']);
  await p.click('[data-albrm]'); await p.click('[data-albrm]'); await p.waitForTimeout(300);
  a = await p.evaluate(() => jobInfo(window._dlj).obj.album.length);
  assert.equal(a, 1);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
