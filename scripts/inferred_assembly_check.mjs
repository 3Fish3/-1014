// 原模型与推定候选双分辨率对照；默认不覆盖文档证据。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output=process.env.OUTPUT_DIR||'.tmp/ci/inferred-assembly';mkdirSync(output,{recursive:true});
const sourceHash=()=>createHash('sha256').update(readFileSync('web/models/hero_robot_clean.glb')).digest('hex');
const hash=sourceHash();
const base=process.argv[2]||'http://127.0.0.1:8080';
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={sourceHash:hash,errors:[],failed:[],external:[],pages:[],verifiedAgainstCAD:false};
try{
 for(const [width,height]of [[1920,1080],[1366,768]]){
  for(const inferred of [false,true]){
   const page=await browser.newPage({viewport:{width,height}}),models=[];
   page.on('pageerror',e=>report.errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)report.failed.push(r.url());});
   page.on('request',r=>{if(r.url().endsWith('.glb'))models.push(new URL(r.url()).pathname);});
   await page.route('**/*',route=>{if(!['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)){report.external.push(route.request().url());return route.abort();}return route.continue();});
   await page.goto(`${base}/ui-v2.html?step=10${inferred?'&assembly=inferred':''}`);
   await page.waitForFunction(()=>app?.viewer?.heroRobotModel?.visible&&document.querySelector('#step-badge').textContent.includes('10'));
   await page.waitForFunction(()=>app.projection.comparison.active&&!app.viewer.isTransitioningCamera);
   const metrics=await page.evaluate(async()=>{
    const T=await import('./vendor/three/three.module.js'),v=app.viewer;
    const comparison=app.projection.comparison,camera=comparison.views[1].camera;
    v.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(v.heroRobotModel,true),size=box.getSize(new T.Vector3());
    const positions=[];
    for(const o of comparison.meshes(1)){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++)positions.push(new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera));}
    const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y);
    return {size:size.toArray(),range:{minX:xs.reduce((a,b)=>Math.min(a,b),Infinity),maxX:xs.reduce((a,b)=>Math.max(a,b),-Infinity),minY:ys.reduce((a,b)=>Math.min(a,b),Infinity),maxY:ys.reduce((a,b)=>Math.max(a,b),-Infinity)},inferred:app.projection.inferredAssembly,model:app.projection.assemblyModelUrl,label:document.querySelector('.model-tag').textContent};
   });
   assert.equal(metrics.inferred,inferred);
   assert.ok(models.some(m=>m.endsWith(inferred?'hero_robot_inferred.glb':'hero_robot_clean.glb')));
   assert.ok(!models.some(m=>m.endsWith(inferred?'hero_robot_clean.glb':'hero_robot_inferred.glb')));
   if(inferred)assert.ok(metrics.label.includes('未机械核验'));
   for(const value of Object.values(metrics.range))assert.ok(Math.abs(value)<1.01,'候选几何越出画布');
   await page.screenshot({path:`${output}/${inferred?'candidate':'original'}-${width}.png`});
   if(inferred){await page.locator('.compare-btn[data-kind="motor"]').click();assert.ok((await page.locator('#compare-status').textContent()).length>0);}
   // 原样主体取景并未隐藏偏置组，完整资产取景仍应包含其所有顶点。
   const offsetVisible=await page.evaluate(()=>app.viewer.heroOffsetGroup?.visible);
   assert.equal(offsetVisible,true);
   await page.locator('#hero-framing').selectOption('complete');
   const completeFits=await page.evaluate(async()=>{
     const T=await import('./vendor/three/three.module.js'),c=app.projection.comparison,camera=c.views[1].camera;
     app.viewer.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
     return c.meshes(1).every(o=>{const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera);if(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>=1)return false;}return true;});
   });assert.equal(completeFits,true);
   report.pages.push({width,height,inferred,models,metrics,offsetVisible,completeFits});await page.close();
  }
 }
 // 在原始坐标工作台中导入同一个补丁，聚焦装配接口验证没有搬动单个子件。
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/model-editor.html`);await page.locator('#load-course').click();await page.waitForFunction(()=>modelEditor?.source);
 const raw=await page.evaluate(async()=>{
  const response=await fetch('./models/repairs/yaw-offset-inferred.json');if(!response.ok)throw new Error('补丁加载失败');
  await modelEditor.importPatch(new File([await response.text()],'yaw-offset-inferred.json'));
  const T=await import('./vendor/three/three.module.js'),e=modelEditor;
  e.source.root.updateMatrixWorld(true);
  const a=new T.Box3().setFromObject(e.source.nodes.get(547),true),b=new T.Box3().setFromObject(e.source.nodes.get(552),true);
  return {changes:e.changes(),gap:b.min.y-a.max.y};
 });
 assert.deepEqual(raw.changes.map(e=>e.nodeIndex),[549]);assert.ok(Math.abs(raw.gap)<1e-6);
 await page.locator('#search').fill('543');await page.locator('#tree [data-node-index="543"]').click();await page.locator('#focus').click();
 await page.screenshot({path:`${output}/interface.png`});
 await page.close();report.rawInterface={changedNodes:[549],contactGap:raw.gap};
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);assert.deepEqual(report.external,[]);assert.equal(sourceHash(),hash);
 report.passed=true;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('候选双分辨率预览与原始坐标补丁验证通过，源模型未改。');
}catch(error){report.passed=false;report.failure=error.stack;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}
finally{await browser.close();}
