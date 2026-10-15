// 第一章浏览器验收：仅本地HTTP + Chromium软件渲染，不是机械/硬件性能认证。
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TOUR_SCENES} from '../web/js/hero-tour-config.js';
const output = process.env.OUTPUT_DIR || '.tmp/ci/hero-tour';
const base = process.argv[2] || 'http://127.0.0.1:8080';
mkdirSync(output, {recursive: true});
const paths = ['hero_robot_step_aligned.glb','hero_robot_clean.glb','hero_robot_inferred.glb','diff_car_teaching.glb','repairs/yaw-offset-inferred.json','repairs/yaw-step-aligned.json'];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(`web/models/${p}`)).digest('hex')]));
const report = {passed: false, hashes: hashes(), pages: [], failures: [], external: [], errors: [], httpFailures: [], environment: 'Chromium headless SwiftShader. Renderer counters are not total process/GPU memory, a leak proof or classroom hardware performance certification.'};
const executablePath = process.env.BROWSER_PATH || (existsSync('.tmp/browser/chrome-linux/chrome') ? '.tmp/browser/chrome-linux/chrome' : chromium.executablePath());
let browser;
const settled = page => page.waitForFunction(() => window.heroTour?.ready && !heroTour.transitioning, null, {timeout: 30000});
const camera = page => page.evaluate(() => [...heroTour.viewer.camera.position.toArray(), ...heroTour.viewer.controls.target.toArray()]);
const near = (a,b) => assert.ok(Math.max(...a.map((v,i) => Math.abs(v-b[i]))) < 1e-9, '相机重复进入后漂移');

// 局部场景只检查目标子树完整入镜，其他全显结构允许出画，不将其误判为错误隐藏。
async function metrics(page, indices = []) {
  return page.evaluate(async ids => {
    const T = await import('./vendor/three/three.module.js');
    const t = heroTour, seen = new Set();
    t.root.updateWorldMatrix(true, true); t.viewer.camera.updateMatrixWorld(true);
    let count=0, maxXY=0, maxZ=0;
    for (const root of ids.length ? ids.map(i => t.nodes.get(i)) : [t.root]) root.traverse(o => {
      if (!o.isMesh || seen.has(o) || !t.visibility.isVisible(o)) return;
      seen.add(o);
      const a=o.geometry.attributes.position;
      for (let i=0;i<a.count;i++) {
        const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(t.viewer.camera);
        maxXY=Math.max(maxXY,Math.abs(p.x),Math.abs(p.y)); maxZ=Math.max(maxZ,Math.abs(p.z)); count++;
      }
    });
    return {count,maxXY,maxZ,hidden:[...t.nodes].filter(([,o])=>!t.visibility.isVisible(o)).map(([i])=>i), overflow:document.documentElement.scrollWidth>innerWidth, canvases:document.querySelectorAll('canvas').length};
  }, indices);
}
function fits(m) {
  assert.ok(m.count>0 && m.maxXY<.99 && m.maxZ<1, `目标取景不完整 ${JSON.stringify(m)}`);
  assert.equal(m.overflow,false); assert.equal(m.canvases,1);
}
async function localOnly(page, expectedFailure = false) {
  page.on('pageerror',e=>report.errors.push(e.message));
  if (!expectedFailure) page.on('response',r=>{if(r.status()>=400)report.httpFailures.push(r.url());});
  await page.route('**/*',route=>{
    if (['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)) return route.continue();
    report.external.push(route.request().url()); return route.abort();
  });
}
async function detail(page, id) {
  await page.locator(`[data-detail="${id}"]`).click(); await settled(page);
}
try {
  browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const fail=await browser.newPage(); await localOnly(fail,true);
  const requests=[];
  fail.on('request',r=>{if(/hero_robot_.*\.glb/.test(r.url()))requests.push(r.url());});
  const controlSelector = '#tour-prev,#tour-next,#tour-reset,#tour-replay,#tour-rotate,#tour-reveal,#tour-isolate';
  let loadingDisabled;
  await fail.route('**/hero_robot_step_aligned.glb',async r=>{
    loadingDisabled=await fail.locator(controlSelector).evaluateAll(buttons=>buttons.map(b=>b.disabled));
    await r.fulfill({status:503,body:'intentional failure'});
  });
  await fail.goto(`${base}/hero-tour.html`);
  await fail.waitForFunction(()=>window.heroTour && document.querySelector('#tour-status').textContent.includes('加载失败'));
  assert.equal(await fail.evaluate(()=>heroTour.ready),false);
  assert.deepEqual(loadingDisabled,Array(7).fill(true),'加载中控制应禁用');
  assert.deepEqual(await fail.locator(controlSelector).evaluateAll(buttons=>buttons.map(b=>b.disabled)),Array(7).fill(true),'失败时控制应保持禁用');
  assert.equal(requests.length,1); assert.ok(requests[0].endsWith('/hero_robot_step_aligned.glb'));
  report.failures.push({status:503,explicitError:true,noFallback:true}); await fail.close();

  for (const [width,height] of [[1920,1080],[1366,768]]) {
    const page=await browser.newPage({viewport:{width,height}}); await localOnly(page);
    await page.goto(`${base}/hero-tour.html`); await settled(page);
    // 保留真实材质对象引用，并保存其全部可序列化属性；不以克隆副本作比较基准。
    await page.evaluate(()=>{
      const root=heroTour.root, materials=new Set(), meshes=[];
      root.traverse(o=>{if(o.isMesh){meshes.push([o,o.material]);[o.material].flat().forEach(m=>materials.add(m));}});
      window.tourBaseline={nodes:[...heroTour.nodes].map(([i,o])=>[i,o.matrix.toArray()]),meshes,materials:[...materials].map(m=>[m,JSON.stringify(m.toJSON())])};
    });
    const result={width,height,scenes:[],resourceCycles:[]};
    for (let scene=0;scene<6;scene++) {
      if(scene) {await page.locator('#tour-next').click(); await settled(page);}
      assert.equal(await page.evaluate(()=>heroTour.sceneIndex),scene);
      assert.equal(await page.locator('#tour-title').innerText(),TOUR_SCENES[scene].title);
      if(scene===0) {
        assert.equal(await page.evaluate(()=>heroTour.viewer.controls.autoRotate),true);
        await page.locator('#tour-rotate').click();
        assert.equal(await page.evaluate(()=>heroTour.viewer.controls.autoRotate),false);
        await page.waitForTimeout(600);
        assert.equal(await page.evaluate(()=>heroTour.sceneIndex),0);
        await page.locator('#tour-reset').click(); await settled(page);
      }
      if(scene===1) {
        for(const key of ['gimbal','chassis','launcher']) {
          await page.locator('#tour-reveal').click();
          const button=page.locator(`[data-module="${key}"]`);
          assert.equal(await button.innerText(),{gimbal:'云台',chassis:'底盘',launcher:'发射机构'}[key]);
          await button.click(); assert.equal(await page.evaluate(()=>heroTour.sceneIndex),1);
        }
      }
      const ids=scene===2?[389]:scene===3?[135]:scene===4?[2,394]:[];
      const m=await metrics(page,ids); fits(m); assert.deepEqual(m.hidden,[]);
      if(scene===2 || scene===3 || scene===4) {
        const highlighted=await page.evaluate(ids=>{
          const targets=new Set(); ids.forEach(i=>heroTour.nodes.get(i).traverse(o=>{if(o.isMesh)targets.add(o);}));
          return tourBaseline.meshes.filter(([o,original])=>targets.has(o)&&o.material!==original).length;
        },ids);
        assert.ok(highlighted>0,'模块入场未强调目标结构');
      }
      await page.screenshot({path:`${output}/scene-${scene}-${width}.png`});
      result.scenes.push({scene,title:TOUR_SCENES[scene].title,metrics:m});
      if(scene===2) {
        const before=await camera(page); await detail(page,'belt');
        await page.locator('#tour-replay').click(); await settled(page); near(await camera(page),before);
      }
      if(scene===3) {
        assert.equal(await page.locator('#tour-isolate').isDisabled(),true);
        for(const [id,ids] of [['wheel-a',[139]],['wheel-b',[152]],['wheel-c',[166]],['wheel-d',[248]],['drive',[142,155,171,254]]]) {
          await detail(page,id); await page.locator('#tour-isolate').click();
          const isolated=await metrics(page,ids); fits(isolated); assert.ok(isolated.hidden.length>0);
          await page.locator('#tour-isolate').click(); assert.deepEqual((await metrics(page,ids)).hidden,[]);
        }
      }
      if(scene===4) {
        for(const id of ['channel','feeder','friction']) {
          await detail(page,id); await page.locator('#tour-isolate').click();
          assert.ok((await metrics(page)).hidden.length>0);
          await page.locator('#tour-reset').click(); await settled(page);
          const restored=await metrics(page); fits(restored); assert.deepEqual(restored.hidden,[]);
        }
      }
      if(scene===5) {
        assert.equal(await page.locator('#tour-continue').isVisible(),true);
        const link=await page.locator('#tour-continue').getAttribute('href');
        assert.equal(link,'./ui-v2.html?step=3');
      }
    }
    // 过渡期间的暂停意图不能被动画完成回调覆盖。
    await page.evaluate(()=>heroTour.goTo(0));
    assert.equal(await page.evaluate(()=>heroTour.transitioning),true);
    await page.locator('#tour-rotate').click(); await settled(page);
    assert.equal(await page.evaluate(()=>heroTour.viewer.controls.autoRotate),false);
    assert.equal(await page.locator('#tour-rotate').getAttribute('aria-pressed'),'false');
    // UI产生过渡后真实拖动取消，随后等待超过过渡时长，确认没有旧动画重新接管。
    await page.evaluate(()=>heroTour.goTo(5)); await settled(page);
    await page.locator('#tour-prev').click();
    assert.equal(await page.evaluate(()=>heroTour.transitioning),true);
    const box=await page.locator('#tour-canvas').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+20,{steps:5}); await page.mouse.up();
    assert.equal(await page.evaluate(()=>heroTour.transitioning),false);
    await page.waitForTimeout(850); assert.equal(await page.evaluate(()=>heroTour.transitioning),false);
    // 压力切换使用公开入口，随后按真实逐页渲染记录预热后资源平台。
    await page.evaluate(()=>{for(const i of [0,2,4,1,5])heroTour.goTo(i);}); await settled(page);
    assert.equal(await page.evaluate(()=>heroTour.sceneIndex),5);
    for(let cycle=0;cycle<4;cycle++) {
      for(let i=0;i<6;i++) {await page.evaluate(i=>heroTour.goTo(i),i); await settled(page);}
      result.resourceCycles.push(await page.evaluate(()=>{
        const r=heroTour.viewer.renderer.info;
        return {geometries:r.memory.geometries,textures:r.memory.textures,programs:r.programs.length};
      }));
    }
    assert.deepEqual(result.resourceCycles[3],result.resourceCycles[1],'预热后资源计数没有保持平台');
    await page.evaluate(()=>heroTour.goTo(1)); await settled(page);
    await page.locator('#tour-reset').click(); await settled(page);
    assert.deepEqual((await metrics(page)).hidden,[]);
    const invariant=await page.evaluate(()=>({
      matrices:tourBaseline.nodes.every(([i,a])=>heroTour.nodes.get(i).matrix.toArray().every((v,k)=>v===a[k])),
      materialRefs:tourBaseline.meshes.every(([o,m])=>o.material===m),
      materialProperties:tourBaseline.materials.every(([m,s])=>JSON.stringify(m.toJSON())===s)
    }));
    assert.deepEqual(invariant,{matrices:true,materialRefs:true,materialProperties:true});
    result.invariant=invariant; report.pages.push(result); await page.close();
  }
  assert.deepEqual(hashes(),report.hashes);
  assert.deepEqual(report.external,[]); assert.deepEqual(report.errors,[]); assert.deepEqual(report.httpFailures,[]);
  report.passed=true; console.log('第一章双分辨率六场景、交互、资源计数与冻结保护验收通过。');
} catch(error) {
  report.failure=error.stack; process.exitCode=1; console.error(error);
} finally {
  await browser?.close(); writeFileSync(`${output}/hero-tour-report.json`,JSON.stringify(report,null,2)+'\n');
}
