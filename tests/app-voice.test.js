'use strict';
/* "Say it all at once": voice/typed notes fill a new estimate, a job without an estimate, a daily log and a
   change order request. Tests use the built-in reader (no AI), so results are predictable. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser } = require('./lib/harness');
after(closeBrowser);

const fill = async (page, kind, text) => {
  await page.fill('#say_' + kind, text);
  await page.click(`[data-sayfill="${kind}"]`);
  await page.waitForTimeout(900);
};

test('reads phone, spoken email, address, city, ZIP, name, price and day', async () => {
  const app = await openApp();
  const f = await app.page.evaluate(() => sayFacts('New customer is John Smith, phone 702 555 0199, email john smith at gmail dot com, 1234 Desert Willow Drive, Henderson 89052. Agreed price $4,850, start tomorrow.'));
  assert.equal(f.name, 'John Smith');
  assert.equal(f.phone, '702-555-0199');
  assert.equal(f.email, 'johnsmith@gmail.com');
  assert.equal(f.addr, '1234 Desert Willow Drive');
  assert.equal(f.city, 'Henderson'); assert.equal(f.st, 'NV'); assert.equal(f.zip, '89052');
  assert.equal(f.price, 4850);
  const tomorrow = await app.page.evaluate(() => { const x = new Date(); x.setDate(x.getDate() + 1); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });
  assert.equal(f.date, tomorrow);
  const ut = await app.page.evaluate(() => sayFacts('Job in St George Utah for Mrs Garcia'));
  assert.equal(ut.st, 'UT'); assert.equal(ut.name, 'Garcia');
  await app.close();
});

test('new estimate: one spoken note fills the customer, intake and the work', async () => {
  const app = await openApp({ role: 'tech' });
  const p = app.page;
  await p.evaluate(() => go('new')); await p.waitForTimeout(300);
  const before = await p.evaluate(() => ests.length);
  await fill(p, 'est', 'New customer John Smith, 702 555 0199, 1234 Desert Willow Drive, Henderson 89052. Found us on Google. Master bath about 8 by 10, tub comes out for a walk-in shower with a glass door, tile floor, new 60 inch double vanity and toilet. Soft subfloor by the toilet. They live in the home, want it done in the next couple months.');
  const r = await p.evaluate(() => { const e = ests[ests.length - 1]; const c = e.custId ? custById(e.custId) : null;
    return { n: ests.length, screen, label: e.label, zip: e.zip, div: e.division, st: e.state, intake: e.intake, types: (e.scopes || []).map(s => s.type), cust: c && { name: c.name, phone: c.phone, addr: c.addr, city: c.city, zip: c.zip }, trail: e.trail.map(t => t.t).join(' | ') }; });
  assert.equal(r.n, before + 1);
  assert.equal(r.screen, 'wizard');
  assert.match(r.label, /Henderson/);
  assert.equal(r.zip, '89052'); assert.equal(r.div, 'Remodel'); assert.equal(r.st, 'NV');
  assert.equal(r.intake.source, 'Google search');
  assert.equal(r.intake.occupied, 'Yes');
  assert.equal(r.intake.timeline, 'Within 1–3 months');
  assert.ok(r.types.includes('bath') || r.types.includes('shower'), 'bath work added: ' + r.types.join(','));
  assert.deepEqual(r.cust, { name: 'John Smith', phone: '702-555-0199', addr: '1234 Desert Willow Drive', city: 'Henderson', zip: '89052' });
  assert.match(r.trail, /Filled by voice/);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('job without an estimate: emergency / insurance call', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  await p.click('[data-v="board"]'); await p.waitForTimeout(300);
  await p.click('[data-go="newjob"]'); await p.waitForTimeout(300);
  await fill(p, 'job', 'Emergency water heater leak for Maria Lopez, 2210 Desert Rose Drive, Henderson 89074, phone 702 555 0142. Insurance is State Farm, claim number SF-88231. Shut off and dry out, replace the water heater tomorrow. Bill to insurance.');
  const j = await p.evaluate(() => { const j = jobs[jobs.length - 1]; return { screen, how: j.how, billing: j.billing, account: j.account, ref: j.ref, sched: j.schedDate, status: j.status, jobNo: j.jobNo, zip: j.zip, city: j.city, cust: j.custId && custById(j.custId).name, onBoard: boardItems().some(x => x.kind === 'job' && x.id === j.id) }; });
  assert.equal(j.screen, 'job');
  assert.equal(j.how, 'Emergency / insurance'); assert.equal(j.billing, 'Insurance claim');
  assert.equal(j.account, 'State Farm'); assert.equal(j.ref, 'SF-88231');
  assert.equal(j.status, 'Scheduled'); assert.ok(j.sched);
  assert.ok(j.jobNo, 'job number assigned');
  assert.equal(j.zip, '89074'); assert.equal(j.city, 'Henderson');
  assert.equal(j.cust, 'Maria Lopez');
  assert.equal(j.onBoard, true);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('job without an estimate: price agreed by phone gets the Nevada contract reminder and a proposal', async () => {
  const app = await openApp({ role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('newjob')); await p.waitForTimeout(300);
  await fill(p, 'job', 'Customer agreed over the phone to replace the kitchen backsplash, about 30 square feet of tile, for $2,400. Bob Jones in Las Vegas 89123.');
  const j = await p.evaluate(() => { const j = jobs[jobs.length - 1]; return { how: j.how, billing: j.billing, contract: j.contract, line: j.line, name: j.name, jobNo: j.jobNo }; });
  assert.equal(j.name, 'Replace kitchen backsplash, Las Vegas');
  assert.match(j.jobNo, /^\d\d-40-\d{3}$/, 'remodel channel 40, not the Home Depot channel');
  assert.equal(j.how, 'Price agreed by phone'); assert.equal(j.billing, 'Flat price'); assert.equal(j.contract, '2400');
  assert.match(await p.content(), /Nevada: residential work over \$1,000 needs a written contract/);
  await p.click('[data-job2est]'); await p.waitForTimeout(800);
  const e = await p.evaluate(() => { const e = ests[ests.length - 1]; return { fromJob: e.fromJob, status: e.status, types: e.scopes.map(s => s.type), screen }; });
  assert.ok(e.fromJob); assert.equal(e.status, 'estimator');
  assert.ok(e.types.length > 0, 'work filled from what was said');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('program / builder job and service call are told apart', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => [sayJobLocal('Home Depot install, PO number 7734-221, cabinets for a kitchen in Henderson'), sayJobLocal('Service call, garbage disposal not working, bill time and materials')]);
  assert.equal(r[0].how, 'Program / builder job'); assert.equal(r[0].billing, 'Program rate card'); assert.equal(r[0].line, 'Home Depot program'); assert.equal(r[0].ref, '7734-221');
  assert.equal(r[1].how, 'Service / repair call'); assert.equal(r[1].billing, 'Time and materials'); assert.equal(r[1].line, 'Service work');
  await app.close();
});

test('daily log and change order request fill from one note', async () => {
  const app = await openApp({ role: 'crew', admin: false });
  const p = app.page;
  await p.evaluate(() => { const j = newJob('Service work'); j.name = 'Test job'; window._dlj = 'job|' + j.id; go('dlog'); });
  await p.waitForTimeout(300);
  await p.click('[data-dlnew]'); await p.waitForTimeout(400);
  await fill(p, 'dlog', 'Finished tiling the shower walls and set the niche. Plumber came out and set the valve. Thinset delivered, used 3 bags. Waiting on the glass, it is backordered. Homeowner asked about adding a grab bar. Tomorrow grout the walls.');
  const L = await p.evaluate(() => { const L = dlCur(); return { work: L.work, materials: L.materials, others: L.others, delay: L.delay, cust: L.cust, tomorrow: L.tomorrow }; });
  assert.match(L.work, /tiling the shower walls/);
  assert.match(L.others, /Plumber/);
  assert.match(L.materials, /Thinset delivered/);
  assert.equal(L.delay, 'Material');
  assert.match(L.cust, /grab bar/);
  assert.match(L.tomorrow, /grout/);
  await p.click('[data-dlback]'); await p.waitForTimeout(300);
  await p.click('[data-dlco]'); await p.waitForTimeout(300);
  await fill(p, 'co', 'Found rotted subfloor under the tub, about 4 by 5 feet, needs to be replaced before the pan goes in.');
  const co = await p.evaluate(() => ({ d: $('#crDesc').value, w: $('#crWhy').value, q: $('#crQty').value }));
  assert.match(co.d, /rotted subfloor/); assert.equal(co.w, 'Hidden damage'); assert.equal(co.q, '4 × 5 ft');
  assert.deepEqual(app.errors, []);
  await app.close();
});
