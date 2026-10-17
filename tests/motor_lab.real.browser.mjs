/**
 * Motor Lab 真实模型接入 + 自动连线 + 自由 orbit 端到端验收测试。
 *
 * 职责:
 *   - 通过 child_process.spawn 启动一次 scripts/run_motor_lab_local.py（仅回环），
 *     解析其 readiness JSON 拿实际 URL，finally 中仅终止自己启动的进程。
 *   - 用 Playwright 无头浏览器（swiftshader）验证真实模型接入与交互链路。
 *
 * 前端契约（由前端代理并行落地，未落地时如实记录并跳过对应断言，不虚报）:
 *   window.motorLab.getState()          - 只读状态
 *   window.motorLab.getSceneStatus()    - { ready, errors, models:[{id,loaded,meshCount,source}],
 *                                          ports:[{id,x,y,visible}], cameraPosition?, cameraTarget? }
 *
 * 输出目录: MOTOR_LAB_OUTPUT（默认 .tmp/motor-lab-real-check）
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const PROJECT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(PROJECT, process.env.MOTOR_LAB_OUTPUT || '.tmp/motor-lab-real-check');
const BROWSER = process.env.BROWSER_PATH || path.join(PROJECT, '.tmp/browser/chrome-linux/chrome');
const READINESS_TIMEOUT_MS = 15000;

const results = [];
const errors = [];
const skipped = []; // 前端未落地而无法执行的断言，如实记录
const external = [];
const record = (name) => { results.push({ name, passed: true }); console.log('PASS', name); };
const markSkipped = (name, reason) => { skipped.push({ name, reason }); };

// ---------------------------------------------------------------- spawn 服务
function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['scripts/run_motor_lab_local.py', '--port', '0'], {
      cwd: PROJECT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGTERM');
      reject(new Error(`服务 readiness 超时(${READINESS_TIMEOUT_MS}ms)，stdout: ${stdout.slice(0, 500)}`));
    }, READINESS_TIMEOUT_MS);
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
      if (line && !settled) {
        try {
          const info = JSON.parse(line);
          if (info.url) {
            settled = true;
            clearTimeout(timer);
            resolve({ proc, info });
          }
        } catch { /* 继续等下一行 */ }
      }
    });
    proc.stderr.on('data', (d) => { stdout += `[stderr] ${d}`; });
    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`服务提前退出(code=${code}): ${stdout.slice(0, 500)}`));
      }
    });
  });
}

// ---------------------------------------------------------------- 浏览器层
const browser = await chromium.launch({
  executablePath: existsSync(BROWSER) ? BROWSER : undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results_out = { results, errors, skipped, external };
let server = null;
let page = null;

try {
  await fs.mkdir(OUT, { recursive: true });

  // 1. 启动服务
  server = await startServer();
  const baseUrl = server.info.url.replace(/\/$/, '');
  console.error(`[server] ${baseUrl}`);

  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // 同源断言: 拦截并记录一切跨源请求
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol.startsWith('http') && u.origin !== new URL(baseUrl).origin) {
      external.push(u.href);
      return route.abort();
    }
    return route.continue();
  });

  await page.goto(`${baseUrl}/motor-lab.html`, { waitUntil: 'domcontentloaded' });

  // 2. 探测前端 hook 契约是否已落地（不通过就如实记录，不虚报）
  const hookReady = await page
    .waitForFunction(
      () => window.motorLab
        && typeof window.motorLab.getState === 'function'
        && typeof window.motorLab.getSceneStatus === 'function',
      { timeout: 20000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!hookReady) {
    markSkipped('全部场景断言', '前端 window.motorLab.getSceneStatus 尚未落地，本测试仅验证服务与静态加载，不执行场景断言');
    throw new Error('真实场景测试钩子未就绪，不能以静态页面成功替代集成验收');
  } else {
    // 3. 等待真实模型场景就绪（6 个真实模型 loaded>0）
    const REQUIRED_MODELS = ['c-board', 'center-board2', 'c620', 'm3508', 'tb47d', 'battery-rack'];
    await page.waitForFunction(
      (ids) => {
        const s = window.motorLab.getSceneStatus();
        return s.ready === true
          && ids.every((id) => {
            const m = s.models.find((x) => x.id === id);
            return m && m.loaded && m.meshCount > 0;
          });
      },
      REQUIRED_MODELS,
      { timeout: 60000 },
    );
    const scene = await page.evaluate(() => window.motorLab.getSceneStatus());
    for (const id of REQUIRED_MODELS) {
      const m = scene.models.find((x) => x.id === id);
      assert(m && m.loaded && m.meshCount > 0, `模型 ${id} 未加载: ${JSON.stringify(m)}`);
    }
    record('6个真实模型全部loaded>0');

    // 4. 首屏：端口投影 + 五器件在视野内（fit）
    const fit = await page.evaluate(() => {
      const s = window.motorLab.getSceneStatus();
      const rect = document.querySelector('#motor-lab-canvas canvas').getBoundingClientRect();
      const inView = (p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
      return {
        ports: s.ports,
        allVisible: s.ports.every((p) => p.visible && inView(p))
          && s.modelBounds.length === 6
          && s.modelBounds.every(m => m.projected.every(p => inView(p) && p.z >= -1 && p.z <= 1)),
        cam: { position: s.cameraPosition, target: s.cameraTarget },
      };
    });
    assert(fit.allVisible, `首屏端口未全部可见: ${JSON.stringify(fit.ports)}`);
    record('首屏端口投影/五器件fit');

    // 5. 自动连线 7 条 + 供电 + target run
    await page.click('#btn-auto-connect');
    let st = await page.evaluate(() => window.motorLab.getState());
    assert.equal(st.connections.length, 7, `自动连线应为7条, 实际 ${st.connections.length}`);
    record('自动7链路');
    const routing = await page.evaluate(() => window.motorLab.getSceneStatus());
    assert.equal(routing.cableRoutes.length, 7);
    assert.deepEqual(routing.cableIntersections, [], '包围盒候选经可见三角面采样复核后不应残留线身穿入');
    for (const port of routing.ports) {
      assert(Math.abs(Math.hypot(...port.normal) - 1) < 1e-6, `端口法线非法: ${port.id}`);
      assert(port.anchorBasis && port.device && port.position.every(Number.isFinite));
    }
    const routingPorts = Object.fromEntries(routing.ports.map(p => [p.id, p]));
    assert(routingPorts['center-xt30-a'].normal[1] > .99, '中心板立式座应朝上出线');
    assert(routingPorts['center-xt60'].normal[2] > .99, '中心板XT60应沿接触圆柱轴从正Z端面出线，不能穿过上盖');
    assert(routingPorts['center-can-esc'].normal[0] < -.99, '负X侧CAN座不能向板内出线');
    assert(routingPorts['ctrl-can'].normal[0] < -.99, 'C板CAN1在负X侧');
    const routePairs = {
      'supply-center': ['supply-xt60', 'center-xt60'],
      'center-controller': ['center-xt30-a', 'ctrl-xt30'],
      'center-esc': ['center-xt30-b', 'esc-pwr'],
      'controller-can': ['ctrl-can', 'center-can-ctrl'],
      'esc-can': ['center-can-esc', 'esc-can'],
      'esc-phases': ['esc-phases', 'motor-phases'],
      'esc-data': ['esc-data', 'motor-data']
    };
    for (const cable of routing.cableRoutes) {
      const [a, b] = routePairs[cable.linkId].map(id => routingPorts[id]);
      const distance = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));
      const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
      assert(distance(cable.start, a.position) < 1e-7 && distance(cable.end, b.position) < 1e-7, `${cable.linkId}线身不能悬空脱离接头`);
      assert(dot(cable.startTangent, a.normal) > .999 && dot(cable.endTangent, b.normal) < -.999, `${cable.linkId}出线方向须沿接口法线`);
    }
    record('十四端点法线与七条线身连续/采样无三角面穿入');
    await page.click('#btn-toggle-power');
    await page.fill('#input-target-rpm', '1200');
    await page.locator('#input-target-rpm').dispatchEvent('change');
    await page.click('#btn-toggle-run');
    await page.waitForFunction(() => window.motorLab.getState().rotorRpm > 900, { timeout: 10000 });
    await page.waitForFunction(() => {
      const match = document.querySelector('#footer-status-text').textContent.match(/SIM转子 ([0-9.]+) RPM/);
      return match && Number(match[1]) > 800;
    });
    record('供电+target run及实时SIM状态栏');

    // 6. 断线阻塞与恢复（拔数据线降速至停止，重接恢复）
    await page.click('[data-target="esc-data"]');
    await page.waitForFunction(() => window.motorLab.getState().rotorRpm < 200, { timeout: 10000 });
    record('断数据线阻塞');
    await page.click('[data-target="esc-data"]');
    await page.waitForFunction(() => window.motorLab.getState().rotorRpm > 900, { timeout: 10000 });
    record('重接恢复');

    // 7. 手动两端点击接线（用 getSceneStatus 的真实投影坐标，不写死坐标）
    await page.click('#btn-reset');
    const ports = (await page.evaluate(() => window.motorLab.getSceneStatus())).ports;
    const byId = Object.fromEntries(ports.map((p) => [p.id, p]));
    // 链路 id 以 app 为准：supply-center / center-controller / center-esc / controller-can / esc-can / esc-phases / esc-data
    const supplyPort = byId['supply-xt60'];
    const escPwrPort = byId['esc-pwr'];
    const centerPort = byId['center-xt60'];
    assert(supplyPort && escPwrPort, `getSceneStatus.ports 缺少 supply/esc 端口: ${JSON.stringify(ports.map(p=>p.id))}`);
    // 错误配对必须准确命中两个不匹配端点，不能点空白误判通过。
    await page.mouse.click(supplyPort.x, supplyPort.y);
    await page.mouse.click(escPwrPort.x, escPwrPort.y);
    st = await page.evaluate(() => window.motorLab.getState());
    assert.equal(st.connections.length, 0, `错误配对应被拒绝, 实际 ${JSON.stringify(st.connections)}`);
    record('错误配对拒绝');
    // 正确配对
    await page.mouse.click(supplyPort.x + 8, supplyPort.y);
    await page.mouse.click(centerPort.x + 8, centerPort.y);
    st = await page.evaluate(() => window.motorLab.getState());
    assert.deepEqual(st.connections, ['supply-center'],
 `正确配对应成功: ${JSON.stringify(st.connections)}`);
    record('手动两端click接线');
    // drag 接线
    await page.click('#btn-reset');
    await page.mouse.move(supplyPort.x, supplyPort.y);
    await page.mouse.down();
    await page.mouse.move(centerPort.x, centerPort.y, { steps: 12 });
    await page.mouse.up();
    st = await page.evaluate(() => window.motorLab.getState());
    assert.deepEqual(st.connections, ['supply-center'], `drag接线应成功: ${JSON.stringify(st.connections)}`);
    record('手动两端drag接线');

    // 8. pointercancel 后状态可恢复
    await page.click('#btn-reset');
    await page.mouse.move(supplyPort.x, supplyPort.y);
    await page.mouse.down();
    await page.locator('#motor-lab-canvas canvas').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    st = await page.evaluate(() => window.motorLab.getState());
    assert.equal(st.connections.length, 0);
    await page.mouse.click(supplyPort.x, supplyPort.y);
    await page.mouse.click(centerPort.x, centerPort.y);
    st = await page.evaluate(() => window.motorLab.getState());
    assert.deepEqual(st.connections, ['supply-center'], `pointercancel后应可继续接线: ${JSON.stringify(st.connections)}`);
    record('pointercancel恢复');
    await page.click('#btn-reset');
    const pairs = {
      'supply-center': ['supply-xt60', 'center-xt60'],
      'center-controller': ['center-xt30-a', 'ctrl-xt30'],
      'center-esc': ['center-xt30-b', 'esc-pwr'],
      'controller-can': ['ctrl-can', 'center-can-ctrl'],
      'esc-can': ['center-can-esc', 'esc-can'],
      'esc-phases': ['esc-phases', 'motor-phases'],
      'esc-data': ['esc-data', 'motor-data']
    };
    for (const [link, pair] of Object.entries(pairs)) {
      const points = (await page.evaluate(() => window.motorLab.getSceneStatus())).ports;
      const start = points.find(p => p.id === pair[0]);
      const end = points.find(p => p.id === pair[1]);
      await page.mouse.move(start.x, start.y);await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 10 });await page.mouse.up();
      assert((await page.evaluate(() => window.motorLab.getState())).connections.includes(link), `逐条真实拖线失败: ${link}`);
    }
    assert.equal((await page.evaluate(() => window.motorLab.getState())).connections.length, 7);
    record('七条链路均可逐一三维拖线');

    // 9. orbit: 空白拖拽 / pan / zoom 后已接齐的七条线保持不变
    const beforeOrbit = await page.evaluate(() => window.motorLab.getState());
    const camBefore = await page.evaluate(() => window.motorLab.getSceneStatus());
    const rect = await page.locator('#motor-lab-canvas canvas').boundingBox();
    // 空白处 orbit 拖拽（远离任何端口，端口大多在上半屏，选右下角空白）
    const blank = { x: rect.x + rect.width * 0.85, y: rect.y + rect.height * 0.85 };
    await page.mouse.move(blank.x, blank.y);
    await page.mouse.down();
    await page.mouse.move(blank.x - 120, blank.y - 60, { steps: 10 });
    await page.mouse.up();
    const afterRotate = await page.evaluate(() => window.motorLab.getSceneStatus());
    assert.notDeepEqual(afterRotate.cameraPosition, camBefore.cameraPosition, '空白拖动必须实际旋转');
    // pan: shift+drag
    await page.keyboard.down('Shift');
    await page.mouse.move(blank.x, blank.y);
    await page.mouse.down();
    await page.mouse.move(blank.x - 60, blank.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const afterPan = await page.evaluate(() => window.motorLab.getSceneStatus());
    assert.notDeepEqual(afterPan.cameraTarget, afterRotate.cameraTarget, 'Shift拖动必须实际平移');
    // zoom: 滚轮
    await page.mouse.move(blank.x, blank.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    const afterZoom = await page.evaluate(() => window.motorLab.getSceneStatus());
    const distance = s => Math.hypot(...s.cameraPosition.map((v, i) => v - s.cameraTarget[i]));
    assert(distance(afterZoom) < distance(afterPan), '向上滚轮必须实际拉近');
    const afterOrbit = await page.evaluate(() => window.motorLab.getState());
    assert.deepEqual(afterOrbit.connections, beforeOrbit.connections, 'orbit后接线应不变');
    assert.equal(afterOrbit.power, beforeOrbit.power);
    assert.equal(afterOrbit.running, beforeOrbit.running);
    const camAfter = await page.evaluate(() => window.motorLab.getSceneStatus());
    assert(
      JSON.stringify(camAfter.cameraPosition) !== JSON.stringify(camBefore.cameraPosition)
      || JSON.stringify(camAfter.cameraTarget) !== JSON.stringify(camBefore.cameraTarget),
      'orbit/pan/zoom 后相机应实际变化',
    );
    record('orbit空白drag/pan/zoom后状态不变');
    await page.click('#btn-toggle-left-panel');
    await page.click('#btn-toggle-right-panel');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#motor-lab-canvas canvas');
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      return Math.abs(canvas.width - rect.width * dpr) <= 2 && Math.abs(canvas.height - rect.height * dpr) <= 2 && rect.width > innerWidth - 10;
    }, undefined, { timeout: 10000 });
    assert.equal((await page.evaluate(() => window.motorLab.getState())).connections.length, 7);
    record('折叠双侧栏画布同步铺满且接线不丢失');
    await page.click('#btn-toggle-left-panel');
    await page.click('#btn-toggle-right-panel');

    // 10. resize / 手机导航不裁
    for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        canvas: document.querySelector('#motor-lab-canvas canvas').getBoundingClientRect().toJSON(),
      }));
      assert(layout.scrollWidth <= layout.clientWidth + 1, `横向溢出 @${w}x${h}: ${JSON.stringify(layout)}`);
      assert(layout.canvas.width > 50 && layout.canvas.height > 50, `canvas 过小 @${w}x${h}`);
      record(`布局${w}x${h}`);
    }
    // 手机导航按钮完整可达
    const navRects = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.lab-header a, .lab-header button')).map((e) => e.getBoundingClientRect().toJSON()));
    for (const r of navRects) {
      assert(r.width > 15 && r.x >= 0 && r.right <= 391 && r.y >= 0 && r.bottom <= 844, `导航越界: ${JSON.stringify(r)}`);
    }
    record('手机导航不裁');
    await page.setViewportSize({ width: 1440, height: 900 });

    // 11. reset / 暂停 / 单步
    await page.click('#btn-reset');
    let s0 = await page.evaluate(() => window.motorLab.getState());
    assert.equal(s0.connections.length, 0);
    assert.equal(s0.power, false);
    assert.equal(s0.running, false);
    assert.equal(s0.rotorRpm, 0);
    record('reset 完整重置');
    await page.click('#btn-auto-connect');
    await page.click('#btn-toggle-power');
    await page.fill('#input-target-rpm', '1200');
    await page.locator('#input-target-rpm').dispatchEvent('change');
    await page.click('#btn-toggle-run');
    await page.waitForFunction(() => window.motorLab.getState().rotorRpm > 900, { timeout: 10000 });
    await page.click('#btn-toggle-pause');
    const frozen = await page.evaluate(() => window.motorLab.getState());
    await page.waitForTimeout(200);
    assert.equal((await page.evaluate(() => window.motorLab.getState())).elapsed, frozen.elapsed);
    record('暂停冻结');
    await page.click('#btn-step');
    const stepped = await page.evaluate(() => window.motorLab.getState());
    assert(Math.abs(stepped.elapsed - frozen.elapsed - 0.05) < 1e-8, `单步应推进0.05s: ${stepped.elapsed - frozen.elapsed}`);
    await page.waitForTimeout(120);
    assert.equal((await page.evaluate(() => window.motorLab.getState())).elapsed, stepped.elapsed);
    record('单步只推进0.05秒');
    await page.click('#btn-toggle-pause');
    await page.waitForFunction((t) => window.motorLab.getState().elapsed > t, stepped.elapsed, { timeout: 10000 });
    record('恢复运行');
    await page.click('#btn-reset');

    await page.fill('#code-editor', 'set_target_rpm(1,1000); globalThis.pwned=1;');
    await page.click('#btn-run-code');
    assert.equal((await page.evaluate(() => window.motorLab.getState())).running, false);
    assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
    record('混合注入程序被拒绝且无副作用');
    await page.fill('#code-editor', 'set_target_rpm(1,-1000); start_motor(1);');
    await page.click('#btn-run-code');
    assert.equal((await page.evaluate(() => window.motorLab.getState())).targetRpm, -1000);
    await page.click('#btn-auto-connect');await page.click('#btn-toggle-power');
    await page.waitForFunction(() => window.motorLab.getState().rotorRpm < -800, undefined, { timeout: 15000 });
    record('合法SIM程序与反转运行');
    await page.selectOption('#select-command-id', '2');
    assert((await page.locator('#diagnostics-list').innerText()).includes('ID'));
    await page.selectOption('#select-command-id', '1');
    record('ID不匹配诊断及恢复');
    for (const fault of ['can', 'power', 'data', 'phases']) {
      await page.selectOption('#select-fault', fault);
      assert.equal((await page.evaluate(() => window.motorLab.getState())).fault, fault);
      assert((await page.locator('#diagnostics-list').innerText()).includes('故障'));
    }
    await page.selectOption('#select-fault', 'none');
    record('四类故障注入与恢复');
    await page.click('#btn-reset');

    // 12. 零外部请求 + 无 pageerror
    assert.equal(external.length, 0, `外部请求: ${external.join(', ')}`);
    assert.deepEqual(errors, [], `pageerror: ${errors.join('; ')}`);
    record('零外部请求/pageerror');

    // 13. 缺件场景: 拦截一个模型 404，场景必须 ready=false、明确错误、不能运行
    await page.screenshot({ path: path.join(OUT, 'real-models-loaded.png'), fullPage: true });
    const missingRoute = 'c620';
    await page.route(`**/motor-lab-models/${missingRoute}.glb`, (route) => route.fulfill({ status: 404, body: 'missing' }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.motorLab
        && typeof window.motorLab.getSceneStatus === 'function'
        && window.motorLab.getSceneStatus().ready === false
        && window.motorLab.getSceneStatus().errors.length > 0,
      undefined, { timeout: 30000 },
    );
    const broken = await page.evaluate(() => window.motorLab.getSceneStatus());
    assert(broken.errors && broken.errors.length > 0, `缺件应有明确错误: ${JSON.stringify(broken)}`);
    const stBroken = await page.evaluate(() => window.motorLab.getState());
    assert.equal(stBroken.running, false, '缺件场景下不能运行');
    assert(await page.isDisabled('#btn-toggle-run'), '模型缺失必须禁用运行');
    const stAfterRun = await page.evaluate(() => window.motorLab.getState());
    assert.equal(stAfterRun.running, false, '缺件场景下运行按钮应无效或被拒绝');
    record('缺件场景ready=false且不能运行');
    await page.unroute(`**/motor-lab-models/${missingRoute}.glb`);
  }

  await page.screenshot({ path: path.join(OUT, 'real-models.png'), fullPage: true });
} catch (e) {
  errors.push(e && e.stack ? e.stack : String(e));
  if (page) {
    try { await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }); } catch { /* ignore */ }
  }
  throw e;
} finally {
  if (server && server.proc && server.proc.exitCode === null) {
    server.proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    if (server.proc.exitCode === null) server.proc.kill('SIGKILL');
  }
  await browser.close();
  await fs.writeFile(
    path.join(OUT, 'report.json'),
    JSON.stringify({ ...results_out, scope: 'headless SwiftShader only; not physical projector acceptance' }, null, 2),
  );
  console.log(JSON.stringify({ passed: results.length, skipped: skipped.length, errors: errors.length, external: external.length }));
}
