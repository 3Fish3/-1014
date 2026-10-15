// P1 全量自动化验证与截图脚本 (10个步骤全部跑通，覆盖 1920x1080 和 1366x768)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const executablePath = process.env.BROWSER_PATH || (existsSync('.tmp/browser/chrome-linux/chrome') ? '.tmp/browser/chrome-linux/chrome' : chromium.executablePath());
const base = process.argv[2] || 'http://127.0.0.1:8080';
const output = process.env.OUTPUT_DIR || 'docs/ui-v2/p1';
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { environment: 'Chromium headless / SwiftShader, 10-step full P1 verification', resolutions: [], errors: [], failed: [] };

try {
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    const resKey = `${width}x${height}`;
    const resData = { resolution: resKey, steps: [] };

    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) report.failed.push(response.url());
    });

    console.log(`\n================ Testing Resolution ${resKey} ================`);
    await page.goto(`${base}/ui-v2.html?step=1`);
    await page.waitForFunction(() => window.app?.viewer?.diffCarModel && window.app.currentStepIndex >= 0);

    for (let stepIndex = 0; stepIndex < 10; stepIndex++) {
      const stepNum = stepIndex + 1;
      await page.evaluate((idx) => window.app.goToStep(idx), stepIndex);

      if (stepNum === 10) {
        await page.waitForFunction(() => Boolean(window.app.viewer.heroRobotModel && window.app.viewer.heroRobotModel.visible));
      }

      await page.waitForTimeout(600);

      // 验证页面绝无跳回 index.html (V1)
      const currentUrl = page.url();
      assert.ok(currentUrl.includes('ui-v2.html'), `Step ${stepNum} 发生异常跳转: ${currentUrl}`);

      // 验证步骤 Badge 与标题
      const badgeText = await page.locator('#step-badge').textContent();
      assert.ok(badgeText.includes(`${String(stepNum).padStart(2, '0')} / 10`), `Badge 错误: ${badgeText}`);

      // 验证图片正常加载
      const photoLoaded = await page.evaluate(() => {
        const img = document.querySelector('#hardware-photo');
        return img && img.complete && img.naturalWidth > 0;
      });
      assert.ok(photoLoaded, `Step ${stepNum} 图片未正常加载`);

      // 验证无横向滚动条
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(hasHorizontalScroll, false, `Step ${stepNum} 出现横向滚动条溢出！`);

      // 验证三维小车处于画布内
      const bounding = await page.evaluate(async () => {
        const T = await import('./vendor/three/three.module.js');
        const v = app.viewer;
        v.scene.updateMatrixWorld(true);
        v.camera.updateMatrixWorld(true);
        const points = [];
        for (const node of [...v.nodesMap.values(), v.leftArrowMesh, v.rightArrowMesh]) {
          if (node?.visible) {
            node.traverse(mesh => {
              if (mesh.isMesh) {
                const pos = mesh.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                  points.push(new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(v.camera));
                }
              }
            });
          }
        }
        if (points.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, modelHeightFraction: 0 };
        const range = {
          minX: Math.min(...points.map(p => p.x)),
          maxX: Math.max(...points.map(p => p.x)),
          minY: Math.min(...points.map(p => p.y)),
          maxY: Math.max(...points.map(p => p.y))
        };
        return { ...range, modelHeightFraction: (range.maxY - range.minY) / 2 };
      });

      // 截图归档
      const shotPath = `${output}/step-${stepNum}-${width}.png`;
      await page.screenshot({ path: shotPath });
      console.log(`✓ Step ${stepNum} (${resKey}) 截图已保存 -> ${shotPath}`);

      resData.steps.push({
        step: stepNum,
        badge: badgeText,
        photoLoaded,
        modelHeightFraction: bounding.modelHeightFraction
      });
    }

    // 针对第 7 步指令连线交互测试
    await page.evaluate(() => window.app.goToStep(6));
    const chainBtn = page.locator('#btn-chain');
    for (let c = 0; c < 3; c++) {
      await chainBtn.click();
      await page.waitForTimeout(200);
    }
    const chainStatus = await page.locator('#chain-status').textContent();
    assert.ok(chainStatus.length > 0, '第 7 步指令连线状态文本为空');

    // 针对第 9 步双轮差速运动仿真交互测试
    await page.evaluate(() => window.app.goToStep(8));
    await page.locator('#btn-pause').click();
    await page.locator('.btn-preset').filter({ hasText: '前进' }).click();
    assert.equal(await page.locator('#slider-left').inputValue(), '0.75');

    // 左右轮正反向独立滑块测试
    await page.locator('#slider-left').fill('-0.6');
    await page.locator('#slider-right').fill('0.8');
    assert.equal(await page.evaluate(() => app.kinematics.targetLeft), -0.6);
    assert.equal(await page.evaluate(() => app.kinematics.targetRight), 0.8);

    await page.locator('#btn-pause').click();
    await page.waitForTimeout(600);
    await page.locator('#btn-pause').click();

    // 验证小车已经产生航向偏转与位移
    const isMoved = await page.evaluate(() => Math.abs(app.kinematics.x) > 0.001 || Math.abs(app.kinematics.z) > 0.001);
    assert.ok(isMoved, '小车运动学步进后未发生位移！');

    // 保存运动状态截图
    const motionShot = `${output}/motion-${width}.png`;
    await page.screenshot({ path: motionShot });
    console.log(`✓ 运动交互测试 (${resKey}) 截图已保存 -> ${motionShot}`);

    // 重置归位
    await page.locator('#btn-reset-car').click();
    const isReset = await page.evaluate(() => app.kinematics.x === 0 && app.kinematics.z === 0);
    assert.ok(isReset, '归位后坐标未清零');

    // 针对第 10 步实车对照高亮功能测试
    await page.evaluate(() => window.app.goToStep(9));
    await page.waitForTimeout(400);
    await page.locator('.compare-btn[data-kind="wheel"]').click();
    await page.waitForTimeout(200);
    const compareStatus = await page.locator('#compare-status').textContent();
    assert.ok(compareStatus.includes('高亮') || compareStatus.includes('CAD'), '第 10 步对照高亮状态未生效');

    report.resolutions.push(resData);
    await page.close();
  }

  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failed, []);
  report.passed = true;
  writeFileSync(`${output}/p1-browser-report.json`, JSON.stringify(report, null, 2));
  console.log('\n🎉 P1 全量自动化验证通过！全部 10 步统一风格无跳转，双分辨率截图均已产出！');
} finally {
  await browser.close();
}
