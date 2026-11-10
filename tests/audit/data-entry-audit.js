'use strict';
/* Data-entry audit: runs the real company server with real-shaped records, signs in as the owner, opens every
   screen, types into every box / changes every dropdown and checkbox, then RELOADS and checks what was kept.
   Also checks every search box filters, and whether the screen showed any "saved" feedback.
   Usage: node tests/audit/data-entry-audit.js <backup.json> [report.json]
   Not part of npm test (slow, needs a backup file); run it before a big release. */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const pw = require(process.env.PW_MODULE || 'playwright');
const freePort = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

/* every screen and how to open it; `state` sets what a detail screen needs */
const SCREENS = [
  ['Estimates list', () => go('home')],
  ['Estimate (office view)', () => { const e = ests.find(x => !isFieldStage(x)) || ests[0]; go('estimate', e.id); }],
  ['Estimate wizard (visit)', () => { const e = ests.find(x => isFieldStage(x)) || ests[0]; go('wizard', e.id, stepsOf(e)[0]); }],
  ['New estimate', () => go('new')],
  ['Job board', () => go('board')],
  ['Job without an estimate (new)', () => go('newjob')],
  ['Job (no estimate)', () => { window._jbid = jobs[0] && jobs[0].id; go('job'); }],
  ['Job file / daily logs', () => { const j = jobs[0]; window._dlj = j ? 'job|' + j.id : ''; go('dlog'); }],
  ['Calendar', () => go('schedule')],
  ['Time', () => { window._tview = ''; go('time'); }],
  ['Time → Employees', () => { window._tview = 'emp'; window._empSel = null; go('time'); }],
  ['Employee time card', () => { window._tview = 'emp'; window._empSel = staff[0] && staff[0].id; go('time'); }],
  ['Employees & crews', () => go('people')],
  ['Customers', () => go('customers')],
  ['Customer', () => { window._cuid = customers[0] && customers[0].id; go('cust1'); }],
  ['Homes', () => go('homes')],
  ['Home profile', () => { window._hid = homes[0] && homes[0].id; go('home1'); }],
  ['Accounts', () => go('accounts')],
  ['Account', () => { window._aid = accounts[0] && accounts[0].id; go('account'); }],
  ['Subs & vendors', () => go('vendors')],
  ['Money', () => go('money')],
  ['Invoices list', () => go('invlist')],
  ['Invoice', () => { window._iid = invoices[0] && invoices[0].id; go('inv'); }],
  ['Collections', () => go('collect')],
  ['Reports', () => go('reports')],
  ['Marketing', () => go('marketing')],
  ['Training', () => go('training')],
  ['Price book', () => go('book')],
];

const SEARCHY = el => el.type === 'search' || /search|find|filter/i.test(el.placeholder + ' ' + (el.getAttribute('aria-label') || '') + ' ' + el.id) || /q$/i.test(Object.keys(el.dataset).join(' ')) || (el.labels && el.labels[0] && /search|find|filter/i.test(el.labels[0].textContent));

async function main() {
  const bkFile = process.argv[2], outFile = process.argv[3] || path.join(os.tmpdir(), 'ah-audit.json');
  const B = JSON.parse(fs.readFileSync(bkFile, 'utf8'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-audit-')), db = path.join(dataDir, 'db');
  for (const [c, arr] of Object.entries(B.collections)) for (const it of arr) { const { id, ...d } = it; const f = path.join(db, ...c.split('/'), id + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d)); }
  if (B.docs && B.docs['config/main']) { fs.mkdirSync(path.join(db, 'config'), { recursive: true }); fs.writeFileSync(path.join(db, 'config', 'main.json'), JSON.stringify(B.docs['config/main'])); }
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port), AH_DATA: dataDir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  const browser = await pw.chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  console.log('browser up');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/login');
  await page.fill('input[name=name]', 'Audit Owner'); await page.fill('input[name=email]', 'owner@audit.test'); await page.fill('input[name=password]', 'audit-password-1');
  await page.click('button'); await page.waitForTimeout(2500); console.log('signed in:', page.url());
  page.setDefaultTimeout(4000);
  const setRole = async r => { await page.evaluate(r => { const s = document.querySelector('#role'); if (s) { s.value = r; s.dispatchEvent(new Event('change', { bubbles: true })); } }, r); await page.waitForTimeout(300); };
  await setRole('office');
  const report = [];

  for (const [name, nav] of SCREENS.filter(([n]) => !process.env.ONLY || n.includes(process.env.ONLY))) {
    const open = async () => { await page.evaluate(nav); await page.waitForTimeout(900); };
    const errBefore = errors.length;
    try { await open(); } catch (e) { report.push({ screen: name, error: 'could not open: ' + e.message }); continue; }
    const scr = await page.evaluate(() => screen);
    /* list the controls with a selector that survives a redraw */
    const ctrls = await page.evaluate(SEARCHY_SRC => {
      const SEARCHY = eval(SEARCHY_SRC); const out = [];
      document.querySelectorAll('#screen input, #screen select, #screen textarea').forEach((el, i) => {
        if (el.type === 'hidden' || el.type === 'file' || el.type === 'button' || el.type === 'submit' || el.disabled || el.readOnly) return;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;   /* hidden (closed details etc.) */
        let sel = el.id ? '#' + CSS.escape(el.id) : null;
        if (!sel) { const k = Object.keys(el.dataset)[0]; if (k) sel = `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`; }
        if (!sel && el.name) sel = `#screen [name="${CSS.escape(el.name)}"]`;
        const lab = (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.placeholder || el.getAttribute('aria-label') || '';
        const form = el.closest('.box, .pcard, form, .card, details, .stack');
        const btns = form ? [...form.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /^(save|create|add|send|submit|done|fill|apply|update|log|record|sign)/i.test(t)).slice(0, 3) : [];
        out.push({ sel, tag: el.tagName.toLowerCase(), type: el.type, label: lab.trim().replace(/\s+/g, ' ').slice(0, 60), search: SEARCHY(el), btns, value: el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value });
      });
      return out;
    }, SEARCHY.toString());
    const res = { screen: name, key: scr, controls: ctrls.length, fields: [] };
    for (const c of ctrls) {
      if (!c.sel) { res.fields.push({ ...c, result: 'no stable selector (skipped)' }); continue; }
      if (c.search) {   /* search box: count visible rows/cards before and after typing junk */
        try {
          const count = () => page.evaluate(() => document.querySelectorAll('#screen tr, #screen .jrow, #screen .pcard, #screen .bcard, #screen .card').length);
          const before = await count(); await page.fill(c.sel, 'zzqxw'); await page.waitForTimeout(800); const after = await count();
          await page.fill(c.sel, ''); await page.waitForTimeout(600);
          res.fields.push({ ...c, result: after < before ? 'search filters' : before === 0 ? 'search: nothing to filter' : 'SEARCH DOES NOT FILTER', before, after });
        } catch (e) { res.fields.push({ ...c, result: 'search error: ' + e.message.split('\n')[0] }); }
        continue;
      }
      let want;
      try {
        await page.evaluate(() => { const t = document.querySelector('#toast'); if (t) { t.hidden = true; t.textContent = ''; } });
        const loc = page.locator(c.sel).first();
        if (c.type === 'checkbox' || c.type === 'radio') { want = !(await loc.isChecked()); await loc.setChecked(want); }
        else if (c.tag === 'select') { const opts = await loc.evaluate(s => [...s.options].map(o => o.value)); const cur = await loc.inputValue(); want = opts.find(o => o !== cur && o !== ''); if (want === undefined) { res.fields.push({ ...c, result: 'only one choice (skipped)' }); continue; } await loc.selectOption(want); }
        else { want = { number: '7', date: '2026-12-01', time: '09:30', email: 'audit@test.co', tel: '702-555-0100', url: 'https://example.com', 'datetime-local': '2026-12-01T09:30' }[c.type] || 'Audit ' + Math.random().toString(36).slice(2, 6); await loc.fill(want); await loc.press('Tab'); }
        await page.waitForTimeout(700);
        const fb = await page.evaluate(() => { const t = document.querySelector('#toast'); const s = document.querySelector('#homeSaved'); return (t && !t.hidden && t.textContent) || (s && /Sav/.test(s.textContent) && s.textContent) || ''; });
        c.want = want; c.feedback = fb; c.changed = true;
        if (await page.evaluate(() => screen) !== scr) { c.note = 'changing it moved to screen ' + await page.evaluate(() => screen); await open(); }
      } catch (e) { c.result = 'could not set: ' + e.message.split('\n')[0].slice(0, 80); }
      res.fields.push(c);
    }
    /* reload from the server and see what stuck */
    await page.reload(); await page.waitForTimeout(2200); await setRole('office');
    try { await open(); } catch (e) {}
    for (const f of res.fields) {
      if (!f.changed) continue;
      const v = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return { gone: true }; return { v: el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value }; }, f.sel).catch(() => ({ gone: true }));
      f.result = v.gone ? 'not on screen after reload (moved/hidden)' : String(v.v) === String(f.want) ? 'SAVED' + (f.feedback ? '' : ' (no saved message)') : (f.btns.length ? `not kept until a button (${f.btns.join(' / ')}) is pressed` : 'NOT SAVED');
    }
    res.jsErrors = errors.slice(errBefore);
    report.push(res);
    process.stdout.write(`${name}: ${res.fields.length} controls\n`);
  }
  fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
  console.log('report:', outFile);
  await browser.close(); srv.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
