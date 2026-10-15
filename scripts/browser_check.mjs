// 启动本地服务器后运行：node scripts/browser_check.mjs [URL]
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync,writeFileSync} from 'node:fs';
const executablePath=process.env.BROWSER_PATH || (existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await context.newPage();const errors=[],failed=[],external=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
await page.route('**/*',route=>{
 try {
  if(!new URL(route.request().url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)){external.push(route.request().url());return route.abort();}
  return route.continue();
 } catch (error) {errors.push(error.message);return route.abort();}
});
const base=process.argv[2]||'http://localhost:8090';
const output=process.env.OUTPUT_DIR || 'docs';
mkdirSync(`${output}/media`,{recursive:true});
try{
 const start=performance.now();
 await page.goto(base);await page.waitForFunction(()=>window.app?.viewer?.diffCarModel);
 const teachingLoadMs=performance.now()-start;
 assert.equal(await page.evaluate(()=>!!app.viewer.heroRobotModel),false);
 const fullStart=performance.now();
 await page.evaluate(()=>{void app.goToStep(9);void app.goToStep(0);});
 await page.waitForFunction(()=>!!app.viewer.heroRobotModel);
 const heroLoadMs=performance.now()-fullStart;
 assert.equal(await page.evaluate(()=>app.viewer.heroRobotModel.visible),false);
 await page.waitForTimeout(500);
 await page.screenshot({path:`${output}/media/step-01.png`});
 for(let i=0;i<10;i++){
  await page.evaluate(i=>window.app.goToStep(i),i);
  if(i===9)await page.waitForFunction(()=>window.app.viewer.heroRobotModel?.visible);
  assert.equal(await page.locator('#step-badge').textContent(),`第 ${i+1} 步 / 共 10 步`);
  const visibility=await page.evaluate(async i=>{const {LESSON_STEPS}=await import('./js/lesson.js');return {actual:[...app.viewer.nodesMap].filter(([,n])=>n.visible).map(([name])=>name).sort(),expected:LESSON_STEPS[i].activeNodes.slice().sort()};},i);
  assert.deepEqual(visibility.actual,visibility.expected);
 }
 await page.waitForTimeout(1000);await page.screenshot({path:`${output}/media/step-10.png`});
 const resources=()=>page.evaluate(()=>({memory:{...app.viewer.renderer.info.memory},calls:app.viewer.renderer.info.render.calls,triangles:app.viewer.renderer.info.render.triangles,programs:app.viewer.renderer.info.programs.length,heap:performance.memory?.usedJSHeapSize}));
 const before=await resources();
 for(let j=0;j<10;j++){await page.evaluate(async()=>{await app.goToStep(0);await app.goToStep(9);app.viewer.highlightComparison('wheel');app.viewer.highlightComparison('motor');});await page.waitForTimeout(50);}
 await page.evaluate(()=>app.viewer.clearComparisonHighlight());
 const after=await resources();assert.equal(after.memory.geometries,before.memory.geometries);assert.equal(after.memory.textures,before.memory.textures);assert.equal(after.programs,before.programs);
 await page.evaluate(()=>app.goToStep(6));
 for(let stage=0;stage<3;stage++){
  await page.locator('#btn-chain').click();
  assert.equal(await page.evaluate(()=>app.viewer.instructionStage),stage);
  assert.ok(await page.evaluate(()=>app.viewer.instructionMarker.visible));
 }
 await page.locator('#btn-pause').click();
 const marker=await page.evaluate(()=>app.viewer.instructionMarker.position.toArray());
 await page.waitForTimeout(180);
 assert.deepEqual(await page.evaluate(()=>app.viewer.instructionMarker.position.toArray()),marker);
 await page.screenshot({path:`${output}/media/step-07.png`});
 await page.locator('#btn-pause').click();
 assert.ok((await page.locator('#chain-status').textContent()).includes('电机'));
 await page.evaluate(()=>app.goToStep(7));
 await page.locator('.btn-preset').first().click();
 assert.equal(await page.locator('#slider-left').inputValue(),'0.75');
 assert.equal(await page.locator('#slider-controls').isVisible(),false);
 await page.evaluate(()=>app.goToStep(8));
 await page.locator('#slider-left').fill('-0.4');
 assert.equal(await page.evaluate(()=>app.kinematics.targetLeft),-.4);
 assert.equal(await page.locator('.btn-preset.active').count(),0);
 await page.locator('#btn-reset-car').click();
 const geometry=await page.evaluate(async()=>{const T=await import('./vendor/three/three.module.js');const v=app.viewer;v.render(app.kinematics.update(0),0);const wheel=v.leftWheelNode;const initial=new T.Box3().setFromObject(wheel).getCenter(new T.Vector3());wheel.rotation.x+=1.7;v.scene.updateMatrixWorld(true);const next=new T.Box3().setFromObject(wheel).getCenter(new T.Vector3());const bottom=new T.Box3().setFromObject(v.diffCarModel,true).min.y;return {centerDrift:initial.distanceTo(next),bottom};});
 assert.ok(geometry.centerDrift<.001);assert.ok(Math.abs(geometry.bottom)<.001);
 await page.locator('#btn-pause').click();
 await page.evaluate(()=>{app.kinematics.resetPose();app.kinematics.setWheelSpeeds(.2,.7);});
 await page.locator('#btn-cam-mode').click();
 assert.equal(await page.evaluate(()=>app.kinematics.targetRight),.7);
 await page.locator('#btn-pause').click();await page.waitForTimeout(400);
 assert.ok(await page.evaluate(()=>app.kinematics.x<0));
 await page.locator('#btn-pause').click();const pose=await page.evaluate(()=>app.kinematics.x);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>app.kinematics.x),pose);
 const rotating=()=>page.evaluate(()=>({l:app.viewer.leftWheelNode.quaternion.toArray(),r:app.viewer.rightWheelNode.quaternion.toArray(),la:app.viewer.leftArrowMesh.rotation.toArray(),ra:app.viewer.rightArrowMesh.rotation.toArray()}));
 const frozen=await rotating();await page.waitForTimeout(180);assert.deepEqual(await rotating(),frozen);
 const trajectoryError=await page.evaluate(()=>{const k=app.kinematics,p=k.trajectory.at(-1);return Math.hypot(p.x-k.x,p.z-k.z);});
 assert.ok(trajectoryError<.021);
 await page.screenshot({path:`${output}/media/step-09.png`});
 await page.locator('#btn-toggle-code').click();await page.waitForFunction(()=>document.querySelector('#code-content').textContent.includes('namespace'));
 await page.goto(`${base}/viewer_full.html`);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已加载'));
 await page.waitForTimeout(800);await page.screenshot({path:`${output}/media/full-robot.png`});
 const full=await page.evaluate(()=>({...viewer.renderer.info.memory,calls:viewer.renderer.info.render.calls,triangles:viewer.renderer.info.render.triangles,programs:viewer.renderer.info.programs.length,heap:performance.memory?.usedJSHeapSize}));
 const frameTiming=await page.evaluate(()=>new Promise(resolve=>{const intervals=[];let previous=performance.now();function tick(t){intervals.push(t-previous);previous=t;if(intervals.length<30)requestAnimationFrame(tick);else{intervals.sort((a,b)=>a-b);resolve({medianMs:intervals[15],p95Ms:intervals[28],samples:30});}}requestAnimationFrame(tick);}));
 const angle=await page.evaluate(()=>viewer.camera.position.x);await page.locator('#rotate').click();await page.waitForTimeout(500);assert.notEqual(await page.evaluate(()=>viewer.camera.position.x),angle);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
 writeFileSync(`${output}/browser-results.json`,JSON.stringify({environment:'Chromium headless / SwiftShader software rendering; not target projector GPU',teachingLoadMs,heroLoadMs,frameTiming,geometry,before,after,full,errors,failed,external,passed:true},null,2));
 console.log('浏览器验收通过：十步、方向、暂停、视角保持、代码抽屉、离线、资源往返稳定。');
}catch(error){
 writeFileSync(`${output}/browser-results.json`,JSON.stringify({passed:false,failure:error.stack,errors,failed,external},null,2));
 try{await page.screenshot({path:`${output}/media/failure.png`});}catch(diagnosticError){console.error('失败截图未能保存：',diagnosticError.message);}
 throw error;
}finally{await browser.close();}
