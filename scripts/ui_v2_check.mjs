// P0验收：四张真实截图与交互回归；不覆盖V1的交付证据。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const executablePath = process.env.BROWSER_PATH || (existsSync('.tmp/browser/chrome-linux/chrome') ? '.tmp/browser/chrome-linux/chrome' : chromium.executablePath());
const base = process.argv[2] || 'http://127.0.0.1:8080';
const output = process.env.OUTPUT_DIR || 'docs/ui-v2/p0';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const report = { environment:'Chromium headless / SwiftShader, not classroom GPU', pages:[], errors:[], external:[], failed:[] };
async function assertModelAndLabelsFit(page) {
  const result=await page.evaluate(async()=>{
    const T=await import('./vendor/three/three.module.js');
    const v=app.viewer;v.scene.updateMatrixWorld(true);v.camera.updateMatrixWorld(true);
    let maximum=0;
    for(const node of [...v.nodesMap.values(),v.leftArrowMesh,v.rightArrowMesh])if(node?.visible)node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(v.camera);
        maximum=Math.max(maximum,Math.abs(p.x),Math.abs(p.y));
      }
    });
    const labelsFit=[...document.querySelectorAll('.slider-group label')].every(label=>{
      const outer=label.getBoundingClientRect();const text=label.querySelector('span').getBoundingClientRect();
      return text.right<=outer.right+1&&text.left>=outer.left&&label.scrollWidth<=label.clientWidth+1;
    });
    return {maximum,labelsFit,step:app.currentStepIndex+1,viewport:[innerWidth,innerHeight],cameraMode:v.cameraMode};
  });
  assert.ok(result.maximum<.99,`模型或箭头越界：${JSON.stringify(result)}`);
  assert.equal(result.labelsFit,true);
}
let currentPage;
try {
  for (const [width,height] of [[1920,1080],[1366,768]]) {
    for (const step of [3,9]) {
      const page = await browser.newPage({ viewport:{width,height} });
      currentPage = page;
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('response', response => {if(response.status()>=400)report.failed.push(response.url());});
      await page.route('**/*',route=>{
        try {
          if(!['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)) {
            report.external.push(route.request().url());return route.abort();
          }
          return route.continue();
        } catch (error) {report.errors.push(error.message);return route.abort();}
      });
      const started = performance.now();
      await page.goto(`${base}/ui-v2.html?step=${step}`);
      await page.waitForFunction(()=>window.app?.viewer?.diffCarModel && window.app.currentStepIndex>=0);
      const loadMs = performance.now()-started;
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(async()=>{
        const T = await import('./vendor/three/three.module.js');
        const v=app.viewer;
        v.scene.updateMatrixWorld(true);v.camera.updateMatrixWorld(true);
        const points=[];
        for(const node of [...v.nodesMap.values(),v.leftArrowMesh,v.rightArrowMesh])if(node?.visible)node.traverse(mesh=>{
          if(!mesh.isMesh)return;
          const position=mesh.geometry.attributes.position;
          for(let i=0;i<position.count;i++)points.push(new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).project(v.camera));
        });
        const range={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
        const rect=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right};};
        const image=document.querySelector('#hardware-photo');
        const card=document.querySelector('.knowledge-card');
        return {range,modelHeightFraction:(range.maxY-range.minY)/2,canvas:rect('#canvas-container'),controls:rect('#motion-controls'),footer:rect('.lecture-footer'),
          card:rect('.knowledge-card'),cardScrollHeight:card.scrollHeight,cardClientHeight:card.clientHeight,
          overflow:document.documentElement.scrollWidth>innerWidth,
          photoLoaded:image.complete&&image.naturalWidth>0,photo:rect('#hardware-photo'),
          bodyFont:parseFloat(getComputedStyle(document.querySelector('#step-details li')).fontSize),
          notesVisible:document.querySelector('#teacher-notes').open,
          codeVisible:!document.querySelector('#code-drawer').hidden,
          memory:{...v.renderer.info.memory}};
      });
      assert.equal(metrics.overflow,false);assert.equal(metrics.photoLoaded,true);
      assert.ok(metrics.photo.height>90);assert.ok(metrics.bodyFont>=22);
      assert.ok(metrics.cardScrollHeight<=metrics.cardClientHeight+1);
      assert.equal(metrics.notesVisible,false);assert.equal(metrics.codeVisible,false);
      assert.ok(metrics.modelHeightFraction>.48);
      assert.ok(Math.max(Math.abs(metrics.range.minX),Math.abs(metrics.range.maxX),Math.abs(metrics.range.minY),Math.abs(metrics.range.maxY))<.99);
      if(step===9)assert.ok(metrics.canvas.bottom<=metrics.controls.y+1);
      await page.screenshot({path:`${output}/step-${step}-${width}.png`});
      const frameTiming=await page.evaluate(()=>new Promise(resolve=>{
        const times=[];let previous=performance.now();
        function sample(now){times.push(now-previous);previous=now;
          if(times.length<31)requestAnimationFrame(sample);
          else{times.shift();times.sort((a,b)=>a-b);resolve({samples:times.length,medianMs:times[15],p95Ms:times[28],devicePixelRatio});}
        }
        requestAnimationFrame(sample);
      }));
      if(step===9){
        await page.locator('#btn-pause').click();
        await page.locator('.btn-preset').filter({hasText:'前进'}).click();
        assert.equal(await page.locator('#slider-left').inputValue(),'0.75');
        await page.locator('#slider-left').focus();await page.keyboard.press('Home');
        await page.locator('#slider-right').focus();await page.keyboard.press('End');
        assert.deepEqual(await page.evaluate(()=>[app.kinematics.targetLeft,app.kinematics.targetRight]),[-1,1]);
        assert.equal(await page.locator('.btn-preset.active').count(),0);
        await page.locator('#btn-cam-mode').click();
        assert.equal(await page.evaluate(()=>app.viewer.cameraMode),'FOLLOW');
        assert.deepEqual(await page.evaluate(()=>[app.kinematics.targetLeft,app.kinematics.targetRight]),[-1,1]);
        await page.locator('#slider-left').focus();for(let i=0;i<24;i++)await page.keyboard.press('ArrowRight');
        await page.locator('#slider-right').focus();for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
        await page.locator('#btn-pause').click();await page.waitForTimeout(700);await page.locator('#btn-pause').click();
        const before=await page.evaluate(()=>[app.kinematics.x,app.kinematics.z,app.viewer.leftArrowMesh.rotation.x,app.viewer.rightWheelNode.quaternion.toArray()]);
        await page.waitForTimeout(200);
        assert.deepEqual(await page.evaluate(()=>[app.kinematics.x,app.kinematics.z,app.viewer.leftArrowMesh.rotation.x,app.viewer.rightWheelNode.quaternion.toArray()]),before);
        assert.ok(await page.evaluate(()=>app.kinematics.trajectory.length>1));
        await assertModelAndLabelsFit(page);
        await page.screenshot({path:`${output}/motion-${width}.png`});
        await page.locator('#btn-reset-car').click();
        assert.deepEqual(await page.evaluate(()=>[app.kinematics.x,app.kinematics.z,app.kinematics.targetLeft,app.kinematics.targetRight]),[0,0,0,0]);
      }
      await page.locator('#btn-notes').click();
      assert.equal(await page.locator('#teacher-notes').evaluate(d=>d.open),true);
      await page.locator('#btn-close-notes').click();
      await page.locator('#btn-fullscreen').click();
      await page.waitForFunction(()=>Boolean(document.fullscreenElement));
      await page.waitForTimeout(300);
      await assertModelAndLabelsFit(page);
      await page.locator('#btn-fullscreen').click();
      await page.waitForFunction(()=>!document.fullscreenElement);
      await page.waitForTimeout(300);
      await assertModelAndLabelsFit(page);
      // P0非目标页明确返回V1，前后导航不丢功能。
      await page.locator('#btn-next').click();
      await page.waitForURL(`**/index.html?step=${step+1}`);
      await page.waitForFunction(i=>app?.currentStepIndex===i,step);
      report.pages.push({step,width,height,loadMs,frameTiming,metrics,interactionsPassed:true});
      await page.close();
    }
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.failed,[]);
  report.passed=true;
  writeFileSync(`${output}/browser-results.json`,JSON.stringify(report,null,2));
  console.log('P0通过：四张静态截图、两张运动截图、双分辨率布局及交互回归。');
} catch (error) {
  report.passed=false;report.failure=error.stack;
  writeFileSync(`${output}/browser-results.json`,JSON.stringify(report,null,2));
  try {if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:`${output}/failure.png`});}
  catch(diagnosticError){console.error('失败截图未能保存：',diagnosticError.message);}
  throw error;
} finally {await browser.close();}
