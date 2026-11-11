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

test('field crew can\'t open the employee list; it lives under Time for office', async () => {
  const app = await openApp({ seed: jobsSeed(), role: 'crew', admin: false });
  await app.page.evaluate(() => go('people')); await app.page.waitForTimeout(300);
  assert.notEqual(await app.page.evaluate(() => screen), 'people');
  assert.doesNotMatch(await app.page.$eval('#screen', e => e.innerHTML), /Pat Example/);
  await app.setRole('office'); await app.page.evaluate(() => go('time')); await app.page.waitForTimeout(300);
  await app.page.click('[data-tview="emp"]'); await app.page.waitForTimeout(300);
  assert.match(await app.page.$eval('#screen', e => e.innerHTML), /Pat Example/);
  await app.page.click('[data-empsel="AHS-T-1"]'); await app.page.waitForTimeout(300);
  assert.match(await app.page.$eval('#screen', e => e.innerText), /time card/i);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('tabs by role: Money and Subs & vendors are office only by default, and Settings can change it', async () => {
  const app = await openApp({ role: 'crew', admin: false });
  const vis = () => app.page.$$eval('#tabs [data-v]', b => b.filter(x => !x.hidden).map(x => x.dataset.v));
  let v = await vis();
  assert.ok(!v.includes('money') && !v.includes('vendors') && !v.includes('home'), v.join(','));
  assert.ok(v.includes('time') && v.includes('board'));
  await app.page.evaluate(() => go('money')); await app.page.waitForTimeout(200);
  assert.notEqual(await app.page.evaluate(() => screen), 'money', 'crew sent away from Money');
  await app.setRole('senior'); assert.ok(!(await vis()).includes('money'));
  await app.setRole('office'); v = await vis(); assert.ok(v.includes('money') && v.includes('vendors'));
  await app.page.evaluate(() => { cfg.tabRoles = { ...TAB_ROLES0, money: ['office', 'senior'] }; renderScreen(); });
  await app.setRole('senior'); assert.ok((await vis()).includes('money'));
  assert.deepEqual(app.errors, []);
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
  assert.equal(await p.evaluate(() => screen + '|' + window._dlj), 'dlog|job|J-1001');
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

test('home profile saves as you type and has Save / Done buttons', async () => {
  const app = await openApp({ seed: defaultSeed({ 'homes/H-1001': { address: '', city: '', state: 'NV', zip: '', systems: [{ name: 'Water heater', type: '', year: '', condition: '' }], photos: [], todo: [], finishes: [] } }), viewport: PHONE, role: 'office' });
  const p = app.page;
  await p.evaluate(() => { window._hid = 'H-1001'; go('home1'); }); await p.waitForTimeout(300);
  await p.fill('[data-hf="address"]', '100 Test Street'); await p.waitForTimeout(1000);
  assert.equal(await p.evaluate(() => window.__store.get('homes/H-1001').address), '100 Test Street', 'saved without leaving the field');
  assert.match(await p.textContent('#homeSaved'), /Saved/);
  await p.fill('[data-hf="city"]', 'Henderson');
  await p.click('[data-homedone]'); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => window.__store.get('homes/H-1001').city), 'Henderson');
  assert.equal(await p.evaluate(() => screen), 'homes');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('time from a sign-in not linked to an employee shows under Employees and can be linked', async () => {
  const s = jobsSeed();
  const day = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  s['timeclock/T-1'] = { by: 'u_rachael', in: day + 'T08:00:00', out: day + 'T12:00:00', job: 'job|J-1001', code: '920', status: 'open' };
  s['staff/AHS-EXE-1003'] = { name: 'Rachael Alexander', type: 'Full-time', active: true };
  const app = await openApp({ seed: s, role: 'office' });
  const p = app.page;
  await p.evaluate(() => { window._tview = 'emp'; go('time'); }); await p.waitForTimeout(400);
  const h = await p.$eval('#screen', e => e.innerText);
  assert.match(h, /not linked to an employee/i); assert.match(h, /4\.00 h this week/);
  await p.click('[data-empsel="uid:u_rachael"]'); await p.waitForTimeout(300);
  await p.selectOption('[data-tclink="u_rachael"]', 'AHS-EXE-1003'); await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => staffById('AHS-EXE-1003').uid), 'u_rachael');
  assert.match(await p.$eval('#screen', e => e.innerText), /4\.00 h/);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('a live update arriving mid-save does not wipe what was just typed', async () => {
  const app = await openApp({ seed: jobsSeed(), role: 'office' });
  const r = await app.page.evaluate(async () => {
    const j = jobs.find(x => x.id === 'J-1001');
    pendStart('jobs/J-1001'); j.name = 'Typed while saving';
    const stale = jobs.map(x => ({ ...x, name: x.id === 'J-1001' ? 'Old name from server' : x.name }));
    const kept = keepLocal('jobs', jobs, stale).find(x => x.id === 'J-1001').name;
    pendEnd('jobs/J-1001');
    return kept;
  });
  assert.equal(r, 'Typed while saving');
  await app.close();
});
