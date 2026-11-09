'use strict';
/* Employees & crews, crew assignment on jobs, and the phone layouts (job list rows, full-page preview). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser, defaultSeed } = require('./lib/harness');
after(closeBrowser);

const PHONE = { width: 390, height: 844 };
const jobsSeed = () => defaultSeed({
  'jobs/J-1001': { line: 'Service work', name: 'Replace water heater, Henderson', status: 'Scheduled', jobNo: '26-100-001', contract: '1850', schedDate: '2026-11-12' },
  'jobs/J-1002': { line: 'Remodel', name: 'Kitchen backsplash tile with a long name that has to wrap on a phone, Las Vegas', status: 'In progress', jobNo: '26-40-002', contract: '2400' },
  'staff/AHS-T-1': { name: 'Pat Example', position: 'Lead Carpenter', type: 'Full-time', active: true },
  'staff/AHS-T-2': { name: 'Sam Sample', position: 'Helper / Laborer', type: 'Full-time', active: true },
  'staff/AHS-T-3': { name: 'Old Hand', position: 'Helper', type: 'Full-time', active: false },
});

test('paste import reads only the safe columns, active only', async () => {
  const app = await openApp();
  const r = await app.page.evaluate(() => pplParse('Employee ID\tEmployee Name\tPosition\tDepartment\tEmployment Type\tStatus\tActive / Inactive\tHire Date\tSupervisor\tPhone Number\n' +
    'T-1\tPat Example\tLead Carpenter\tField\tFull-Time\tFull\tActive\t\t\t702-000-0000\nT-2\tOld Hand\tHelper\tLabor\tPart-Time\tPart\tInactive\nT-3\tSeason Guy\tSeasonal Employee\tSeasonal\tSeasonal\tSeasonal\tActive', true));
  assert.equal(r.length, 2);
  assert.deepEqual(Object.keys(r[0]).sort(), ['active', 'dept', 'empId', 'name', 'position', 'type']);
  assert.equal(r[0].type, 'Full-time'); assert.equal(r[1].type, 'Seasonal');
  assert.equal(JSON.stringify(r).includes('702'), false, 'no phone numbers kept');
  await app.close();
});

test('office makes a handyman crew and assigns it to a job; names show on the job and the board', async () => {
  const app = await openApp({ seed: jobsSeed(), role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('people')); await p.waitForTimeout(300);
  assert.match(await p.content(), /Pat Example/);
  assert.doesNotMatch(await p.content(), /Old Hand/, 'inactive hidden by default');
  await p.click('[data-crnew="Handyman"]'); await p.waitForTimeout(300);
  const cid = await p.evaluate(() => crews[0].id);
  await p.check(`[data-crm="${cid}|AHS-T-1"]`); await p.waitForTimeout(250);
  await p.check(`[data-crm="${cid}|AHS-T-2"]`); await p.waitForTimeout(250);
  await p.selectOption(`[data-crf="${cid}|lead"]`, 'AHS-T-1'); await p.waitForTimeout(250);
  const c = await p.evaluate(() => crews[0]);
  assert.equal(c.name, 'Handyman crew'); assert.deepEqual(c.members, ['AHS-T-1', 'AHS-T-2']); assert.equal(c.lead, 'AHS-T-1');
  await p.evaluate(() => { window._jbid = 'J-1001'; go('job'); }); await p.waitForTimeout(300);
  await p.selectOption('[data-jcrewid]', cid); await p.waitForTimeout(300);
  const j = await p.evaluate(() => jobs.find(x => x.id === 'J-1001'));
  assert.equal(j.crewName, 'Handyman crew'); assert.deepEqual(j.staffNames, ['Pat Example', 'Sam Sample']); assert.equal(j.staffLeadName, 'Pat Example');
  await p.click('[data-jsdet] summary'); await p.waitForTimeout(150);
  await p.uncheck('[data-jstaff="AHS-T-2"]'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => jobs.find(x => x.id === 'J-1001').staffIds), ['AHS-T-1']);
  await p.evaluate(() => { bdF().view = 'list'; go('board'); }); await p.waitForTimeout(300);
  assert.match(await p.content(), /Crew: Handyman crew: Pat Example \(lead\)/);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('saying "handyman crew" assigns it to a new job', async () => {
  const seed = jobsSeed(); seed['crews/CR-1001'] = { name: 'Handyman crew', type: 'Handyman', members: ['AHS-T-2'], lead: 'AHS-T-2', active: true };
  const app = await openApp({ seed, role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('newjob')); await p.waitForTimeout(300);
  await p.fill('#say_job', 'Service call, garbage disposal not working in Henderson 89052, send the handyman crew tomorrow, time and materials.');
  await p.click('[data-sayfill="job"]'); await p.waitForTimeout(900);
  const j = await p.evaluate(() => jobs[jobs.length - 1]);
  assert.equal(j.crewId, 'CR-1001'); assert.deepEqual(j.staffNames, ['Sam Sample']);
  await app.close();
});

test('field crew sees employees and crews read-only', async () => {
  const app = await openApp({ seed: jobsSeed(), role: 'crew', admin: false });
  await app.page.evaluate(() => go('people')); await app.page.waitForTimeout(300);
  const h = await app.page.$eval('#screen', e => e.innerHTML);
  assert.match(h, /Pat Example/); assert.doesNotMatch(h, /data-crnew|data-stnew|data-pplimport/);
  await app.close();
});

test('phone: the job list is tappable rows that fit the screen and open the job', async () => {
  const app = await openApp({ seed: jobsSeed(), viewport: PHONE, role: 'office' });
  const p = app.page;
  await p.evaluate(() => { delete window._bd; go('board'); }); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => bdF().view), 'list', 'phones open on the list');
  const rows = await p.$$eval('.jrow', els => els.map(e => { const r = e.getBoundingClientRect(); return { right: r.right, w: e.scrollWidth, cw: e.clientWidth, vis: r.width > 0 }; }));
  assert.equal(rows.length, 2);
  rows.forEach(r => { assert.ok(r.vis); assert.ok(r.right <= 390, 'row inside the screen'); assert.ok(r.w <= r.cw + 1, 'no clipped text'); });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll');
  assert.equal(await p.$eval('.jtable', e => getComputedStyle(e).display), 'none');
  await p.click('.jrow:has-text("26-100-001")'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => screen + '|' + window._jbid), 'job|J-1001');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('phone: a preview is a normal scrolling page and close returns to the app', async () => {
  const app = await openApp({ viewport: PHONE });
  const p = app.page;
  await p.evaluate(() => openPreview(propModel(ests[0]))); await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ on: document.body.classList.contains('pvon'), docH: document.documentElement.scrollHeight, main: getComputedStyle(document.querySelector('main')).display }));
  assert.ok(r.on); assert.equal(r.main, 'none'); assert.ok(r.docH > 1500, 'the page itself scrolls through the whole proposal');
  await p.click('[data-pvclose]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('main')).display), 'block');
  assert.deepEqual(app.errors, []);
  await app.close();
});
