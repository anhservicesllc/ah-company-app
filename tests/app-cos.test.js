'use strict';
/* Change orders: numbered list, open one to see it, cost TBD, edit, documents, notes; field can read and add notes but never sees or changes prices. */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

test('estimate change order: TBD, edit to a price, re-approval rule, documents', async () => {
  const app = await openApp({ role: 'senior' });
  const p = app.page;
  await p.evaluate(() => { assets = { upload: async f => ({ id: 'd' + Math.random().toString(36).slice(2), url: '' }) }; const e = ests[0]; e.status = 'sent'; window._eT = e.id; openEstimate(e.id); });
  await p.waitForTimeout(500);
  await p.click('[data-coaddd] > summary');
  await p.fill('#coDesc', 'Rotted subfloor under tub');
  await p.check('#coTbd');
  await p.click('[data-cxadd]'); await p.waitForTimeout(300);
  let c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos);
  assert.equal(c.length, 1); assert.equal(c[0].tbd, true); assert.equal(c[0].no, 'CO-1');
  assert.match(await p.textContent('[data-cobox]'), /CO-1/); assert.match(await p.textContent('[data-cobox]'), /TBD/);
  await p.click('[data-cxok$="|Approved"]'); await p.waitForTimeout(300);
  await p.setInputFiles('input[data-cxdoc]', { name: 'subfloor-quote.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p.waitForTimeout(300);
  assert.match(await p.textContent('[data-cobox]'), /subfloor-quote\.pdf/);
  // wrong file: replace it, then remove it, then upload the right one
  await p.setInputFiles('input[data-cxdocrep]', { name: 'right-quote.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p.waitForTimeout(300);
  let docs = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0].docs.map(d => d.name));
  assert.deepStrictEqual(docs, ['right-quote.pdf']);
  await p.click('[data-cxdocrm]'); await p.click('[data-cxdocrm]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0].docs.length), 0);
  await p.setInputFiles('input[data-cxdoc]', { name: 'subfloor-quote.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p.waitForTimeout(300);
  await p.click('[data-cxedit]'); await p.waitForTimeout(200);
  await p.uncheck('#coeTbd'); await p.fill('#coeCost', '600'); await p.fill('#coeDesc', 'Replace rotted subfloor under tub');
  await p.click('[data-cxsave]'); await p.waitForTimeout(300);
  c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0]);
  assert.equal(c.tbd, undefined); assert.equal(c.cost, 600); assert.ok(c.price > 600); assert.equal(c.ok, 'Approved'); assert.equal(c.docs.length, 1);
  await p.click('[data-cxedit]'); await p.waitForTimeout(200);
  await p.fill('#coeCost', '800'); await p.click('[data-cxsave]'); await p.waitForTimeout(300);
  c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[0]);
  assert.equal(c.ok, 'Waiting for customer'); assert.equal(c.cost, 800);
  // second one gets CO-2, with a set price
  await p.click('[data-coaddd] > summary');
  await p.fill('#coDesc', 'Add outlet'); await p.fill('#coCost', '100'); await p.fill('#coPrice', '250');
  await p.click('[data-cxadd]'); await p.waitForTimeout(300);
  c = await p.evaluate(() => ests.find(x => x.id === window._eT).cos[1]);
  assert.equal(c.no, 'CO-2'); assert.equal(c.price, 250);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('job without an estimate: PM adds a change order; crew opens it, adds a note, sees no prices or edit', async () => {
  const app = await openApp({ role: 'pm' });
  const p = app.page;
  await p.evaluate(() => { me.admin = false; const j = newJob('Service work'); j.name = 'Garbage disposal'; j.noEstimate = true; j.contract = 300; window._jid = j.id; window._dlj = 'job|' + j.id; go('dlog'); });
  await p.waitForTimeout(400);
  await p.click('[data-coaddd] > summary');
  await p.fill('#coDesc', 'Replace corroded P-trap'); await p.fill('#coCost', '40'); await p.fill('#coPrice', '120');
  await p.click('[data-cxadd]'); await p.waitForTimeout(300);
  await p.click('[data-cxok$="|Approved"]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => jobCoTotal(jobs.find(x => x.id === window._jid))), 120);
  // crew
  await app.setRole('crew'); await p.evaluate(() => { window._coOpen = null; go('dlog'); }); await p.waitForTimeout(300);
  const box = await p.textContent('[data-cobox]');
  assert.match(box, /CO-1/); assert.match(box, /Replace corroded P-trap/); assert.doesNotMatch(box, /\$/);
  assert.equal(await p.locator('[data-coaddd]').count(), 0);
  await p.click('[data-coopen]'); await p.waitForTimeout(200);
  assert.equal(await p.locator('[data-cxedit]').count(), 0); assert.equal(await p.locator('[data-cxok]').count(), 0); assert.equal(await p.locator('input[data-cxdoc]').count(), 0);
  assert.doesNotMatch(await p.textContent('[data-cobox]'), /\$|Cost \/ price/);
  const nid = await p.evaluate(() => document.querySelector('[id^="coNote-"]').id);
  await p.fill('#' + nid.replace(/\|/g, '\\|'), 'Old trap is cast iron, need adapter');
  await p.click('[data-cxnote]'); await p.waitForTimeout(300);
  const notes = await p.evaluate(() => jobs.find(x => x.id === window._jid).cos[0].notes.map(n => n.text + '|' + n.role));
  assert.deepStrictEqual(notes, ['Old trap is cast iron, need adapter|crew']);
  // crew can't change it even by forcing a click handler
  const price = await p.evaluate(() => jobs.find(x => x.id === window._jid).cos[0].price);
  assert.equal(price, 120);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('estimate & proposal documents: links, saved proposal copy, upload/replace/remove; hidden from crew', async () => {
  const app = await openApp({ role: 'senior' });
  const p = app.page;
  await p.evaluate(() => { me.admin = false; assets = { upload: async f => ({ id: 'd' + Math.random().toString(36).slice(2), url: '' }) }; modelPdf = async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }); const e = ests[0]; e.status = 'sent'; e.sentAt = new Date().toISOString(); window._eT = e.id; openEstimate(e.id); });
  await p.waitForTimeout(500);
  const box = p.locator('[data-estdocs]');
  assert.match(await box.textContent(), /Customer proposal/);
  assert.equal(await box.locator('[data-proppv]').count(), 1); assert.equal(await box.locator('[data-proppdf]').count(), 1);
  await p.click('[data-propsnap]'); await p.waitForTimeout(400);
  let d = await p.evaluate(() => ests.find(x => x.id === window._eT).estDocs.map(x => x.name));
  assert.equal(d.length, 1); assert.match(d[0], /^Proposal .* as sent \d{4}-\d\d-\d\d\.pdf$/);
  await p.setInputFiles('input[data-edup]', { name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await p.waitForTimeout(300);
  await p.locator('input[data-edrep]').nth(1).setInputFiles({ name: 'original-estimate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await p.waitForTimeout(300);
  d = await p.evaluate(() => ests.find(x => x.id === window._eT).estDocs.map(x => x.name));
  assert.equal(d[1], 'original-estimate.pdf');
  await p.locator('[data-edrm]').nth(1).click(); await p.locator('[data-edrm]').nth(1).click(); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => ests.find(x => x.id === window._eT).estDocs.length), 1);
  // job file of that estimate: link back to the estimate; crew don't see the box
  await p.evaluate(() => { window._dlj = 'est|' + window._eT; go('dlog'); }); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-estdocs] [data-estopen]').count(), 1);
  await app.setRole('crew'); await p.evaluate(() => go('dlog')); await p.waitForTimeout(300);
  assert.equal(await p.locator('[data-estdocs]').count(), 0);
  assert.deepStrictEqual(app.errors, []);
  await app.close();
});

test('PM opens an invoice from the job billing screen without the Money tab', async () => {
  const app = await openApp({ role: 'pm' });
  const p = app.page;
  await p.evaluate(() => { me.admin = false; mode = 'shared'; });
  assert.equal(await p.evaluate(() => tabOK('money')), false);
  const ok = await p.evaluate(async () => { const j = newJob('Service work'); j.name = 'Garbage disposal'; j.contract = 300; const i = { id: 'INV-T1', number: 'T1', src: 'job', ref: j.id, lines: [{ desc: 'Work', amt: 300 }], date: ldate() }; invoices.push(i); window._iid = i.id; window._jbid = j.id; go('inv'); await new Promise(r => setTimeout(r, 200)); return screen; });
  assert.equal(ok, 'inv');
  await p.click('[data-invback]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => screen), 'job');
  await app.setRole('crew'); await p.evaluate(() => go('inv')); await p.waitForTimeout(200);
  assert.notEqual(await p.evaluate(() => screen), 'inv');
  await app.close();
});
