// 编辑器端到端验收：所有证据与未核实临时导出均进入.tmp，不覆盖课堂模型。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import validator from 'gltf-validator';
import {parseGlb,getNodeTransform} from '../web/js/model-editor/glb-transform-writer.js';
import {validateExport} from '../web/js/model-editor/validation.js';
const output=process.env.OUTPUT_DIR||'.tmp/ci/model-editor';mkdirSync(output,{recursive:true});
const originalBytes=readFileSync('web/models/hero_robot_clean.glb');
const originalHash=createHash('sha256').update(originalBytes).digest('hex');
const parsed=parseGlb(originalBytes);
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.argv[2]||'http://127.0.0.1:8080';
const report={sourceHash:originalHash,pages:[],errors:[],external:[],failed:[]};
let page;
try{
 for(const [width,height]of [[1920,1080],[1366,768]]){
  page=await browser.newPage({viewport:{width,height},acceptDownloads:true});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)report.failed.push(r.url());});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(!['localhost','127.0.0.1'].includes(url.hostname)){report.external.push(url.href);return route.abort();}
   return route.continue();
  });
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(`${base}/model-editor.html`);
  await page.locator('#load-course').click();
  await page.waitForFunction(()=>window.modelEditor?.source);
  const sourceInfo=await page.evaluate(()=>({hash:modelEditor.source.hash,count:modelEditor.source.nodes.size,total:modelEditor.source.parsed.document.nodes.length,candidates:modelEditor.candidates}));
  assert.equal(sourceInfo.hash,originalHash);assert.equal(sourceInfo.count,sourceInfo.total);assert.ok(sourceInfo.candidates.length>0);
  writeFileSync(`${output}/candidates.json`,JSON.stringify(sourceInfo.candidates,null,2));
  await page.screenshot({path:`${output}/overview-${width}.png`});
  const performanceSample=await page.evaluate(async()=>{
    const timestamps=[];await new Promise(resolve=>{const frame=t=>{timestamps.push(t);if(timestamps.length<31)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
    const gaps=timestamps.slice(1).map((v,i)=>v-timestamps[i]).sort((a,b)=>a-b);
    return {softwareRendering:true,sampleFrames:30,medianMs:gaps[15],p95Ms:gaps[28],jsHeapSampleBytes:performance.memory?.usedJSHeapSize,rendererMemory:{...modelEditor.renderer.info.memory}};
  });
  const target=sourceInfo.candidates.find(c=>c.name.includes('yaw'))||sourceInfo.candidates[0];
  const index=target.index;
  await page.locator('#search').fill(String(index));
  await page.locator(`#tree button[data-node-index="${index}"]`).click();
  assert.equal(await page.evaluate(()=>modelEditor.selected),index);
  await page.locator('#focus').click();
  await page.waitForTimeout(300);
  await page.screenshot({path:`${output}/before-${width}.png`});
  const before=await page.evaluate(i=>{const o=modelEditor.source.nodes.get(i);return {translation:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray()};},index);
  const other=await page.evaluate(i=>{const e=[...modelEditor.source.nodes].find(([n,o])=>n!==i&&o.isMesh);return {index:e[0],translation:e[1].position.toArray(),rotation:e[1].quaternion.toArray()};},index);
  // 数值输入：真实操作DOM，角度输入度数。
  await page.locator('#px').fill(String(before.translation[0]+.05));
  await page.locator('#rz').fill('12');
  await page.locator('#apply').click();
  assert.ok(await page.evaluate(()=>modelEditor.dirty));
  const edited=await page.evaluate(i=>modelEditor.source.nodes.get(i).position.x,index);
  assert.ok(Math.abs(edited-before.translation[0]-.05)<1e-7);
  assert.ok(await page.evaluate(i=>modelEditor.source.nodes.get(i).quaternion.toArray().every(Number.isFinite),index));
  await page.locator('#undo').click();
  assert.ok(Math.abs(await page.evaluate(i=>modelEditor.source.nodes.get(i).position.x,index)-before.translation[0])<1e-8);
  await page.locator('#redo').click();
  assert.ok(Math.abs(await page.evaluate(i=>modelEditor.source.nodes.get(i).position.x,index)-edited)<1e-8);
  // 空间轴与模式切换；真正的手柄拖动由投影后的X轴触发。
  await page.locator('#space').selectOption('world');await page.locator('#translate').click();
  await page.locator('#focus').click();await page.waitForTimeout(150);
  const drag=await page.evaluate(async()=>{
   const T=await import('./vendor/three/three.module.js');
   const e=modelEditor;const rect=e.renderer.domElement.getBoundingClientRect();
   e.scene.updateMatrixWorld(true);e.camera.updateMatrixWorld(true);
   const handle=e.gizmo._gizmo.picker.translate.children.find(n=>n.name==='X');
   handle.geometry.computeBoundingBox();
   const center=handle.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(handle.matrixWorld).project(e.camera);
   return {x:rect.x+(center.x+1)*rect.width/2,y:rect.y+(1-center.y)*rect.height/2};
  });
  const preDrag=await page.evaluate(()=>modelEditor.changes());
  await page.mouse.move(drag.x,drag.y);await page.mouse.down();await page.mouse.move(drag.x+35,drag.y,{steps:8});await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>modelEditor.changes()),preDrag,'移动手柄实际拖拽未更新节点');
  await page.locator('#rotate').click();assert.equal(await page.evaluate(()=>modelEditor.gizmo.mode),'rotate');
  await page.locator('#space').selectOption('local');
  await page.waitForTimeout(100);
  const rotationDrag=await page.evaluate(async()=>{
    const T=await import('./vendor/three/three.module.js'),e=modelEditor;
    e.scene.updateMatrixWorld(true);e.camera.updateMatrixWorld(true);
    const rect=e.renderer.domElement.getBoundingClientRect(),picker=e.gizmo._gizmo.picker.rotate;
    const ring=picker.children.find(n=>n.name==='E'),position=ring.geometry.attributes.position;
    const center=e.source.nodes.get(e.selected).getWorldPosition(new T.Vector3()).project(e.camera);
    const pivot={x:rect.x+(center.x+1)*rect.width/2,y:rect.y+(1-center.y)*rect.height/2};
    const points=[];
    for(let i=0;i<position.count;i+=4){
      const point=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(ring.matrixWorld).project(e.camera);
      const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(point.x,point.y),e.camera);
      if(ray.intersectObject(picker,true).find(hit=>hit.object.visible)?.object.name!=='E')continue;
      const x=rect.x+(point.x+1)*rect.width/2,y=rect.y+(1-point.y)*rect.height/2;
      if(x<rect.left+10||x>rect.right-10||y<rect.top+10||y>rect.bottom-10)continue;
      points.push({x,y,pivot});
    }
    return points;
  });
  const preRotation=await page.evaluate(()=>modelEditor.source.nodes.get(modelEditor.selected).quaternion.toArray());
  let rotationPoint;
  for(const point of rotationDrag){await page.mouse.move(point.x,point.y);if(await page.evaluate(()=>modelEditor.gizmo.axis==='E')){rotationPoint=point;break;}}
  assert.ok(rotationPoint,'真实指针没有命中旋转环');
  await page.mouse.down();assert.equal(await page.evaluate(()=>modelEditor.gizmo.dragging),true);
  const dx=rotationPoint.x-rotationPoint.pivot.x,dy=rotationPoint.y-rotationPoint.pivot.y;
  for(let i=1;i<=8;i++){const a=i*.035;await page.mouse.move(rotationPoint.pivot.x+dx*Math.cos(a)-dy*Math.sin(a),rotationPoint.pivot.y+dx*Math.sin(a)+dy*Math.cos(a));}
  await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>modelEditor.source.nodes.get(modelEditor.selected).quaternion.toArray()),preRotation,'旋转手柄真实拖拽未更新四元数');
  // 输入框内快捷键不能更改操作模式；非输入区快捷键可用。
  await page.locator('#note').focus();await page.keyboard.press('w');assert.equal(await page.evaluate(()=>modelEditor.gizmo.mode),'rotate');
  await page.keyboard.press('Backspace');await page.locator('#note').evaluate(el=>el.blur());
  await page.keyboard.press('w');assert.equal(await page.evaluate(()=>modelEditor.gizmo.mode),'translate');
  await page.keyboard.press('e');assert.equal(await page.evaluate(()=>modelEditor.gizmo.mode),'rotate');
  // 隔离/隐藏均不改变patch变换。
  const editsBeforeVisibility=await page.evaluate(()=>modelEditor.changes());
  await page.locator('#isolate').click();await page.locator('#hide').click();
  assert.deepEqual(await page.evaluate(()=>modelEditor.changes()),editsBeforeVisibility);
  await page.locator('#show-all').click();
  await page.screenshot({path:`${output}/edited-${width}.png`});
  // 异步保存中的说明变化必须拒绝，不能把旧文件当成新说明已保存。
  const saveRace=await page.evaluate(async()=>{
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest=async(...args)=>{await new Promise(resolve=>setTimeout(resolve,80));return digest(...args);};
    const note=document.querySelector('#note'),old=note.value;
    try{const pending=modelEditor.savePatch();note.value=old+' 新说明';note.dispatchEvent(new Event('input'));try{await pending;return null;}catch(error){return error.message;}}
    finally{crypto.subtle.digest=digest;note.value=old;note.dispatchEvent(new Event('input'));}
  });
  assert.ok(saveRace?.includes('说明发生变化'));
  const save=page.waitForEvent('download');await page.locator('#save-patch').click();
  const patchDownload=await save;const patchPath=`${output}/draft-${width}.json`;await patchDownload.saveAs(patchPath);
  const patch=JSON.parse(readFileSync(patchPath,'utf8'));
  assert.equal(patch.source.sha256,originalHash);assert.equal(patch.edits.length,1);assert.equal(patch.edits[0].nodeIndex,index);assert.equal(patch.edits[0].verifiedAgainstCAD,false);
  const exportEvent=page.waitForEvent('download');await page.locator('#export-glb').click();
  const glbDownload=await exportEvent;const glbPath=`${output}/draft-${width}.glb`;await glbDownload.saveAs(glbPath);
  const exported=readFileSync(glbPath);
  const after=parseGlb(exported);
  validateExport(parsed,exported,[{nodeIndex:index}]);
  const issues=(await validator.validateBytes(new Uint8Array(exported))).issues;
  assert.equal(issues.numErrors,0);assert.equal(issues.numWarnings,0);
  assert.deepEqual(getNodeTransform(after.document.nodes[other.index]),getNodeTransform(parsed.document.nodes[other.index]));
  await page.locator('#reset-node').click();
  assert.ok(Math.abs(await page.evaluate(i=>modelEditor.source.nodes.get(i).position.x,index)-before.translation[0])<1e-8);
  await page.locator('#patch-file').setInputFiles(patchPath);
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('补丁已应用'));
  assert.equal((await page.evaluate(()=>modelEditor.changes())).length,1);
  // 错误源hash补丁必须整体拒绝且状态不变，不让预期错误污染pageerror。
  const bad={...patch,source:{...patch.source,sha256:'0'.repeat(64)}};
  const state=await page.evaluate(()=>modelEditor.changes());
  const rejection=await page.evaluate(async value=>{try{await modelEditor.importPatch(new File([JSON.stringify(value)],'wrong.json'));return null;}catch(e){return e.message;}},bad);
  assert.ok(rejection);assert.deepEqual(await page.evaluate(()=>modelEditor.changes()),state);
  // 通过文件选择器重新打开导出GLB，再打开原GLB+补丁。
  await page.locator('#file').setInputFiles(glbPath);
  await page.waitForFunction(h=>modelEditor.source.hash!==h,originalHash);
  assert.equal(await page.evaluate(()=>modelEditor.source.parsed.document.nodes.length),parsed.document.nodes.length);
  await page.locator('#file').setInputFiles('web/models/hero_robot_clean.glb');
  await page.waitForFunction(h=>modelEditor.source.hash===h,originalHash);
  await page.locator('#patch-file').setInputFiles(patchPath);
  await page.waitForFunction(()=>modelEditor.changes().length===1);
  // 真实父装配组移动：子件局部变换不变、世界位置随父变化。
  const parentIndex=parsed.document.nodes.findIndex(node=>node.children?.includes(index));
  assert.ok(parentIndex>=0);
  const childBefore=await page.evaluate(async i=>{const T=await import('./vendor/three/three.module.js');const o=modelEditor.source.nodes.get(i);o.updateWorldMatrix(true,false);return {local:o.position.toArray(),world:o.getWorldPosition(new T.Vector3()).toArray()};},index);
  await page.locator('#search').fill(String(parentIndex));
  await page.locator(`#tree button[data-node-index="${parentIndex}"]`).click();
  assert.ok((await page.locator('#group-warning').textContent()).includes('子组件'));
  const parentX=Number(await page.locator('#px').inputValue());
  await page.locator('#px').fill(String(parentX+.03));await page.locator('#apply').click();
  const childAfter=await page.evaluate(async i=>{const T=await import('./vendor/three/three.module.js');const o=modelEditor.source.nodes.get(i);return {local:o.position.toArray(),world:o.getWorldPosition(new T.Vector3()).toArray()};},index);
  assert.deepEqual(childAfter.local,childBefore.local);assert.notDeepEqual(childAfter.world,childBefore.world);
  await page.locator('#undo').click();await page.locator('#redo').click();
  const combined=await page.evaluate(async()=>{
    const {createPatch}=await import('./js/model-editor/repair-patch.js');
    const e=modelEditor;return createPatch(e.source.parsed,e.changes(),e.source.filename,'父子同时编辑测试，非机械修复',false);
  });
  assert.equal(combined.edits.length,2);
  await page.evaluate(async patch=>modelEditor.importPatch(new File([JSON.stringify(patch)],'parent-child.json')),combined);
  assert.equal(await page.evaluate(()=>modelEditor.changes().length),2);
  await page.locator('#reset-all').click();assert.deepEqual(await page.evaluate(()=>modelEditor.changes()),[]);
  // 未保存导航真正触发beforeunload；取消导航后编辑仍保留。
  await page.locator('#px').fill(String(parentX+.02));await page.locator('#apply').click();
  page.removeAllListeners('dialog');let beforeUnloadSeen=false;
  page.on('dialog',async d=>{if(d.type()==='beforeunload'){beforeUnloadSeen=true;await d.dismiss();}else await d.accept();});
  await page.locator('header a').click({noWaitAfter:true});await page.waitForTimeout(200);
  assert.equal(beforeUnloadSeen,true);assert.ok(page.url().includes('model-editor.html'));
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.pages.push({width,height,target:index,mapped:sourceInfo.count,performanceSample,validator:issues,passed:true});
  await page.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.failed,[]);
 assert.equal(createHash('sha256').update(readFileSync('web/models/hero_robot_clean.glb')).digest('hex'),originalHash);
 report.passed=true;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('编辑器双分辨率验收通过；源模型哈希未变、导出GLB校验0错误0警告。');
}catch(error){
 report.passed=false;report.failure=error.stack;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 if(page)await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});throw error;
}finally{await browser.close();}
