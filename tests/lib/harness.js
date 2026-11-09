'use strict';
/* Test harness for the single-file app (app.html).
   Opens app.html in headless Chromium with a fake claude.ai runtime (shared db + user), so tests can
   call the app's own functions (totals, priceOf, trLevels, ...) and click through screens.

   Playwright: uses require('playwright') when installed (CI installs it), or the module path in
   PW_MODULE. Browser: Playwright's own Chromium, or the executable in PW_CHROMIUM. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'app.html');

function playwright() {
  if (process.env.PW_MODULE) return require(process.env.PW_MODULE);
  return require('playwright');
}

/* fake window.claude: db (collections/docs with live snapshots) and user */
const mock = who => `(()=>{const W=${JSON.stringify(who)};const store=new Map(Object.entries(W.seed||{}));const subs=[];
const snapC=p=>({docs:[...store.entries()].filter(([k])=>k.startsWith(p+"/")&&k.slice(p.length+1).indexOf("/")<0).map(([k,v])=>({id:k.slice(p.length+1),data:()=>JSON.parse(JSON.stringify(v))}))});
const fire=q=>subs.filter(s=>!q||s.p===q||q.startsWith(s.p+"/")).forEach(s=>{try{s.fn(s.c?snapC(s.p):{exists:store.has(s.p),data:()=>store.get(s.p)})}catch(e){}});
const db={collection:p=>({onSnapshot:(fn,err)=>{subs.push({p,c:1,fn});setTimeout(()=>fn(snapC(p)),5);return()=>{}}}),
 doc:p=>({get:async()=>({exists:store.has(p),data:()=>store.get(p)}),set:async v=>{store.set(p,v);fire(p)},update:async v=>{store.set(p,{...(store.get(p)||{}),...v});fire(p)},delete:async()=>{store.delete(p);fire(p)},
  onSnapshot:(fn)=>{subs.push({p,c:0,fn});setTimeout(()=>fn({exists:store.has(p),data:()=>store.get(p)}),5);return()=>{}}})};
const user={me:async()=>({id:W.id,name:W.names[W.id]||"",canEdit:!!W.admin}),canEdit:async()=>!!W.admin,id:async()=>W.id,isOwner:()=>!!W.admin,
 profiles:async ids=>Object.fromEntries([].concat(ids).map(i=>[i,{id:i,name:W.names[i]||""}])),search:async q=>Object.entries(W.names).filter(([i,n])=>n.toLowerCase().includes((q||"").toLowerCase())).map(([id,name])=>({id,name,guest:false}))};
window.__store=store;window.claude={use:async n=>n==="db"?db:n==="user"?user:null};})()`;

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8'));
function defaultSeed(extra) {
  const e = fixture('estimate.json');
  return { 'config/main': fixture('config.json'), ['estimates/' + e.id]: e, ...(extra || {}) };
}

let browser = null;
async function getBrowser() {
  if (browser) return browser;
  const { chromium } = playwright();
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  return browser;
}
async function closeBrowser() { if (browser) { await browser.close(); browser = null; } }

/* open the app; returns { page, errors, role(r) } */
async function openApp({ seed, viewport, id = 'u_ron', admin = true, names = { u_ron: 'Ron Alexander' }, role } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: viewport || { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window._tcAsked = 1; });
  await page.addInitScript(mock({ names, id, admin, seed: seed || defaultSeed() }));
  await page.goto('file://' + APP);
  await page.waitForFunction(() => typeof cfg !== 'undefined' && cfg.book && Object.keys(cfg.book).length > 50 && typeof ests !== 'undefined', null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const setRole = async r => { await page.evaluate(r => { const s = document.querySelector('#role'); if (!s) return; s.value = r; s.dispatchEvent(new Event('change', { bubbles: true })); }, r); await page.waitForTimeout(250); };
  if (role) await setRole(role);
  return { page, ctx, errors, setRole, close: () => ctx.close() };
}

module.exports = { openApp, closeBrowser, fixture, defaultSeed, APP, ROOT };
