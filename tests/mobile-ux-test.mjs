import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const checks=[
  ['menu toggle',html.includes('id="menuToggle"')],
  ['navigation scrim',html.includes('id="navScrim"')],
  ['sidebar id',html.includes('id="sidebar"')],
  ['drawer open state',css.includes('body.nav-open .sidebar')],
  ['mobile breakpoint',css.includes('@media(max-width:820px)')],
  ['narrow breakpoint',css.includes('@media(max-width:520px)')],
  ['overlay interaction',app.includes('navScrim?.addEventListener("click",()=>setNavOpen(false))')],
  ['escape close',app.includes('e.key==="Escape"')],
  ['close after navigation',app.includes('go(b.dataset.page);setNavOpen(false)')],
  ['44px touch target',css.includes('min-height:44px')],
  ['horizontal table scroll',css.includes('overflow-x:auto')],
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length) throw new Error(`Mobile UX regression: ${failed.map(x=>x[0]).join(', ')}`);
console.log(`Mobile UX assertions: PASS (${checks.length})`);
