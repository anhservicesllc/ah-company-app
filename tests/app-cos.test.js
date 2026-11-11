'use strict';
/* Change orders: To be determined price, edit later, upload documents. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

test('change order: TBD, edit to a price, re-approval rule, documents', async () => {
  const app = await openApp({ role: 'senior' });
  const p = app.page;
  await p.evaluate(() => { assets = { upload: async f => ({ id: 'd' + Math.random().toString(36).slice(2), url: '' }) }; const e = ests[0]; e.status = 'sent'; window._eT = e.id; openEstimate(e.id); });
  await p.waitForTimeout(500);
  await p.fill('#coDesc', 'Rotted subfloor under tub');
  await p.check('#coTbd');
  await p.click('[data-coadd]'); await p.waitForTimeout(300);
  let c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos);
  assert.equal(c.length, 1); assert.equal(c[0].tbd, true); assert.equal(c[0].price, 0);
  assert.match(await p.textContent('body'), /TBD/);
  // approve while TBD: stays out of totals
  await p.click('[data-cook="0|Approved"]'); await p.waitForTimeout(300);
  // upload a document
  await p.setInputFiles('input[data-codoc]', { name: 'subfloor-quote.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p.waitForTimeout(300);
  assert.match(await p.textContent('body'), /subfloor-quote\.pdf/);
  // edit: give it a cost
  await p.click('[data-coedit="0"]'); await p.waitForTimeout(200);
  await p.uncheck('#coeTbd'); await p.fill('#coeCost', '600'); await p.fill('#coeDesc', 'Replace rotted subfloor under tub');
  await p.click('[data-cosave="0"]'); await p.waitForTimeout(300);
  c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0]);
  assert.equal(c.tbd, undefined); assert.equal(c.cost, 600); assert.ok(c.price > 600); assert.equal(c.ok, 'Approved'); assert.equal(c.docs.length, 1); assert.equal(c.desc, 'Replace rotted subfloor under tub');
  // changing the price of an approved one sends it back for approval
  await p.click('[data-coedit="0"]'); await p.waitForTimeout(200);
  await p.fill('#coeCost', '800'); await p.click('[data-cosave="0"]'); await p.waitForTimeout(300);
  c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0]);
  assert.equal(c.ok, 'Waiting for customer'); assert.equal(c.cost, 800);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});
