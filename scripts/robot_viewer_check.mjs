// 独立结构查看验收：真实点选、显隐、隔离恢复、可见取景，所有证据写.tmp。
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const output = process.env.OUTPUT_DIR || '.tmp/ci/robot-viewer';
mkdirSync(output, {recursive: true});
const base = process.argv[2] || 'http://127.0.0.1:8080';
const executablePath = process.env.BROWSER_PATH || (existsSync('.tmp/browser/chrome-linux/chrome') ? '.tmp/browser/chrome-linux/chrome' : chromium.executablePath());
const paths = ['web/models/hero_robot_clean.glb', 'web/models/hero_robot_inferred.glb', 'web/models/repairs/yaw-offset-inferred.json'];
const hashes = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const originalHashes = hashes();
const browser = await chromium.launch({executablePath, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const report = {environment: 'Chromium headless / SwiftShader; not physical GPU certification', hashes: originalHashes, pages: [], errors: [], failed: [], external: []};
const flags = page => page.evaluate(() => [...robotViewer.nodes].map(([i, n]) => [i, n.visible]));
const choose = async (page, index) => {
  await page.locator('#search').fill(String(index));
  await page.locator(`#structure-tree button[data-node-index="${index}"]`).click();
  assert.equal(await page.evaluate(() => robotViewer.selected), index);
};
async function geometryMetrics() {
  const T = await import('./vendor/three/three.module.js'), app = robotViewer;
  const bounds = app.boundsOfVisible(), size = bounds.getSize(new T.Vector3());
  app.root.updateWorldMatrix(true, true);app.viewer.camera.updateMatrixWorld(true);
  const range = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity};
  let count = 0;
  app.root.traverse(mesh => {
    if (!mesh.isMesh || !app.visibility.isVisible(mesh)) return;
    const a = mesh.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const p = new T.Vector3().fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld).project(app.viewer.camera);count++;
      for (const axis of ['X', 'Y', 'Z']) { const value = p[axis.toLowerCase()];range[`min${axis}`] = Math.min(range[`min${axis}`], value);range[`max${axis}`] = Math.max(range[`max${axis}`], value); }
    }
  });
  const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect();return {x: r.x, y: r.y, right: r.right, bottom: r.bottom}; };
  return {count, range, size: size.toArray(), bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, overflow: document.documentElement.scrollWidth > innerWidth, canvasCount: document.querySelectorAll('canvas').length, canvas: rect('#canvas'), panel: rect('.structure-panel'), footer: rect('footer'), buttons: [...document.querySelectorAll('.selection-tools button')].map(button => { const r = button.getBoundingClientRect();return {x: r.x, right: r.right, top: r.top, bottom: r.bottom}; })};
}
function assertFits(metrics) {
  assert.ok(metrics.count > 0);
  for (const [axis, value] of Object.entries(metrics.range)) assert.ok(Math.abs(value) < (axis.endsWith('Z') ? 1 : .99), `${axis}=${value}，结构被裁切`);
  assert.equal(metrics.canvasCount, 1);assert.equal(metrics.overflow, false);
  assert.ok(metrics.panel.right <= metrics.canvas.x);
  for (const b of metrics.buttons) assert.ok(b.right <= metrics.canvas.x && b.bottom <= metrics.footer.y && b.x >= 0 && b.top >= 0, '显隐工具覆盖画布或底栏');
}
try {
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    const page = await browser.newPage({viewport: {width, height}});
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.failed.push(response.url()); });
    await page.route('**/*', route => {
      if (!['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) { report.external.push(route.request().url());return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/viewer_full.html`);await page.waitForFunction(() => window.robotViewer?.visibility);
    const beforeFlags = await flags(page);
    assert.deepEqual(beforeFlags.filter(([, visible]) => !visible).map(([i]) => i), [549]);
    assert.equal(await page.locator('#structure-tree button[data-node-index]').count(), 574);
    const transforms = await page.evaluate(() => [...robotViewer.nodes].map(([i, n]) => [i, n.position.toArray(), n.quaternion.toArray(), n.scale.toArray()]));
    const initial = await page.evaluate(geometryMetrics);assertFits(initial);
    await page.screenshot({path: `${output}/default-${width}.png`});

    // 真实鼠标点击投影在表面的三角形，源节点由射线最近可见交点独立计算。
    const hit = await page.evaluate(async () => {
      const T = await import('./vendor/three/three.module.js'), e = robotViewer;
      const rect = e.viewer.renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
      e.root.updateWorldMatrix(true, true);e.viewer.camera.updateMatrixWorld(true);
      const meshes = [];e.root.traverse(o => { if (o.isMesh && e.visibility.isVisible(o)) meshes.push(o); });
      for (const mesh of meshes) {
        const a = mesh.geometry.attributes.position;
        for (let i = 0; i < a.count; i += 20) {
          const p = new T.Vector3().fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld).project(e.viewer.camera);
          if (Math.abs(p.x) > .8 || Math.abs(p.y) > .8) continue;
          ray.setFromCamera(new T.Vector2(p.x, p.y), e.viewer.camera);
          const first = ray.intersectObject(e.root, true).find(h => e.visibility.isVisible(h.object));
          for (let object = first?.object; object; object = object.parent) {
            if (e.indices.has(object)) return {index: e.indices.get(object), x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2};
          }
        }
      }
      throw new Error('未找到可见点击目标，不能用代码调用select替代鼠标验收');
    });
    await page.mouse.click(hit.x, hit.y);
    assert.equal(await page.evaluate(() => robotViewer.selected), hit.index);
    // 拖动仅旋转相机，不把松手误认为点选。
    const selected = await page.evaluate(() => robotViewer.selected);
    const rect = initial.canvas;
    const camera = await page.evaluate(() => viewer.camera.position.toArray());
    await page.mouse.move(rect.x + 150, rect.y + 100);await page.mouse.down();await page.mouse.move(rect.x + 220, rect.y + 140, {steps: 7});await page.mouse.up();
    assert.equal(await page.evaluate(() => robotViewer.selected), selected);
    assert.notDeepEqual(await page.evaluate(() => viewer.camera.position.toArray()), camera);
    await page.locator('#reset').click();

    // 自定义视角下，所有显隐按钮都不得重置位置、朝向、观察目标或投影参数。
    await choose(page, 543);
    await page.evaluate(() => {
      viewer.camera.position.x += .025;viewer.controls.target.x += .025;
      viewer.controls.update();
    });
    const preservedCamera = await page.evaluate(() => ({position: viewer.camera.position.toArray(), quaternion: viewer.camera.quaternion.toArray(), target: viewer.controls.target.toArray(), near: viewer.camera.near, far: viewer.camera.far, zoom: viewer.camera.zoom}));
    let cameraMaxError = 0;
    for (const action of ['hide-selected', 'show-selected', 'isolate-selected', 'exit-isolation', 'show-all', 'restore-default']) {
      await page.locator(`#${action}`).click();
      const after = await page.evaluate(() => ({position: viewer.camera.position.toArray(), quaternion: viewer.camera.quaternion.toArray(), target: viewer.controls.target.toArray(), near: viewer.camera.near, far: viewer.camera.far, zoom: viewer.camera.zoom}));
      for (const key of ['position', 'quaternion', 'target']) {
        const error = Math.max(...after[key].map((value, i) => Math.abs(value - preservedCamera[key][i])));
        cameraMaxError = Math.max(cameraMaxError, error);
        assert.ok(error < 1e-12, `${action}意外改变${key}，误差${error}`);
      }
      for (const key of ['near', 'far', 'zoom']) assert.equal(after[key], preservedCamera[key]);
    }
    await page.locator('#reset').click();

    await choose(page, 549);
    assert.equal(await page.locator('#structure-tree [data-node-index="549"]').getAttribute('data-visibility'), 'self-hidden');
    assert.equal(await page.locator('#structure-tree [data-node-index="552"]').getAttribute('data-visibility'), 'ancestor-hidden');
    await page.locator('#show-selected').click();
    await page.locator('#reset').click(); // 明确手动取景，显隐本身不再移动相机。
    const complete = await page.evaluate(geometryMetrics);assertFits(complete);
    assert.ok(Math.hypot(...complete.size) > Math.hypot(...initial.size) * 2);
    await page.locator('#restore-default').click();assert.deepEqual(await flags(page), beforeFlags);

    // 隐藏子件后显示其父组，不能抹掉子件自己的隐藏状态。
    await choose(page, 3);await page.locator('#hide-selected').click();
    await choose(page, 2);await page.locator('#hide-selected').click();await page.locator('#show-selected').click();
    assert.equal(await page.evaluate(() => robotViewer.nodes.get(3).visible), false);
    const snapshot = await flags(page);
    await choose(page, 4);await page.locator('#isolate-selected').click();
    await page.locator('#focus-selected').click();assertFits(await page.evaluate(geometryMetrics));
    assert.equal(await page.evaluate(() => robotViewer.visibility.isolatedIndex), 4);
    assert.equal(await page.evaluate(() => robotViewer.visibility.isVisible(robotViewer.nodes.get(5))), false);
    await page.screenshot({path: `${output}/isolated-${width}.png`});
    await choose(page, 549);await page.locator('#isolate-selected').click();
    await page.locator('#focus-selected').click();assertFits(await page.evaluate(geometryMetrics));
    await page.locator('#exit-isolation').click();assert.deepEqual(await flags(page), snapshot);
    // 显示被祖先隐藏的节点；兄弟结构仍保持其自身隐藏位。
    await choose(page, 2);await page.locator('#hide-selected').click();
    await choose(page, 4);await page.locator('#show-selected').click();
    assert.equal(await page.evaluate(() => robotViewer.nodes.get(2).visible), true);
    assert.equal(await page.evaluate(() => robotViewer.nodes.get(3).visible), false);

    await page.locator('#show-all').click();assert.ok((await flags(page)).every(([, visible]) => visible));
    await page.locator('#reset').click();assertFits(await page.evaluate(geometryMetrics));await page.screenshot({path: `${output}/all-visible-${width}.png`});
    await page.locator('#restore-default').click();assert.deepEqual(await flags(page), beforeFlags);
    // 整车全部隐藏时不产生NaN相机，仍可从树/全显恢复。
    await choose(page, 1);await page.locator('#hide-selected').click();
    assert.equal(await page.evaluate(() => robotViewer.boundsOfVisible().isEmpty()), true);
    assert.equal(await page.evaluate(() => viewer.camera.position.toArray().every(Number.isFinite)), true);
    assert.ok((await page.locator('#status').textContent()).includes('没有可见几何'));
    await page.locator('#restore-default').click();assertFits(await page.evaluate(geometryMetrics));

    await choose(page, 4);await page.locator('#search').fill('');
    await page.locator('#search').focus();await page.keyboard.press('h');
    assert.equal(await page.evaluate(() => robotViewer.nodes.get(4).visible), true, '搜索输入不能触发隐藏快捷键');
    await page.locator('#search').fill('');await page.locator('#search').evaluate(input => input.blur());
    await page.keyboard.press('h');assert.equal(await page.evaluate(() => robotViewer.nodes.get(4).visible), false);
    await page.keyboard.press('Shift+h');assert.equal(await page.evaluate(() => robotViewer.nodes.get(4).visible), true);
    await page.locator('#focus-selected').click();assertFits(await page.evaluate(async () => {
      // 聚焦只保证选中可见结构入画，而非周围整车。
      const e = robotViewer, state = [...e.nodes].filter(([i]) => i !== e.selected).map(([, n]) => [n, n.visible]);
      // 不修改显隐来伪造聚焦证据，下面单独检查选中盒投影。
      const T = await import('./vendor/three/three.module.js');const bounds = e.boundsOfVisible(e.nodes.get(e.selected));
      e.viewer.camera.updateMatrixWorld(true);const range = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity};
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new T.Vector3(x, y, z).project(e.viewer.camera);for (const axis of ['X', 'Y', 'Z']) { range[`min${axis}`] = Math.min(range[`min${axis}`], p[axis.toLowerCase()]);range[`max${axis}`] = Math.max(range[`max${axis}`], p[axis.toLowerCase()]); }
      }
      const r = selector => { const b = document.querySelector(selector).getBoundingClientRect();return {x: b.x, y: b.y, right: b.right, bottom: b.bottom}; };
      return {count: state.length, range, canvasCount: document.querySelectorAll('canvas').length, overflow: document.documentElement.scrollWidth > innerWidth, panel: r('.structure-panel'), canvas: r('#canvas'), footer: r('footer'), buttons: []};
    }));
    await page.locator('#reset').click();
    await page.locator('#wire').click();assert.equal(await page.evaluate(() => {let ok = true;robotViewer.root.traverse(n => {if (n.isMesh) for (const m of [n.material].flat()) ok &&= m.wireframe;});return ok;}), true);
    await page.locator('#wire').click();
    const angle = await page.evaluate(() => viewer.camera.position.toArray());await page.locator('#rotate').click();
    await page.waitForFunction(before => viewer.camera.position.toArray().some((value, i) => value !== before[i]), angle);
    assert.notDeepEqual(await page.evaluate(() => viewer.camera.position.toArray()), angle);await page.locator('#rotate').click();
    await page.evaluate(() => {window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}));});
    assert.equal(await page.evaluate(() => viewer.disposed), false);
    assert.deepEqual(await page.evaluate(() => [...robotViewer.nodes].map(([i, n]) => [i, n.position.toArray(), n.quaternion.toArray(), n.scale.toArray()])), transforms);
    await page.locator('#restore-default').click();assert.deepEqual(await flags(page), beforeFlags);
    report.pages.push({width, height, initial, complete, pointSelectedIndex: hit.index, selectionPassed: true, isolationSnapshotPassed: true, visibilityPreservesCamera: true, cameraMaxError, cameraTolerance: 1e-12, originalTransformsUnchanged: true});
    await page.close();
  }
  assert.deepEqual(hashes(), originalHashes);assert.deepEqual(report.errors, []);assert.deepEqual(report.failed, []);assert.deepEqual(report.external, []);
  report.passed = true;writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));console.log('独立查看页通过：默认隐藏549、点选/拖动、结构树显隐、隔离快照、可见取景、双分辨率与资产哈希。');
} catch (error) {
  report.passed = false;report.failure = error.stack;writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));throw error;
} finally {await browser.close();}
