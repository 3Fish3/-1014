/**
 * 课件前端主控制器 (app.js)
 * 协调 UI 交互、键盘快捷键、教学大纲推进、双轮差速仿真与 3D 渲染管线。
 */

import { LESSON_STEPS, PRESET_ACTIONS } from './lesson.js';
import { DifferentialKinematics } from './kinematics.js';
import { SceneViewer } from './viewer.js';
import { ProjectionPresentation } from './projection.js';

class TeachingApp {
  constructor() {
    this.currentStepIndex = 0;
    this.kinematics = new DifferentialKinematics();
    this.viewer = null;
    this.lastTime = performance.now();
    this.paused = false;
    this.chainStage = 0;

    // DOM 元素缓存
    this.dom = {
      canvasContainer: document.getElementById('canvas-container'),
      stepBadge: document.getElementById('step-badge'),
      stepDuration: document.getElementById('step-duration'),
      stepTitle: document.getElementById('step-title'),
      keyConcept: document.getElementById('key-concept'),
      teacherLines: document.getElementById('teacher-lines'),
      stepDetails: document.getElementById('step-details'),
      diagramImg: document.getElementById('diagram-img'),
      diagramBadge: document.getElementById('diagram-badge'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnReplay: document.getElementById('btn-replay'),
      btnResetCar: document.getElementById('btn-reset-car'),
      btnCamMode: document.getElementById('btn-cam-mode'),
      btnFullscreen: document.getElementById('btn-fullscreen'),
      stepDotsContainer: document.getElementById('step-dots'),
      presetControls: document.getElementById('preset-controls'),
      sliderControls: document.getElementById('slider-controls'),
      sliderLeft: document.getElementById('slider-left'),
      sliderRight: document.getElementById('slider-right'),
      textLeftSpeed: document.getElementById('text-left-speed'),
      textRightSpeed: document.getElementById('text-right-speed'),
      codeDrawer: document.getElementById('code-drawer'),
      btnToggleCode: document.getElementById('btn-toggle-code'),
      btnCloseCode: document.getElementById('btn-close-code'),
      codeContent: document.getElementById('code-content'),
      codeTabs: document.querySelectorAll('.code-tab')
    };

    this.projection = document.body.dataset.ui === 'v2' ? new ProjectionPresentation(this) : null;
    this.init();
  }

  async init() {
    // 1. 初始化 3D 渲染查看器
    this.viewer = new SceneViewer(this.dom.canvasContainer);
    this.projection?.attachViewer(this.viewer);
    window.addEventListener('pagehide', () => {
      this.viewer.dispose();
      this.stopped = true;
    }, {once:true});

    // 2. 加载小车 3D 模型
    try {
      await this.viewer.loadDiffCar('./models/diff_car_teaching.glb');
      this.projection?.afterModelLoaded();
    } catch (err) {
      this.dom.canvasContainer.textContent = `教学模型加载失败，请检查本地模型文件：${err.message}`;
      console.error('加载小车模型失败:', err);
      return;
    }

    // 3. 构建步骤指示圆点导航
    this.buildStepIndicators();

    // 4. 构建预设动作按钮
    this.buildPresetButtons();

    // 5. 绑定交互事件与按键监听
    this.bindEvents();

    // 6. 进入第一步
    const requested = new URLSearchParams(window.location.search).get('step');
    const index = LESSON_STEPS.findIndex(step => String(step.id) === requested);
    this.goToStep(index >= 0 ? index : 0);

    // 7. 启动渲染主循环
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  buildStepIndicators() {
    this.dom.stepDotsContainer.replaceChildren();
    LESSON_STEPS.forEach((step, idx) => {
      const dot = document.createElement('button');
      dot.className = `step-dot ${idx === 0 ? 'active' : ''}`;
      dot.title = step.title;
      dot.textContent = `${idx + 1}`;
      dot.addEventListener('click', () => this.goToStep(idx));
      this.dom.stepDotsContainer.append(dot);
    });
  }

  buildPresetButtons() {
    this.dom.presetControls.replaceChildren();
    PRESET_ACTIONS.forEach((action) => {
      const btn = document.createElement('button');
      btn.className = 'btn-preset';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'preset-name';
      nameSpan.textContent = action.name;

      const descSpan = document.createElement('span');
      descSpan.className = 'preset-desc';
      descSpan.textContent = action.desc;

      btn.append(nameSpan, descSpan);
      btn.addEventListener('click', () => {
        // 同步设置运动学目标速度
        this.kinematics.setWheelSpeeds(action.left, action.right);
        // 更新滑块视觉位置与无数字描述
        this.updateSliderUI(action.left, action.right);
        // 高亮当前选中的预设动作按钮
        const allPresets = this.dom.presetControls.querySelectorAll('.btn-preset');
        allPresets.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      this.dom.presetControls.append(btn);
    });
  }

  bindEvents() {
    document.querySelectorAll('.compare').forEach(button => button.addEventListener('click', () => {
      const kind = button.dataset.kind;
      const matches = this.viewer.highlightComparison(kind);
      document.querySelector('#compare-status').textContent = matches.hero.length ? '已按 CAD 节点名高亮对应功能区域；名称不等同实物认证。' : '实车该区域尚未确认，未进行猜测高亮；请结合实物补充核验。';
    }));
    // 步骤导航按钮
    this.dom.btnPrev.addEventListener('click', () => this.prevStep());
    this.dom.btnNext.addEventListener('click', () => this.nextStep());
    this.dom.btnReplay.addEventListener('click', () => this.replayStep());
    document.querySelector('#btn-pause').addEventListener('click', (e) => {
      this.paused = !this.paused;
      e.target.textContent = this.paused ? '继续演示' : '暂停演示';
    });
    document.querySelector('#btn-chain').addEventListener('click', () => {
      const names = ['Node_STM32','Node_MotorDriver','Node_LeftMotor'];
      const texts = ['主控发出指令','驱动器接收指令','电机带动车轮'];
      const step = LESSON_STEPS[6];
      this.viewer.applyStepState({...step,focusNode:names[this.chainStage]});
      this.viewer.setInstructionStage(this.chainStage);
      document.querySelector('#chain-status').textContent = texts[this.chainStage];
      this.chainStage = (this.chainStage + 1) % 3;
    });

    // 视角切换 (固定 / 跟随)
    this.dom.btnCamMode.addEventListener('click', () => {
      const isFixed = this.viewer.cameraMode === 'FIXED';
      this.viewer.cameraMode = isFixed ? 'FOLLOW' : 'FIXED';
      if (this.projection && isFixed) this.viewer.isTransitioningCamera = false;
      if (this.projection) this.dom.btnCamMode.textContent = isFixed ? '跟随视角' : '固定视角';
      else this.dom.btnCamMode.textContent = isFixed ? '🎥 视角: 跟随小车' : '🎥 视角: 固定观察';
      this.dom.btnCamMode.classList.toggle('active', !isFixed);
    });

    // 重置小车位置
    this.dom.btnResetCar.addEventListener('click', () => {
      this.kinematics.resetPose();
      this.updateSliderUI(0, 0);
      this.projection?.resetView();
    });

    // 全屏展示
    this.dom.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => console.warn(err));
      } else {
        document.exitFullscreen().catch((err) => console.warn(err));
      }
    });

    // 左右轮独立滑块 (无数字直觉差速)
    const handleSliderInput = () => {
      const vL = parseFloat(this.dom.sliderLeft.value);
      const vR = parseFloat(this.dom.sliderRight.value);
      this.kinematics.setWheelSpeeds(vL, vR);
      this.updateSpeedText(vL, vR);
      // 清除预设按钮高亮，进入自由模式
      const allPresets = this.dom.presetControls.querySelectorAll('.btn-preset');
      allPresets.forEach((b) => b.classList.remove('active'));
    };

    this.dom.sliderLeft.addEventListener('input', handleSliderInput);
    this.dom.sliderRight.addEventListener('input', handleSliderInput);

    // 键盘快捷键 (左右箭头切换步骤，空格下一步，R键重播)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (this.projection && e.target.closest('dialog[open],button,a,select')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevStep();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.replayStep();
      }
    });

    // 哨兵实车代码透视抽屉切换
    this.dom.btnToggleCode.addEventListener('click', () => this.openCodeDrawer());
    this.dom.btnCloseCode.addEventListener('click', () => this.closeCodeDrawer());

    this.dom.codeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.dom.codeTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.loadCodeSnippet(tab.dataset.file);
      });
    });
  }

  async goToStep(index) {
    if (index < 0 || index >= LESSON_STEPS.length) return;
    this.currentStepIndex = index;
    const step = LESSON_STEPS[index];

    // 更新文本信息
    this.dom.stepBadge.textContent = `第 ${step.id} 步 / 共 10 步`;
    this.dom.stepDuration.textContent = `⏱️ 预计时长: ${step.duration}`;
    this.dom.stepTitle.textContent = step.title;
    this.dom.keyConcept.textContent = `💡 核心认知: ${step.keyConcept}`;
    this.dom.teacherLines.textContent = `🗣️ 讲师参考: "${step.teacherLines}"`;
    this.dom.diagramBadge.textContent = step.badge;

    // 更新手册详细要点
    this.dom.stepDetails.replaceChildren();
    step.details.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      this.dom.stepDetails.append(li);
    });

    // 更新矢量示意图
    this.dom.diagramImg.src = `./assets/images/${step.imageType}.svg`;
    const photo = document.querySelector('#hardware-photo');
    photo.src = index === 5 ? './assets/images/team-controller.jpg' : index === 9 ? './assets/images/team-chassis.jpg' : index >= 3 && index <= 6 ? './assets/images/alphabot-official.jpg' : './assets/images/alphabot-car.jpg';
    document.querySelector('#photo-caption').textContent = index === 5 || index === 9 ? '战队本地实拍参考；并非本教学模型或英雄整车的装配认证。' : 'Waveshare AlphaBot 官方照片参考；非同款。原厂版权，仅本地教学引用，公开发布前需核查许可。';

    // 更新操作条状态
    this.dom.btnPrev.disabled = index === 0;
    this.dom.btnNext.textContent = index === LESSON_STEPS.length - 1 ? '完成本章 (对照英雄)' : '下一步 ➔';

    // 更新圆点高亮
    const dots = this.dom.stepDotsContainer.querySelectorAll('.step-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
      dot.classList.toggle('completed', idx < index);
    });

    // 运动演示控制区的显隐
    const isMotionStep = Boolean(step.isPresetMotionStep || step.isFreeSliderStep);
    this.dom.presetControls.parentElement.style.display = isMotionStep ? 'block' : 'none';
    this.dom.sliderControls.parentElement.style.display = step.isFreeSliderStep ? 'block' : 'none';
    document.querySelector('#chain-panel').hidden = index !== 6;
    document.querySelector('#compare-panel').hidden = index !== 9;
    this.chainStage = 0;

    if (!isMotionStep) {
      // 非运动步骤时小车静止归位
      this.kinematics.resetPose();
      this.updateSliderUI(0, 0);
    }

    // 触发 3D 场景部件显隐与运镜
    this.viewer.applyStepState(step);

    // 仅在第 10 步实车对照时按需异步加载真实整车模型
    if (step.isComparisonStep && !this.viewer.heroRobotModel) {
      try {
        await this.viewer.loadHeroRobot('./models/hero_robot_clean.glb');
      } catch (err) {
        this.dom.diagramBadge.textContent = `整车加载失败：${err.message}，请检查模型文件后重播`;
        console.error(err);
      }
    }

    this.projection?.update(step);
  }

  prevStep() {
    if (this.currentStepIndex > 0) {
      this.goToStep(this.currentStepIndex - 1);
    }
  }

  nextStep() {
    if (this.currentStepIndex < LESSON_STEPS.length - 1) {
      this.goToStep(this.currentStepIndex + 1);
    }
  }

  replayStep() {
    this.kinematics.resetPose();
    this.updateSliderUI(0, 0);
    this.goToStep(this.currentStepIndex);
  }

  /** 更新滑块与文字提示（严格不带数字） */
  updateSliderUI(left, right) {
    this.dom.sliderLeft.value = left;
    this.dom.sliderRight.value = right;
    this.updateSpeedText(left, right);
  }

  updateSpeedText(left, right) {
    const describeSpeed = (val) => {
      if (Math.abs(val) < 0.05) return '【停止】';
      if (val > 0.6) return '【快速正转 ⤸】';
      if (val > 0) return '【慢速正转 ⤸】';
      if (val < -0.6) return '【快速反转 ⤹】';
      return '【慢速反转 ⤹】';
    };
    const display = (side, value) => {
      const description = describeSpeed(value);
      return this.projection ? description.replace(/[【】⤸⤹]/g, '').trim() : `${side}轮: ${description}`;
    };
    this.dom.textLeftSpeed.textContent = display('左', left);
    this.dom.textRightSpeed.textContent = display('右', right);
    this.dom.sliderLeft.setAttribute('aria-valuetext', this.dom.textLeftSpeed.textContent);
    this.dom.sliderRight.setAttribute('aria-valuetext', this.dom.textRightSpeed.textContent);
  }

  async openCodeDrawer() {
    this.dom.codeDrawer.classList.add('open');
    if (this.dom.codeContent.textContent.includes('正在加载')) {
      await this.loadCodeSnippet('omni_kinematics.hpp.txt');
    }
  }

  closeCodeDrawer() {
    this.dom.codeDrawer.classList.remove('open');
  }

  async loadCodeSnippet(filename) {
    try {
      const resp = await fetch(`./assets/code/${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      this.dom.codeContent.textContent = text;
    } catch (err) {
      this.dom.codeContent.textContent = `// 读取源码文件失败: ${err.message}`;
    }
  }

  renderLoop(time) {
    if (this.stopped) return;
    const dt = (time - this.lastTime) * 0.001;
    this.lastTime = time;

    // 积分差速小车运动学
    const kState = this.kinematics.update(this.paused || document.hidden ? 0 : dt);

    // 驱动 Three.js 渲染管线
    this.viewer.render(kState, this.paused || document.hidden ? 0 : dt);

    requestAnimationFrame((t) => this.renderLoop(t));
  }
}

// 页面加载完成后实例化启动
window.addEventListener('DOMContentLoaded', () => {
  window.app = new TeachingApp();
});
