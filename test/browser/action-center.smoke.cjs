const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PV_BROWSER_EXECUTABLE||chromium.executablePath(),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];
 page.setDefaultTimeout(7000);
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});
 await page.route('**/config.json',r=>r.fulfill({json:{}}));await page.route('**/data/site.json',r=>r.fulfill({json:{}}));
 await page.addInitScript(()=>{
  if(!localStorage.getItem('pv-workspace'))localStorage.setItem('pv-workspace',JSON.stringify({version:1,profile:{},items:{
   'company:acme:EU:notice':{assess:{status:'open'},snapshot:{id:'company:acme:EU:notice',title:'Synthetic Acme safety alert',source:'Synthetic regulator',link:'https://regulator.example/alert',published:'2026-10-30T12:00:00Z',companyContext:{companyId:'acme',companyName:'Acme (synthetic)',markets:['EU'],reason:'Substance matches a confirmed product.',scopeReason:'One confirmed product in EU.',products:[],portfolioRevision:1}}},
   'company:other:US:paper':{assess:{status:'open'},snapshot:{id:'company:other:US:paper',title:'Synthetic research paper',source:'Synthetic journal',link:'https://publication.example/paper',companyContext:{companyId:'other',companyName:'Other (synthetic)',markets:['US'],evidenceKind:'paper',reason:'Matched substance.',products:[]}}}
  }}));
 });
 await page.goto('http://127.0.0.1:4173/action-center.html');
 await page.locator('#candidates summary').click();
 await page.getByRole('button',{name:'Start case',exact:true}).first().click();
 await page.getByLabel('Applicability',{exact:true}).selectOption('relevant');await page.getByLabel('Decision reason').fill('Confirmed overlap with the company product.');await page.getByRole('button',{name:'Save applicability',exact:true}).click();
 await page.getByLabel('Owner email',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Due date',{exact:true}).fill('2026-10-30');await page.getByLabel('Action instructions').fill('Evaluate the notice and document the conclusion.');await page.getByRole('button',{name:'Save action',exact:true}).click();
 await page.getByRole('button',{name:'1 Overdue',exact:true}).waitFor();
 await page.getByLabel('What changed / work performed').fill('Safety evaluation completed and report filed.');await page.getByLabel('Supporting evidence label').fill('Evaluation report');await page.getByLabel('Supporting evidence HTTPS document link').fill('https://documents.example/report');await page.getByRole('button',{name:'Submit for verification',exact:true}).click();
 await page.getByRole('button',{name:'1 Awaiting verification',exact:true}).waitFor();
 await page.getByLabel('Reviewer verification note').fill('Checked the evaluation and supporting source.');await page.getByRole('button',{name:'Confirm self-review and close',exact:true}).click();
 await page.getByRole('button',{name:'1 Closed',exact:true}).waitFor();assert.match(await page.locator('#case-detail').innerText(),/Self-reviewed by local/);
 await page.getByLabel('Reopen reason').fill('New evidence requires reassessment.');await page.getByRole('button',{name:'Reopen case',exact:true}).click();
 await page.getByRole('button',{name:'1 Awaiting assessment',exact:true}).waitFor();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pv-company-action-cases-v1')));assert.equal(Object.keys(saved).length,1);assert.equal(Object.values(saved)[0].history.length,6);
 await page.reload();await page.getByRole('button',{name:/Synthetic Acme safety alert/}).click();await page.getByLabel('Applicability',{exact:true}).waitFor();
 await page.getByLabel('Filter market').selectOption('EU');assert.equal(await page.locator('.action-case').count(),1);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/pv-action-center-mobile.png',fullPage:true});
 await page.setViewportSize({width:1360,height:1000});await page.screenshot({path:'/tmp/pv-action-center-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Action Center: evidence → applicability → owner/due → completion → self-review → reopen; persistence, filters and mobile layout passed.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
