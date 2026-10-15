// MR-3装配近景：同一接口、同一相机修复前后；不隐藏离群件，不导出新GLB。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const output=process.env.OUTPUT_DIR||'.tmp/ci/hero-assembly';mkdirSync(output,{recursive:true});
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.argv[2]||'http://127.0.0.1:8080'}/model-editor.html`);await page.locator('#load-course').click();await page.waitForFunction(()=>modelEditor?.source);
 await page.locator('#search').fill('549');await page.locator('#tree [data-node-index="549"]').click();await page.locator('#focus').click();
 await page.screenshot({path:`${output}/floating-before.png`});
 const before=await page.evaluate(async()=>{
  const T=await import('./vendor/three/three.module.js'),e=modelEditor,box=new T.Box3().setFromObject(e.source.nodes.get(547),true),center=box.getCenter(new T.Vector3());
  e.camera.position.copy(center).add(new T.Vector3(-.25,.21,.28));e.orbit.target.copy(center);e.orbit.update();
  return {camera:e.camera.position.toArray(),target:e.orbit.target.toArray(),offsetVisible:e.source.nodes.get(549).visible,edited:e.changes().length};
 });
 await page.screenshot({path:`${output}/interface-before.png`});
 await page.evaluate(async()=>{const response=await fetch('./models/repairs/yaw-offset-inferred.json');if(!response.ok)throw new Error('补丁不可用');await modelEditor.importPatch(new File([await response.text()],'yaw-offset-inferred.json'));});
 const after=await page.evaluate(view=>{
  const e=modelEditor;e.camera.position.fromArray(view.camera);e.orbit.target.fromArray(view.target);e.orbit.update();
  return {camera:e.camera.position.toArray(),target:e.orbit.target.toArray(),offsetVisible:e.source.nodes.get(549).visible,editedNodes:e.changes().map(e=>e.nodeIndex)};
 },before);
 await page.screenshot({path:`${output}/interface-after.png`});
 assert.deepEqual(after.editedNodes,[549]);assert.equal(before.edited,0);assert.equal(before.offsetVisible,true);assert.equal(after.offsetVisible,true);
 assert.ok(Math.max(...after.camera.map((v,i)=>Math.abs(v-before.camera[i])))<1e-12);assert.deepEqual(after.target,before.target);assert.deepEqual(errors,[]);
 writeFileSync(`${output}/closeup-report.json`,JSON.stringify({before,after,verifiedAgainstCAD:false,meaning:'同相机看原接口与补偿后接口；另附原悬空组近景。不证明机械认证。'},null,2));
 console.log('MR-3同相机装配前后近景已生成。');await page.close();
}finally{await browser.close();}
