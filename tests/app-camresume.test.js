'use strict';
/* If the camera closes the page (common on tablets), the app saves the typed report first and comes back to the same daily report. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

test('tapping Take photo saves the report and the reload returns to it', async () => {
  const app = await openApp({ role: 'crew' });
  const p = app.page;
  const id = await p.evaluate(async () => { const j = newJob('Service work'); j.name = 'Garbage disposal'; await saveItem('jobs', j); const L = { id: newId('L'), job: 'job|' + j.id, date: ldate(), by: myId(), work: '', photos: [] }; dlogs.push(L); await saveItem('dlogs', L); window._dlid = L.id; go('dlog1'); return L.id; });
  await p.waitForTimeout(300);
  await p.evaluate((id) => { const L = dlogs.find(x => x.id === id); L.work = 'Set the new disposal'; dlQueue(L); }, id);
  p.on('filechooser', () => {}); /* keep the camera 'open', like a tablet that closes the page before returning */
  await p.evaluate(() => { const i = document.querySelector('input[data-dlphoto][capture]'); i.closest('label').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  await p.waitForTimeout(100);
  const saved = await p.evaluate((id) => window.__store.get('dlogs/' + id), id);
  assert.equal(saved.work, 'Set the new disposal', 'typed text saved before the camera opened');
  assert.ok(await p.evaluate(() => !!localStorage.getItem('ah-resume')));
  /* the test runtime's store doesn't survive a reload, so stand in for it: leave the screen, then run what boot runs */
  await p.evaluate(() => { window._dlid = null; go('board'); tryResume(); }); await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => screen), 'dlog1');
  assert.equal(await p.evaluate(() => window._dlid), id);
  assert.equal(await p.evaluate(() => localStorage.getItem('ah-resume')), null, 'used once');
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
