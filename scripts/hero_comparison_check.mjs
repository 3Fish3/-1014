// MR-3：同一renderer双视区、实际高亮、原样/候选切换与异步竞争验收。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const output=process.env.OUTPUT_DIR||'.tmp/ci/hero-comparison';mkdirSync(output,{recursive:true});
const base=process.argv[2]||'http://127.0.0.1:8080';
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={environment:'Chromium headless / SwiftShader; not physical GPU certification',pages:[],errors:[],external:[],failed:[]};
const overlaps=(a,b)=>a.x<b.right-.5&&a.right>b.x+.5&&a.y<b.bottom-.5&&a.bottom>b.y+.5;
async function metrics(){
 const T=await import('./vendor/three/three.module.js'),v=app.viewer,c=app.projection.comparison;
 v.scene.updateMatrixWorld(true);
 const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const views=c.views.map((view,index)=>{
  view.camera.updateMatrixWorld(true);const range={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,maxZ:-Infinity,minZ:Infinity};let count=0;
  for(const mesh of c.meshes(index)){
   const a=mesh.geometry.attributes.position;
   for(let i=0;i<a.count;i++){
    const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld).project(view.camera);count++;
    range.minX=Math.min(range.minX,p.x);range.maxX=Math.max(range.maxX,p.x);range.minY=Math.min(range.minY,p.y);range.maxY=Math.max(range.maxY,p.y);range.minZ=Math.min(range.minZ,p.z);range.maxZ=Math.max(range.maxZ,p.z);
   }
  }
  return {range,count,heightFraction:(range.maxY-range.minY)/2,camera:view.camera.position.toArray(),target:view.controls.target.toArray(),rect:rect(`#comparison-${view.kind}`)};
 });
 return {views,canvasCount:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,toolbar:rect('#assembly-toolbar'),panel:rect('#compare-panel'),caption:rect('.scene-caption'),card:rect('.knowledge-card'),stage:rect('.demonstration'),footer:rect('.lecture-footer'),buttons:[...document.querySelectorAll('#compare-panel button,#assembly-toolbar select')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}),active:c.active,url:v.heroRobotUrl,heroVisible:v.heroRobotModel.visible,offsetVisible:v.heroOffsetGroup.visible};
}
const ready=page=>page.waitForFunction(()=>app?.projection?.comparison?.active&&app.viewer.heroRobotModel?.visible&&!app.viewer.heroRobotPromise);
const cameraState=page=>page.evaluate(()=>app.projection.comparison.views.map(v=>({position:v.camera.position.toArray(),target:v.controls.target.toArray()})));
try{
 for(const [width,height]of [[1920,1080],[1366,768]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>report.errors.push(e.message));
  let expectedFailure=false;
  page.on('response',r=>{if(r.status()>=400&&!expectedFailure)report.failed.push(r.url());});
  await page.route('**/*',route=>{if(!['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)){report.external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`${base}/ui-v2.html?step=10`);await ready(page);
  const initial=await page.evaluate(metrics);assert.equal(initial.canvasCount,1);assert.equal(initial.overflow,false);assert.ok(initial.url.endsWith('hero_robot_clean.glb'));assert.equal(initial.offsetVisible,true);
  const assertFits=m=>{
   assert.equal(m.overflow,false);assert.ok(!overlaps(m.views[0].rect,m.views[1].rect));
   for(const view of m.views){assert.ok(view.count>0);assert.ok(view.heightFraction>.32,'模型主体过小');for(const [axis,n] of Object.entries(view.range))assert.ok(Math.abs(n)<(axis.endsWith('Z')?1:.99),`模型裁切或离开各自观察区：${axis}=${n}`);assert.ok(view.rect.width>250&&view.rect.height>180);}
   for(const item of [m.toolbar,m.panel,m.caption,...m.buttons]){assert.ok(!overlaps(item,m.card),'操作区覆盖右侧知识卡');assert.ok(item.x>=m.stage.x&&item.right<=m.stage.right+.5&&item.bottom<=m.stage.bottom+.5,'操作区越出演示区');assert.ok(!overlaps(item,m.footer),'操作区覆盖底栏');}
   assert.ok(!overlaps(m.views[0].rect,m.toolbar));assert.ok(!overlaps(m.panel,m.caption));
  };
  assertFits(initial);
  await page.screenshot({path:`${output}/original-subject-${width}.png`});
  // 左右真实拖拽仅改变自身相机。
  for(const index of[0,1]){
   const before=await cameraState(page),rect=initial.views[index].rect;
   await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.55);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.65,{steps:8});await page.mouse.up();await page.waitForTimeout(200);
   const after=await cameraState(page);assert.notDeepEqual(after[index],before[index]);assert.deepEqual(after[1-index],before[1-index]);
   await page.locator(`#comparison-${index===0?'teaching':'hero'} button`).click();
   const restoredCamera=(await cameraState(page))[index];
   assert.deepEqual(restoredCamera,{position:initial.views[index].camera,target:initial.views[index].target});
   await page.waitForTimeout(80);assert.deepEqual((await cameraState(page))[index],restoredCamera);
  }
  // 切换英雄资产不能重置教学车镜头。
  await page.evaluate(()=>{const view=app.projection.comparison.views[0];view.camera.position.x-=.02;view.controls.target.x-=.02;view.controls.update();});
  const beforeSwitch=await cameraState(page);
  await page.locator('#hero-asset').selectOption('inferred');await page.waitForFunction(()=>app.viewer.heroRobotUrl.endsWith('hero_robot_inferred.glb')&&!app.viewer.heroRobotPromise);
  const afterSwitch=(await cameraState(page))[0];
  const assetCameraMaxError=Math.max(...afterSwitch.position.map((v,i)=>Math.abs(v-beforeSwitch[0].position[i])));
  assert.ok(assetCameraMaxError<1e-12,'资产切换改变教学车视角，而非浮点舍入');
  assert.deepEqual(afterSwitch.target,beforeSwitch[0].target);
  assert.ok(Math.abs(afterSwitch.target[0]-initial.views[0].target[0]+.02)<1e-12,'切换后丢失教学车平移');
  assert.ok((await page.locator('#assembly-status').textContent()).includes('待机械核验'));
  const candidate=await page.evaluate(metrics);assertFits(candidate);
  await page.locator('#comparison-teaching button').click();
  await page.screenshot({path:`${output}/candidate-${width}.png`});
  const highlights=[];
  for(const kind of['frame','wheel','motor','power','control']){
   await page.locator(`.compare-btn[data-kind="${kind}"]`).click();
   const highlight=await page.evaluate(()=>{
    const v=app.viewer,c=v.comparisonHighlights,teaching=[],hero=[];let changed=0;
    for(const[mesh,original]of c){
     const materials=[mesh.material].flat();if(materials.every(m=>m.color?.getHex()===0x00cce6&&!m.vertexColors)&&mesh.material!==original)changed++;
     let root=mesh;while(root&&root!==v.carRoot&&root!==v.heroRobotModel)root=root.parent;
     if(root===v.carRoot)teaching.push(mesh.name);else if(root===v.heroRobotModel)hero.push(mesh.userData.cadName||mesh.name);
    }
    return {changed,total:c.size,teaching,hero};
   });
   assert.equal(highlight.changed,highlight.total);assert.ok(highlight.teaching.length>0,'教学车对应区域没有实际材质变化');
   if(['frame','wheel','motor'].includes(kind))assert.ok(highlight.hero.length>0,`英雄${kind}未实际高亮`);
   else{assert.equal(highlight.hero.length,0);assert.ok((await page.locator('#compare-status').textContent()).includes('未确认'));}
   assertFits(await page.evaluate(metrics));
   await page.screenshot({path:`${output}/highlight-${kind}-${width}.png`});highlights.push({kind,...highlight});
  }
  await page.evaluate(()=>app.viewer.clearComparisonHighlight());
  assert.equal(await page.evaluate(()=>app.viewer.comparisonHighlights.size),0);
  // 完整原样取景包含偏置组；原样/候选均可重载。
  await page.locator('#hero-asset').selectOption('original');await page.waitForFunction(()=>app.viewer.heroRobotUrl.endsWith('hero_robot_clean.glb')&&!app.viewer.heroRobotPromise);
  await page.locator('#hero-framing').selectOption('complete');
  const complete=await page.evaluate(metrics);assert.ok(complete.views[1].count>initial.views[1].count);for(const [axis,n]of Object.entries(complete.views[1].range))assert.ok(Math.abs(n)<(axis.endsWith('Z')?1:.99));
  await page.screenshot({path:`${output}/original-complete-${width}.png`});
  await page.locator('#hero-framing').selectOption('subject');
  // 退出恢复主相机layers及渲染状态，重入恢复双区；暂停不妨碍观察。
  await page.evaluate(()=>app.goToStep(8));await page.waitForFunction(()=>!app.projection.comparison.active);
  for(const selector of['#comparison-regions','#assembly-toolbar','#compare-panel'])assert.equal(await page.locator(selector).isVisible(),false,'Step10观察层或工具覆盖了普通教学步骤');
  const restored=await page.evaluate(()=>({layers:[...app.viewer.nodesMap.values()].map(n=>n.layers.mask),scissor:app.viewer.renderer.getScissorTest(),controls:app.viewer.controls.enabled}));
  assert.ok(restored.layers.every(mask=>mask===1));assert.equal(restored.scissor,false);assert.equal(restored.controls,true);
  await page.waitForFunction(()=>!app.viewer.isTransitioningCamera);
  const ordinaryCamera=await page.evaluate(()=>app.viewer.camera.position.toArray()),ordinaryRect=await page.locator('#canvas-container').boundingBox();
  await page.mouse.move(ordinaryRect.x+ordinaryRect.width*.5,ordinaryRect.y+ordinaryRect.height*.5);await page.mouse.down();await page.mouse.move(ordinaryRect.x+ordinaryRect.width*.65,ordinaryRect.y+ordinaryRect.height*.6,{steps:6});await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>app.viewer.camera.position.toArray()),ordinaryCamera,'退出比较后主OrbitControls无法操作');
  await page.evaluate(()=>app.goToStep(9));await ready(page);
  await page.locator('#btn-pause').click();await page.locator('#comparison-hero button').click();assert.equal(await page.evaluate(()=>app.paused),true);await page.locator('#btn-pause').click();
  // 高频切换最终请求优先：延迟旧候选回包，原样先完成，之后不能被候选覆盖。
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/hero_robot_inferred.glb',async route=>{await gate;await route.continue();});
  await page.locator('#hero-asset').selectOption('inferred');await page.waitForFunction(()=>app.viewer.heroPendingUrl?.endsWith('hero_robot_inferred.glb'));
  await page.locator('#hero-asset').selectOption('original');await page.waitForFunction(()=>app.viewer.heroRobotUrl.endsWith('hero_robot_clean.glb')&&!app.viewer.heroRobotPromise);
  const delayedResponse=page.waitForResponse(r=>r.url().endsWith('hero_robot_inferred.glb'));release();await delayedResponse;await page.waitForLoadState('networkidle');await page.waitForTimeout(200);
  assert.equal(await page.locator('#hero-asset').inputValue(),'original');assert.ok((await page.evaluate(()=>app.viewer.heroRobotUrl)).endsWith('hero_robot_clean.glb'));
  await page.unroute('**/hero_robot_inferred.glb');
  // 载入中离开第10步，迟到资源不得重开比较区或显示英雄模型。
  let releaseLeaving;const leavingGate=new Promise(resolve=>releaseLeaving=resolve);
  await page.route('**/hero_robot_inferred.glb',async route=>{await leavingGate;await route.continue();});
  await page.locator('#hero-asset').selectOption('inferred');await page.waitForFunction(()=>app.viewer.heroPendingUrl?.endsWith('hero_robot_inferred.glb'));
  await page.evaluate(()=>app.goToStep(8));const leavingResponse=page.waitForResponse(r=>r.url().endsWith('hero_robot_inferred.glb'));releaseLeaving();await leavingResponse;await page.waitForFunction(()=>!app.viewer.heroRobotPromise);
  assert.equal(await page.evaluate(()=>app.projection.comparison.active),false);assert.equal(await page.evaluate(()=>app.viewer.heroRobotModel.visible),false);
  await page.unroute('**/hero_robot_inferred.glb');
  // 失败回包同样不能污染其他步骤的模型标签。
  let releaseFailure;const failureGate=new Promise(resolve=>releaseFailure=resolve);
  await page.evaluate(()=>app.goToStep(9));await ready(page);
  await page.route('**/hero_robot_clean.glb',async route=>{await failureGate;await route.fulfill({status:503,body:'intentional late failure'});});
  expectedFailure=true;await page.locator('#hero-asset').selectOption('original');await page.waitForFunction(()=>app.viewer.heroPendingUrl?.endsWith('hero_robot_clean.glb'));
  await page.evaluate(()=>app.goToStep(8));const teachingTag=await page.locator('.model-tag').textContent();releaseFailure();await page.waitForFunction(()=>!app.viewer.heroRobotPromise);
  assert.equal(await page.locator('.model-tag').textContent(),teachingTag);expectedFailure=false;await page.unroute('**/hero_robot_clean.glb');
  // 重入并Resize（包含DPR=1单一renderer），独立视区仍正确拟合。
  await page.evaluate(()=>app.goToStep(9));await ready(page);assertFits(await page.evaluate(metrics));
  const tick=await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));return app.lastTime;});
  await page.waitForFunction(t=>app.lastTime>t,tick);
  assert.equal(await page.evaluate(()=>app.viewer.disposed),false);assert.equal(await page.locator('canvas').count(),1);
  // 加载失败时旧候选、标签和选择框都保留；失败请求是本测试明确注入的503。
  const oldUrl=await page.evaluate(()=>app.viewer.heroRobotUrl);assert.ok(oldUrl.endsWith('hero_robot_inferred.glb'));
  await page.route('**/hero_robot_clean.glb',route=>route.fulfill({status:503,body:'MR-3 intentional failure'}));expectedFailure=true;
  await page.locator('#hero-asset').selectOption('original');await page.waitForFunction(()=>document.querySelector('#assembly-status').textContent.includes('加载失败'));
  assert.equal(await page.evaluate(()=>app.viewer.heroRobotUrl),oldUrl);assert.equal(await page.locator('#hero-asset').inputValue(),'inferred');assert.ok((await page.locator('.model-tag').textContent()).includes('未机械核验'));
  expectedFailure=false;await page.unroute('**/hero_robot_clean.glb');
  await page.locator('#hero-asset').selectOption('original');await ready(page);assert.ok((await page.evaluate(()=>app.viewer.heroRobotUrl)).endsWith('hero_robot_clean.glb'));
  await page.setViewportSize({width:width-40,height:height-20});await page.waitForTimeout(150);assertFits(await page.evaluate(metrics));
  report.pages.push({width,height,initial,candidate,complete,highlights,assetCamera:{before:beforeSwitch[0],after:afterSwitch,maxError:assetCameraMaxError,tolerance:1e-12},independentControls:true,racePassed:true,exitRestorePassed:true,loadFailurePreserved:true});await page.close();
 }
 // DPR=2补充检查：仍只创建一个renderer，两个视区在高DPI下不互相裁切。
 const retina=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:2});
 retina.on('pageerror',e=>report.errors.push(e.message));await retina.goto(`${base}/ui-v2.html?step=10&assembly=inferred`);await ready(retina);
 const dpr=await retina.evaluate(()=>({ratio:app.viewer.renderer.getPixelRatio(),width:app.viewer.renderer.domElement.width,cssWidth:app.viewer.width,canvases:document.querySelectorAll('canvas').length}));
 assert.equal(dpr.ratio,2);assert.equal(dpr.width,Math.floor(dpr.cssWidth*2));assert.equal(dpr.canvases,1);
 const retinaMetrics=await retina.evaluate(metrics);for(const view of retinaMetrics.views)for(const[axis,n]of Object.entries(view.range))assert.ok(Math.abs(n)<(axis.endsWith('Z')?1:.99));
 await retina.screenshot({path:`${output}/candidate-dpr2-1366.png`,scale:'css'});report.dpr=dpr;await retina.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);assert.deepEqual(report.external,[]);
 report.passed=true;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('MR-3双观察区与高亮、独立相机、资产切换/迟到回包、布局回归通过。');
}catch(error){report.passed=false;report.failure=error.stack;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}
finally{await browser.close();}
