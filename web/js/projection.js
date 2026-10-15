// P1 全量展示适配层：支持全部 10 步教学内容，保持单一三维场景与底层运动学
import * as THREE from '../vendor/three/three.module.js';
import {ComparisonView} from './comparison-view.js';
import {ASSEMBLY_MODELS, assemblyKind} from './assembly-models.js';

export const PAGES = {
  1: {
    category: '从零出发',
    name: '任务提出：怎样让它动起来？',
    question: '如果只造一台能前进、后退、转弯的小车，最少需要哪些部分？',
    image: './assets/images/ui-v2/team-frame-chassis.jpg',
    alt: '战队机器人底盘机械承载结构实物照片',
    caption: '实物参考：战队机器人机械底盘。承载各个功能部件的基础骨架。',
    lines: ['车架是所有器件的物理承载基础。', '承受地面冲击，但本身没有动力，不会主动运动。'],
    keywords: ['目标先于器件', '机械承载', '被动支撑'],
    topic: '第 1 步：底盘车架结构'
  },
  2: {
    category: '认识一个部件',
    name: '车架与轮子：机械基础与支撑',
    question: '有了车架和车轮，小车就能自己跑起来了吗？',
    image: './assets/images/ui-v2/wheel-light.svg',
    alt: '双驱动轮与万向从动轮底盘布局矢量图',
    caption: '结构示意：左右两只主动驱动轮，前后配置万向从动滚珠维持水平平衡。',
    lines: ['左右驱动轮接触地面提供抓地摩擦力。', '前后辅助支撑轮保持车体平衡，只有轮子依然是一台手推车。'],
    keywords: ['驱动轮', '万向支撑轮', '地面抓地力'],
    topic: '第 2 步：轮组配置与地面接触'
  },
  3: {
    category: '认识一个部件',
    name: '驱动电机：动力从哪来？',
    question: '轮子自己不会转，旋转动力从何而来？',
    image: './assets/images/ui-v2/m3508-reference-hi.png',
    alt: 'RoboMaster M3508 直流无刷减速电机官方产品图',
    caption: '实物参考：RoboMaster M3508 减速电机。官方说明书图片；教学车采用有刷减速电机原理示意。',
    lines: ['电机将电能转化为高转速旋转机械动能。', '通过减速齿轮箱放大输出扭矩，带动车轮转动。'],
    keywords: ['电能 → 机械动能', '减速齿轮箱', '输出扭矩'],
    topic: '第 3 步：左右驱动减速电机'
  },
  4: {
    category: '认识一个部件',
    name: '电机驱动器：指令与功率分工',
    question: '单片机引脚发出的信号，可以直接插在电机两端驱动转动吗？',
    image: './assets/images/ui-v2/c620-reference-hi.png',
    alt: 'RoboMaster C620 高性能电机调速器官方产品图',
    caption: '实物参考：RoboMaster C620 电调。官方说明书图片；教学车以双 H 桥功率驱动原理示意。',
    lines: ['单片机引脚只能提供毫安级微弱信号，无法带动大电流电机。', '驱动器充当“功率放大开关”，接收弱电指令，控制强电动能。'],
    keywords: ['弱电指令', '强电功率放大', '双 H 桥架构'],
    topic: '第 4 步：双 H 桥电机驱动板'
  },
  5: {
    category: '认识一个部件',
    name: '电池与供电：电从哪里来？',
    question: '动力电池电压通常很高，可以直接接在主控单片机上吗？',
    image: './assets/images/ui-v2/battery-light.svg',
    alt: '动力电池大电流路径与稳压降压供电路径分流矢量图',
    caption: '拓扑示意：动力电池高压直供电机驱动器；通过 DC-DC 降压至 5V 安全供给单片机。',
    lines: ['动力电池负责整车能量输出，电机需要高压大电流。', '单片机等芯片需要经过 DC-DC 稳压保护，严禁高压直连造成烧毁。'],
    keywords: ['动力电池', 'DC-DC 稳压', '供电电压匹配'],
    topic: '第 5 步：动力锂电池与稳压电路'
  },
  6: {
    category: '认识一个部件',
    name: 'STM32 主控板：决策与大脑',
    question: '小车前进还是转弯，谁来计算并发出转动命令？',
    image: './assets/images/ui-v2/team-controller.jpg',
    alt: '战队 STM32 嵌入式主控开发板实物照片',
    caption: '实物参考：战队机器人嵌入式主控开发板。运行控制算法并向驱动器下发 PWM 指令。',
    lines: ['程序在 STM32 微控制器上运行，负责运算与状态决策。', '根据遥控或自动算法，通过引脚向驱动器输出精确的调速控制信号。'],
    keywords: ['微控制器大脑', '运算决策', 'PWM 控制信号'],
    topic: '第 6 步：STM32 单片机核心板'
  },
  7: {
    category: '电气拓扑',
    name: '指令与供电双路线：信息与能量分离',
    question: '控制指令和动力电能走的是同一条线吗？为什么要有两条路？',
    image: './assets/images/ui-v2/wiring-light.svg',
    alt: '信息控制路径与能量供电路径分色对比示意图',
    caption: '线路原理：红色/橙色为动力能量通道；青色/蓝色为控制指令通道，两者物理分离。',
    lines: ['能量路径：电池 ➔ 驱动器 ➔ 电机动能；电池 ➔ 稳压 ➔ 主控芯片。', '信息路径：主控发出 PWM/方向信号 ➔ 驱动器逻辑端，不承受电机动力电流。'],
    keywords: ['能量通道 (强电)', '信息通道 (弱电)', '物理路径隔离'],
    topic: '第 7 步：控制与供电走线拓扑'
  },
  8: {
    category: '直觉感受',
    name: '预设动作演示：直觉感受运动',
    question: '左右两个轮子各自转快或转慢，车身在地面上会怎样运动？',
    image: './assets/images/ui-v2/motion-light.svg',
    alt: '左右轮速不等产生偏航转向圆弧轨迹示意图',
    caption: '运动学规律：两侧同向同速则直线行驶；两侧速度不等则产生车身偏转！',
    lines: ['两轮同向等速：小车直线向前或向后平稳行进。', '右轮比左轮转得快：车身产生向左偏转的圆弧运动轨迹。'],
    keywords: ['直线行驶', '差速转向', '速度差决定轨迹'],
    topic: '第 8 步：差速运动直觉演练'
  },
  9: {
    category: '动手试一试',
    name: '双轮差速自由调节：探索运动本质',
    question: '改变左右轮的速度，为什么小车就会自动转弯？',
    image: './assets/images/ui-v2/differential.svg',
    alt: '右轮快于左轮时车头左偏的运动示意图',
    caption: '运动示意：右轮速度快、右侧走过的圆弧更长，车体自然朝慢的一侧转弯。',
    lines: ['无需记忆复杂公式，拖动两侧滑块直接观察地面轨迹。', '一正一反产生原地自转；两轮完全停滞小车保持静止。'],
    keywords: ['无级滑块', '自转与弧线', '轨迹实时积分'],
    topic: '第 9 步：双轮差速自由探索'
  },
  10: {
    category: '工程映射',
    name: '回到英雄机器人：通用原理到真实工程',
    question: '教学小车和正式赛场上的 RoboMaster 英雄战车，核心电控规律一样吗？',
    image: './assets/images/ui-v2/team-hero-chassis.jpg',
    alt: '战队 RoboMaster 实车底盘及装甲板机械结构实物照',
    caption: '实车映射：具体机械机构变化万千，但底盘必须解决的【承载、驱动、供电、控制】四大通用问题永远相同！',
    lines: ['车架承载：从教学底板到整车框架、轮组和云台；材质与防护性能未认证。', 'CAD 中可识别轮组和电机；电调、主控型号与位置，以及实际通信接线仍待核验。'],
    keywords: ['机械承载', '动力执行', '供电稳压', '主控通信'],
    topic: '第 10 步：真实整车工程对照'
  }
};

export class ProjectionPresentation {
  constructor(app) {
    this.app = app;
    this.assemblyKind = assemblyKind(new URLSearchParams(location.search).get('assembly'));
    this.assemblyModelUrl = ASSEMBLY_MODELS[this.assemblyKind].url;
    document.querySelector('#assembly-toolbar').after(document.querySelector('#compare-panel'));
    for (const option of document.querySelector('#hero-asset').options) option.textContent = ASSEMBLY_MODELS[option.value].label;
    document.querySelector('#hero-asset').value = this.assemblyKind;
    document.querySelector('#hero-asset').addEventListener('change', () => this.changeAssembly());
    const notes = document.querySelector('#teacher-notes');
    if (notes) {
      document.querySelector('#btn-notes')?.addEventListener('click', () => notes.showModal());
      document.querySelector('#btn-close-notes')?.addEventListener('click', () => notes.close());
      document.querySelector('#btn-toggle-code')?.addEventListener('click', () => {
        notes.close();
        if (app.dom.codeDrawer) app.dom.codeDrawer.hidden = false;
      });
      document.querySelector('#btn-close-code')?.addEventListener('click', () => {
        if (app.dom.codeDrawer) app.dom.codeDrawer.hidden = true;
      });
    }
  }

  attachViewer(viewer) {
    this.viewer = viewer;
    this.comparison = new ComparisonView(viewer);
    viewer.comparisonView = this.comparison;
    viewer.scene.background = new THREE.Color('#f5f7fb');
    viewer.scene.fog = new THREE.Fog('#f5f7fb', 0.65, 2.5);
    viewer.renderer.toneMappingExposure = 1.05;
    viewer.scene.traverse(node => {
      if (node.type === 'GridHelper') {
        node.scale.setScalar(0.25);
        node.material.vertexColors = false;
        node.material.color.set('#dce4ee');
        node.material.transparent = true;
        node.material.opacity = 0.65;
        node.material.needsUpdate = true;
      }
    });
    if (viewer.trajectoryLine) {
      viewer.trajectoryLine.material.color.set('#2563eb');
    }
    this.observer = new ResizeObserver(() => {
      viewer.handleResize();
      if (viewer.diffCarModel && (this.comparison.active || viewer.cameraMode === 'FIXED')) {
        this.fitModel(false);
      }
    });
    this.observer.observe(this.app.dom.canvasContainer);
    window.addEventListener('pagehide', event => { if (!event.persisted) this.observer.disconnect(); });
  }

  afterModelLoaded() {
    // 为功能节点赋予独立克隆材质，避免共享材质导致整车一起泛光
    const oldMaterials = new Set();
    this.viewer.diffCarModel.traverse(node => {
      if (!node.isMesh) return;
      const materials = [node.material].flat();
      const copies = materials.map(material => {
        oldMaterials.add(material);
        const copy = material.clone();
        copy.roughness = 0.65;
        this.viewer.originalMaterials.set(copy, copy.emissive.clone());
        return copy;
      });
      node.material = Array.isArray(node.material) ? copies : copies[0];
    });
    for (const material of oldMaterials) {
      this.viewer.originalMaterials.delete(material);
      material.dispose();
    }
    for (const [name, color] of [['Node_PowerWires', '#ea580c'], ['Node_SignalWires', '#2563eb']]) {
      this.viewer.nodesMap.get(name)?.traverse(mesh => {
        if (!mesh.isMesh) return;
        for (const material of [mesh.material].flat()) {
          material.vertexColors = false;
          material.color.set(color);
          material.needsUpdate = true;
        }
      });
    }
    for (const arrow of [this.viewer.leftArrowMesh, this.viewer.rightArrowMesh]) {
      if (arrow) arrow.traverse(n => { if (n.isMesh) n.material.color.set('#2563eb'); });
    }
  }

  update(step) {
    const page = PAGES[step.id];
    if (!page) return;
    document.querySelectorAll('.compare-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('#compare-status').textContent = '';
    document.querySelector('.model-tag').textContent = step.id === 10
      ? this.viewer.heroRobotModel ? ASSEMBLY_MODELS[this.assemblyKind].tag : '英雄模型未加载'
      : '功能示意模型 · 非接线指导';

    this.viewer.cameraMode = 'FIXED';
    const btnCam = document.querySelector('#btn-cam-mode');
    if (btnCam) btnCam.textContent = '固定视角';

    const setVal = (id, val) => {
      const el = document.querySelector(id);
      if (el) el.textContent = val;
    };

    setVal('#step-badge', `${String(step.id).padStart(2, '0')} / 10`);
    setVal('#card-category', page.category);
    setVal('#step-title', page.name);
    setVal('#key-concept', page.question);
    setVal('#section-name', page.name);
    setVal('#stage-topic', page.topic);

    const photoEl = document.querySelector('#hardware-photo');
    if (photoEl) {
      photoEl.src = page.image;
      photoEl.alt = page.alt;
    }
    setVal('#photo-caption', page.caption);

    const fill = (selector, items) => {
      const list = document.querySelector(selector);
      if (list) {
        list.replaceChildren(...items.map(text => {
          const item = document.createElement('li');
          item.textContent = text;
          return item;
        }));
      }
    };
    fill('#step-details', page.lines);
    fill('#keywords', page.keywords);

    // 动作与控制面板的显示隐藏
    const motionControls = document.querySelector('#motion-controls');
    if (motionControls) {
      const isMotion = step.id === 8 || step.id === 9;
      motionControls.hidden = !isMotion;

      // 第 8 步显示预设动作面板，隐藏滑块
      const presetPanel = document.querySelector('.preset-panel');
      const sliderPanel = document.querySelector('.slider-panel');
      if (presetPanel) presetPanel.hidden = !isMotion;
      if (sliderPanel) sliderPanel.hidden = step.id !== 9;
    }

    // 第 7 步指令连线面板与第 10 步实车对比面板
    const chainPanel = document.querySelector('#chain-panel');
    if (chainPanel) chainPanel.hidden = step.id !== 7;

    const comparePanel = document.querySelector('#compare-panel');
    if (comparePanel) comparePanel.hidden = step.id !== 10;
    document.querySelector('#assembly-toolbar').hidden = step.id !== 10;
    this.app.dom.btnCamMode.disabled = step.id === 10;
    this.comparison.setActive(step.id === 10);
    if (step.id === 10) this.updateAssemblyStatus();

    // 探索提示文案
    const hintEl = document.querySelector('#exploration-hint');
    if (hintEl) {
      if (step.id === 7) {
        hintEl.textContent = '💡 讲师演示提示：点击底栏“推进指令链”按钮，依次观察主控发令、驱动器接收与电机旋转三段传导过程。';
        hintEl.hidden = false;
      } else if (step.id === 8) {
        hintEl.textContent = '💡 动作演示提示：点击下方预设动作按钮，直观观察左右轮旋转快慢与车身行驶轨迹的关系。';
        hintEl.hidden = false;
      } else if (step.id === 9) {
        hintEl.textContent = '💡 自由探索提示：拖动下方左右轮滑块（无数字显示），验证左右轮速不等时车身向哪一侧弯曲。';
        hintEl.hidden = false;
      } else if (step.id === 10) {
        hintEl.textContent = '分别拖动两个观察区旋转、滚轮缩放；下方功能按钮高亮可识别部件。英雄供电和控制位置尚未确认。';
        hintEl.hidden = false;
      } else {
        hintEl.hidden = true;
      }
    }

    // 图例展示功能语义
    const feedbackLegend = document.querySelector('.feedback');
    if (feedbackLegend) {
      feedbackLegend.textContent = '反馈关系 (闭环预备)';
      feedbackLegend.title = '编码器与传感器反馈关系，将在后续进阶课程讲解';
    }

    requestAnimationFrame(() => {
      this.viewer.handleResize();
      this.fitModel(!this.app.paused);
    });
  }

  updateAssemblyStatus() {
    const loaded = this.viewer.heroRobotUrl;
    if (!loaded) {
      document.querySelector('#assembly-status').textContent = '英雄模型未加载；请重播重试。';
      return;
    }
    const entry = Object.entries(ASSEMBLY_MODELS).find(([, model]) => model.url === loaded);
    if (!entry) throw new Error('已加载的英雄模型不在装配选择表中');
    const [kind, model] = entry;
    this.assemblyKind = kind;
    const status = document.querySelector('#assembly-status');
    status.classList.toggle('inferred', kind === 'inferred');
    status.textContent = model.status;
    document.querySelector('#hero-asset').value = kind;
    document.querySelector('.model-tag').textContent = model.tag;
  }

  async changeAssembly() {
    const kind = assemblyKind(document.querySelector('#hero-asset').value);
    const url = ASSEMBLY_MODELS[kind].url;
    this.assemblyModelUrl = url;
    const revision = this.assetRevision = (this.assetRevision || 0) + 1;
    document.querySelector('#assembly-status').textContent = '正在装载所选资产，旧模型保留至加载成功…';
    try {
      const result = await this.viewer.loadHeroRobot(url);
      if (!result || revision !== this.assetRevision) return;
      this.assemblyKind = kind;
      if (this.app.currentStepIndex === 9) this.updateAssemblyStatus();
      const locationUrl = new URL(location.href);
      if (kind === 'step') locationUrl.searchParams.delete('assembly');
      else locationUrl.searchParams.set('assembly',kind);
      history.replaceState(null,'',locationUrl);
    } catch (error) {
      if (revision !== this.assetRevision) return;
      this.assemblyModelUrl = this.viewer.heroRobotUrl || url;
      if (this.app.currentStepIndex === 9) {
        this.updateAssemblyStatus();
        document.querySelector('#assembly-status').textContent += ` 加载失败，保留原状态：${error.message || '资源不可用'}`;
      }
    }
  }

  resetView() {
    this.viewer.render(this.app.kinematics.update(0), 0);
    this.fitModel(false);
  }

  /** 根据可见模型与当前画布比例自适应最佳相机视野 */
  fitModel(animate) {
    const v = this.viewer;
    if (!v.diffCarModel) return;
    if (this.comparison.active) { this.comparison.fitAll(); return; }

    v.carRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3();

    for (const node of v.nodesMap.values()) {
      if (node.visible) bounds.union(new THREE.Box3().setFromObject(node, true));
    }

    if (bounds.isEmpty()) return;

    bounds.expandByScalar(0.02); // 留出呼吸边距
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(-1, 0.85, 1.15).normalize();

    const rotation = new THREE.Matrix4().lookAt(center.clone().add(direction), center, new THREE.Vector3(0, 1, 0));
    const inverse = rotation.clone().invert();
    const tanV = Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2));
    const tanH = tanV * v.camera.aspect;

    let distance = 0;
    const objects = [...v.nodesMap.values(), v.leftArrowMesh, v.rightArrowMesh];

    for (const node of objects) {
      if (node && node.visible) {
        node.traverse(mesh => {
          if (!mesh.isMesh) return;
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(center).applyMatrix4(inverse);
            distance = Math.max(distance, Math.abs(p.x) / tanH + p.z, Math.abs(p.y) / tanV + p.z);
          }
        });
      }
    }

    distance *= 1.15;
    const position = center.clone().addScaledVector(direction, distance);
    v.followOffsetDistance = distance * 0.82;
    v.followOffsetHeight = distance * 0.65;

    if (animate) {
      v.smoothMoveCamera(position.toArray(), center.toArray());
    } else {
      v.camera.position.copy(position);
      v.controls.target.copy(center);
      v.controls.update();
      v.isTransitioningCamera = false;
    }
  }
}
