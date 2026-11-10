'use strict';
/* Calendars: appointments sit on a calendar; each role sees its calendars; Master shows all; office manages calendars. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser, defaultSeed } = require('./lib/harness');
after(closeBrowser);

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const seed = () => defaultSeed({
  'appts/A-1': { kind: 'Estimate visit', date: today(), time: '09:00', dur: 60, label: 'Visit Smith', status: 'Scheduled', who: [] },
  'appts/A-2': { kind: 'Install start', date: today(), time: '10:00', dur: 60, label: 'Install Jones', status: 'Scheduled', who: [] },
  'appts/A-3': { kind: 'Delivery', date: today(), time: '11:00', dur: 60, label: 'Tile delivery', status: 'Scheduled', who: [] },
  'appts/A-4': { kind: 'Other', date: today(), time: '12:00', dur: 60, label: 'Staff meeting', status: 'Scheduled', who: [], cal: 'cal-office' },
});
const shown = p => p.$eval('#screen', e => e.innerText);

test('each role sees its calendars; Master shows all of them', async () => {
  const app = await openApp({ seed: seed(), role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  let t = await shown(p);
  for (const x of ['Visit Smith', 'Install Jones', 'Tile delivery', 'Staff meeting']) assert.match(t, new RegExp(x));
  await p.click('[data-caltog="cal-vendor"]'); await p.waitForTimeout(200);
  assert.doesNotMatch(await shown(p), /Tile delivery/, 'vendor calendar hidden');
  await p.click('[data-calall]'); await p.waitForTimeout(200);
  assert.match(await shown(p), /Tile delivery/);
  await app.setRole('crew'); await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  t = await shown(p);
  assert.match(t, /Install Jones/); assert.doesNotMatch(t, /Visit Smith|Tile delivery|Staff meeting/);
  assert.equal(await p.$('[data-apnew]'), null, 'crew cannot add to the field calendar by default');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('pick the calendar, crew and vendor on an appointment', async () => {
  const s = seed(); s['crews/CR-1001'] = { name: 'Handyman crew', type: 'Handyman', members: [], active: true }; s['subs/V-1'] = { name: 'Tile Supply Co' };
  const app = await openApp({ seed: s, role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  await p.click('[data-apnew=""]'); await p.waitForTimeout(200);
  const opts = await p.$$eval('#apCal option', o => o.map(x => x.value));
  assert.deepEqual(opts.sort(), ['cal-est', 'cal-field', 'cal-office', 'cal-vendor']);
  await p.selectOption('#apCal', 'cal-field'); await p.selectOption('#apCrew', 'CR-1001'); await p.selectOption('#apVendor', 'V-1');
  await p.fill('#apLabel', 'Handyman visit');
  await p.click('[data-apsave]'); await p.waitForTimeout(300);
  const a = await p.evaluate(() => appts.find(x => x.label === 'Handyman visit'));
  assert.equal(a.cal, 'cal-field'); assert.equal(a.crewId, 'CR-1001'); assert.equal(a.vendorId, 'V-1');
  assert.match(await shown(p), /Crew: Handyman crew/);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('office adds a crew calendar and sets who can see it', async () => {
  const app = await openApp({ seed: seed(), role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  await p.click('[data-calmanage="1"]'); await p.waitForTimeout(200);
  await p.click('[data-calnew="Crew"]'); await p.waitForTimeout(300);
  const id = await p.evaluate(() => cals[cals.length - 1].id);
  await p.fill(`[data-calf="${id}|name"]`, 'Handyman crew'); await p.press(`[data-calf="${id}|name"]`, 'Tab'); await p.waitForTimeout(300);
  await p.uncheck(`[data-calr="${id}|view|crew"]`); await p.waitForTimeout(300);
  const c = await p.evaluate(id => cals.find(x => x.id === id), id);
  assert.equal(c.name, 'Handyman crew'); assert.ok(!c.view.includes('crew'));
  assert.equal(await p.evaluate(id => !!window.__store.get('calendars/' + id), id), true, 'saved');
  await app.setRole('tech'); await p.evaluate(() => go('schedule')); await p.waitForTimeout(200);
  assert.equal(await p.$('[data-calmanage]'), null, 'only office and senior manage calendars');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('who goes: tick employees by name (no sign-in needed) and type anyone else', async () => {
  const s = seed(); s['staff/S1'] = { name: 'Ronald A Alexander', type: 'Full-time', active: true }; s['staff/S2'] = { name: 'Sean Leavitt', type: 'Full-time', active: true };
  const app = await openApp({ seed: s, role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  await p.click('[data-apnew=""]'); await p.waitForTimeout(200);
  await p.check('[data-apstaff="S1"]'); await p.fill('#apWhoText', 'Plumber'); await p.fill('#apLabel', 'Walkthrough');
  await p.click('[data-apsave]'); await p.waitForTimeout(300);
  const a = await p.evaluate(() => appts.find(x => x.label === 'Walkthrough'));
  assert.deepEqual(a.staffIds, ['S1']); assert.equal(a.whoText, 'Plumber');
  assert.match(await shown(p), /Ronald A Alexander, Plumber/);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('month, 3-month, day and list views; tap a day to open it', async () => {
  const app = await openApp({ seed: seed(), role: 'office' });
  const p = app.page;
  await p.evaluate(() => go('schedule')); await p.waitForTimeout(300);
  await p.click('[data-calview="month"]'); await p.waitForTimeout(200);
  assert.ok(await p.$('.mgrid')); assert.match(await p.$eval('.mgrid', e => e.innerText), /Visit Smith/);
  await p.click('[data-calview="3m"]'); await p.waitForTimeout(200);
  assert.equal(await p.$$eval('.mgrid', g => g.length), 3);
  await p.click('[data-calnav="1"]'); await p.waitForTimeout(200);
  assert.doesNotMatch(await p.$eval('.m3', e => e.innerText), /Visit Smith/, 'moved 3 months ahead');
  await p.click('[data-calnav="0"]'); await p.waitForTimeout(200);
  const today = await p.evaluate(() => ldate());
  await p.click(`.m3 [data-calday="${today}"]`); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => calView()), 'day');
  assert.match(await shown(p), /Visit Smith/);
  await p.click('[data-calview="list"]'); await p.waitForTimeout(200);
  assert.match(await shown(p), /Install Jones/);
  assert.deepEqual(app.errors, []);
  await app.close();
});
