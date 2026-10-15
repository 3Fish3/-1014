// STEP is the confirmed default; retain explicit original/inferred reference links.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output=process.env.OUTPUT_DIR||'.tmp/ci/step-alignment';mkdirSync(output,{recursive:true});
const base=process.argv[2]||'http://127.0.0.1:8080';
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const sourcePaths=['web/models/hero_robot_step_aligned.glb','web/models/hero_robot_clean.glb','web/models/hero_robot_inferred.glb','web/models/repairs/yaw-offset-inferred.json'];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const baseline=hashes(),errors=[],failed=[],requests=[];
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={environment:'Chromium headless SwiftShader; not mechanical or hardware performance certification',pages:[],hashes:baseline};
async function metrics(selectedIndex=null){
 const T=await import('./vendor/three/three.module.js');const e=robotViewer;
 e.root.updateWorldMatrix(true,true);e.viewer.camera.updateMatrixWorld(true);
 let count=0,maxXY=0,maxZ=0;
 const observed=selectedIndex===null?e.root:e.nodes.get(selectedIndex);
 if(!observed)throw new Error('取景检查目标不存在');
 observed.traverse(o=>{if(!o.isMesh||!e.visibility.isVisible(o))return;
  const a=o.geometry.attributes.position;
  for(let i=0;i<a.count;i++){
   const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(e.viewer.camera);
   maxXY=Math.max(maxXY,Math.abs(p.x),Math.abs(p.y));maxZ=Math.max(maxZ,Math.abs(p.z));count++;
  }
 });
 const flags=[...e.nodes].filter(([,o])=>!e.visibility.isVisible(o)).map(([i])=>i);
 return {count,maxXY,maxZ,hidden:flags,overflow:document.documentElement.scrollWidth>innerWidth};
}
const fits=r=>{assert.ok(r.count>0);assert.ok(r.maxXY<.99&&r.maxZ<1,`candidate clipped ${JSON.stringify(r)}`);assert.equal(r.overflow,false);};
const choose=async(page,i)=>{await page.locator('#search').fill(String(i));await page.locator(`#structure-tree button[data-node-index="${i}"]`).click();};
try{
 for(const [width,height] of [[1920,1080],[1366,768]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto(`${base}/viewer_full.html?assembly=step`);
  await page.waitForFunction(()=>window.robotViewer?.visibility);
  assert.match(await page.locator('.notice').innerText(),/未认证/);
  assert.match(await page.locator('.notice').innerText(),/位置经用户确认/);
  const initial=await page.evaluate(metrics);fits(initial);assert.deepEqual(initial.hidden,[]);
  const positions=await page.evaluate(async()=>{
   const T=await import('./vendor/three/three.module.js');const e=robotViewer;
   e.root.updateWorldMatrix(true,true);
   // Remove BOTH presentation wrappers, not just the outer hero container.
   // Source node #1 belongs to the unmodified glTF scene under normalization.
   const inv=e.nodes.get(1).parent.matrixWorld.clone().invert();
   return [550,551,552,553,554,555,556,557,558,559,560].map(i=>({i,position:new T.Vector3().setFromMatrixPosition(inv.clone().multiply(e.nodes.get(i).matrixWorld)).toArray()}));
  });
  const alignment=JSON.parse(readFileSync('docs/model-editor/step-alignment/alignment-report.json'));
  let maxPositionErrorMm=0;
  for(const row of positions){
   const expected=alignment.mapping.find(m=>m.nodeIndex===row.i).stepWorldMatrixMm;
   const error=Math.hypot(...row.position.map((v,k)=>v*1000-expected[k][3]));
   maxPositionErrorMm=Math.max(error,maxPositionErrorMm);assert.ok(error<.001,`loader/scene changed CAD placement ${row.i}: ${error}mm`);
  }
  await page.screenshot({path:`${output}/aligned-${width}.png`});
  await choose(page,543);await page.locator('#focus-selected').click();
  fits(await page.evaluate(metrics,543));await page.screenshot({path:`${output}/yaw-${width}.png`});
  // Keep the camera fixed while demonstrating the restored assembly's real visibility.
  await choose(page,549);const view=await page.evaluate(()=>({p:viewer.camera.position.toArray(),t:viewer.controls.target.toArray()}));
  await page.locator('#hide-selected').click();assert.equal(await page.evaluate(()=>robotViewer.nodes.get(549).visible),false);
  await page.locator('#show-selected').click();assert.equal(await page.evaluate(()=>robotViewer.nodes.get(549).visible),true);
  const after=await page.evaluate(()=>({p:viewer.camera.position.toArray(),t:viewer.controls.target.toArray()}));
  assert.ok(Math.max(...after.p.map((v,i)=>Math.abs(v-view.p[i])),...after.t.map((v,i)=>Math.abs(v-view.t[i])))<1e-12);
  await page.locator('#isolate-selected').click();assert.equal(await page.evaluate(()=>robotViewer.visibility.isolatedIndex),549);
  await page.locator('#exit-isolation').click();assert.deepEqual((await page.evaluate(metrics)).hidden,[]);
  await page.locator('#restore-default').click();assert.deepEqual((await page.evaluate(metrics)).hidden,[]);
  // Without a query the confirmed STEP model is now the default, including reset defaults.
  await page.goto(`${base}/viewer_full.html`);await page.waitForFunction(()=>window.robotViewer?.visibility);
  assert.deepEqual((await page.evaluate(metrics)).hidden,[]);fits(await page.evaluate(metrics));
  assert.ok((await page.evaluate(()=>viewer.heroRobotUrl)).endsWith('hero_robot_step_aligned.glb'));
  assert.equal(await page.evaluate(()=>robotViewer.assemblyKind),'step');
  await page.goto(`${base}/viewer_full.html?assembly=original`);await page.waitForFunction(()=>window.robotViewer?.visibility);
  assert.ok((await page.evaluate(()=>viewer.heroRobotUrl)).endsWith('hero_robot_clean.glb'));
  assert.deepEqual((await page.evaluate(metrics)).hidden,Array.from({length:12},(_,i)=>549+i));
  assert.deepEqual(await page.evaluate(()=>[...robotViewer.nodes].filter(([,o])=>!o.visible).map(([i])=>i)),[549]);
  assert.match(await page.locator('.notice').innerText(),/原样参考/);
  await page.goto(`${base}/viewer_full.html?assembly=inferred`);await page.waitForFunction(()=>window.robotViewer?.visibility);
  assert.ok((await page.evaluate(()=>viewer.heroRobotUrl)).endsWith('hero_robot_inferred.glb'));
  assert.deepEqual((await page.evaluate(metrics)).hidden,[]);fits(await page.evaluate(metrics));
  assert.match(await page.locator('.notice').innerText(),/旧推定版/);
  report.pages.push({width,height,initial,maxPositionErrorMm,visibilityPreservesCamera:true,defaultStep:true,referenceLinksPreserved:true});
  await page.close();
 }
 // Cold-load failures must be explicit and cannot silently request original/inferred.
 report.initialFailures=[];
 for(const classroom of [false,true]){
  const page=await browser.newPage({viewport:{width:1366,height:768}}),models=[],responses=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',r=>{if(r.url().includes('/hero_robot_'))models.push(r.url());});
  page.on('response',r=>{if(r.status()>=400)responses.push(r.status());});
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.route('**/hero_robot_step_aligned.glb',route=>route.fulfill({status:503,body:'intentional initial STEP failure'}));
  await page.goto(`${base}/${classroom?'ui-v2.html?step=10':'viewer_full.html'}`);
  if(classroom){
   await page.waitForFunction(()=>window.app?.viewer&&!app.viewer.heroRobotPromise&&document.querySelector('#assembly-status').textContent.includes('未加载'));
   assert.equal(await page.evaluate(()=>Boolean(app.viewer.heroRobotModel)),false);
   assert.equal(await page.locator('#hero-asset').inputValue(),'step');
   assert.match(await page.locator('.model-tag').innerText(),/未加载/);
  }else{
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('加载失败'));
   assert.equal(await page.evaluate(()=>robotViewer.root),null);
  }
  assert.deepEqual(responses,[503]);assert.equal(models.length,1);assert.ok(models[0].endsWith('/hero_robot_step_aligned.glb'));
  await page.unroute('**/hero_robot_step_aligned.glb');
  if(classroom){
   await page.locator('#btn-replay').click();
   await page.waitForFunction(()=>app.viewer.heroRobotModel?.visible&&!app.viewer.heroRobotPromise);
   assert.ok((await page.evaluate(()=>app.viewer.heroRobotUrl)).endsWith('hero_robot_step_aligned.glb'));
   assert.match(await page.locator('.model-tag').innerText(),/位置经用户确认/);
  }else{
   await page.reload();await page.waitForFunction(()=>window.robotViewer?.visibility);
   assert.ok((await page.evaluate(()=>viewer.heroRobotUrl)).endsWith('hero_robot_step_aligned.glb'));
   assert.deepEqual((await page.evaluate(metrics)).hidden,[]);
  }
  report.initialFailures.push({classroom,status:503,noFallback:true,retryPassed:true});await page.close();
 }
 assert.ok(requests.some(u=>u.endsWith('/hero_robot_step_aligned.glb')));
 assert.ok(requests.some(u=>u.endsWith('/hero_robot_clean.glb')));
 assert.ok(requests.some(u=>u.endsWith('/hero_robot_inferred.glb')));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(hashes(),baseline);
 report.passed=true;report.errors=errors;report.failed=failed;
 console.log('默认STEP双分辨率：整车/Yaw取景、11件CAD坐标、显隐保持视角、原样/旧推定入口与冷启动503/重试通过。');
}catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;console.error(error);}
finally{await browser.close();writeFileSync(`${output}/browser-report.json`,JSON.stringify(report,null,2));}
