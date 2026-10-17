/**
 * Motor Lab · 单电机系统接线与运行虚拟实验台 (app.js)
 * UI 与 3D 表现层：基于 Three.js 独立单渲染管线与源STEP派生真实外形
 * 严格导入并遵循 ./sim.js 纯逻辑状态机合同
 */

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import * as sim from './sim.js';
import { loadRealModels, bindRealPorts } from './real-models.js';
import { createCableRoute, findCableIntersections, findMeshCableIntersections } from './cable-routing.js';

// ============================================================================
// 1. 全局状态与 DOM 元素获取
// ============================================================================

/** 核心仿真状态（由 sim.createState() 初始化） */
const state = sim.createState();
let sceneNeedsRender = true;
let canvasResizeObserver = null;
let realModels = null;
let modelsReady = false;
let modelErrors = [];

function gateModelControls() {
  for (const panel of [dom.panelLeft, dom.panelRight]) {
    if (!panel) continue;
    for (const input of panel.querySelectorAll('button, input, select, textarea')) {
      if (input.id.includes('toggle-left') || input.id.includes('toggle-right')) continue;
      if (!modelsReady) input.disabled = true;
    }
  }
}

/** 端口与连线 3D 映射元数据 */
const PORTS_METADATA = {
  'supply-xt60': {
    name: 'TB47D电池架 XT60供电输出',
    category: 'power',
    device: 'power',
    pos: new THREE.Vector3(-2.3, 0.35, -1.1),
    normal: new THREE.Vector3(1, 0, 0)
  },
  'center-xt60': {
    name: '中心板2 XT60总输入',
    category: 'power',
    device: 'center-board',
    pos: new THREE.Vector3(-1.35, 0.15, -0.2),
    normal: new THREE.Vector3(-1, 0, 0)
  },
  'center-xt30-a': {
    name: '中心板2 XT30输出A',
    category: 'power',
    device: 'center-board',
    pos: new THREE.Vector3(-1.05, 0.15, -0.48),
    normal: new THREE.Vector3(0, 0, -1)
  },
  'center-xt30-b': {
    name: '中心板2 XT30输出B',
    category: 'power',
    device: 'center-board',
    pos: new THREE.Vector3(-0.65, 0.15, -0.48),
    normal: new THREE.Vector3(0, 0, -1)
  },
  'ctrl-xt30': {
    name: 'C板 XT30电源输入',
    category: 'power',
    device: 'controller',
    pos: new THREE.Vector3(-1.45, 0.15, 1.15),
    normal: new THREE.Vector3(0, 0, -1)
  },
  'esc-pwr': {
    name: 'C620 电源输入线',
    category: 'power',
    device: 'esc',
    pos: new THREE.Vector3(0.55, 0.18, -0.05),
    normal: new THREE.Vector3(-1, 0, 0)
  },
  'ctrl-can': {
    name: 'C板 CAN1通信口 (2-pin)',
    category: 'can',
    device: 'controller',
    pos: new THREE.Vector3(-1.25, 0.15, 1.62),
    normal: new THREE.Vector3(0, 0, 1)
  },
  'center-can-ctrl': {
    name: '中心板2 CAN口A (并联网络)',
    category: 'can',
    device: 'center-board',
    pos: new THREE.Vector3(-0.95, 0.15, 0.15),
    normal: new THREE.Vector3(0, 0, 1)
  },
  'center-can-esc': {
    name: '中心板2 CAN口B (并联网络)',
    category: 'can',
    device: 'center-board',
    pos: new THREE.Vector3(-0.65, 0.15, 0.15),
    normal: new THREE.Vector3(0, 0, 1)
  },
  'esc-can': {
    name: 'C620 CAN控制口',
    category: 'can',
    device: 'esc',
    pos: new THREE.Vector3(0.55, 0.18, 0.35),
    normal: new THREE.Vector3(-1, 0, 0)
  },
  'esc-phases': {
    name: 'C620 三相动力输出端',
    category: 'phases',
    device: 'esc',
    pos: new THREE.Vector3(1.05, 0.18, 0.05),
    normal: new THREE.Vector3(1, 0, 0)
  },
  'motor-phases': {
    name: 'M3508 三相动力输入口',
    category: 'phases',
    device: 'motor',
    pos: new THREE.Vector3(2.35, 0.38, 0.22),
    normal: new THREE.Vector3(-1, 0, 0)
  },
  'esc-data': {
    name: 'C620 7-pin专用数据口',
    category: 'data',
    device: 'esc',
    pos: new THREE.Vector3(1.05, 0.18, 0.35),
    normal: new THREE.Vector3(1, 0, 0)
  },
  'motor-data': {
    name: 'M3508 7-pin传感器数据口',
    category: 'data',
    device: 'motor',
    pos: new THREE.Vector3(2.35, 0.38, 0.58),
    normal: new THREE.Vector3(-1, 0, 0)
  }
};

/** 链路两端端口对应关系 */
const LINK_PAIR_MAP = {
  'supply-center': ['supply-xt60', 'center-xt60'],
  'center-controller': ['center-xt30-a', 'ctrl-xt30'],
  'center-esc': ['center-xt30-b', 'esc-pwr'],
  'controller-can': ['ctrl-can', 'center-can-ctrl'],
  'esc-can': ['center-can-esc', 'esc-can'],
  'esc-phases': ['esc-phases', 'motor-phases'],
  'esc-data': ['esc-data', 'motor-data']
};

/** 反向映射：端点对到 Link ID */
const PORT_PAIR_TO_LINK = {};
for (const [linkId, [pA, pB]] of Object.entries(LINK_PAIR_MAP)) {
  PORT_PAIR_TO_LINK[`${pA}|${pB}`] = linkId;
  PORT_PAIR_TO_LINK[`${pB}|${pA}`] = linkId;
}

// 教学引导步骤数据
const WALKTHROUGH_STEPS = [
  {
    step: 1,
    title: '认识五大核心器件与拓扑',
    desc: '在电控系统中，电池不可直连本例M3508无刷三相端（避免与有刷直流混淆）。请在3D舞台中观察TB47D电池与电池架总成、中心板2、C型主控、C620电调与M3508无刷电机的空间布局与功能分工。'
  },
  {
    step: 2,
    title: '供电拓扑连接 (P1 - P3)',
    desc: '中心板2通过XT60接入24V，并分出两路XT30。主控与电调分别从分电板支路取电；此处只演示功能关系，实际保护/地参考待核实。'
  },
  {
    step: 3,
    title: 'CAN 总线控制拓扑 (C1 - C2)',
    desc: '主控通过差分CAN总线与电调通信。中心板2各CAN口物理并联；遵循高速CAN主干两端终端原则，但C板与中心板实际板载终端配置待核实，两只120Ω并联仅为断电理论直流值。'
  },
  {
    step: 4,
    title: '电机相线与编码器连接 (M1 - M2)',
    desc: '无刷电机三相动力线负责大电流换向驱动，7-pin专用数据线（未知逐脚定义）传输电机传感器数据。两组线不可混淆，缺一不可。'
  },
  {
    step: 5,
    title: '系统上电与闭环运行',
    desc: '开启24V主电源，下发目标转速1500 RPM并启动电机。观察转子转速与经过3591/187减速后的输出轴转速，监视CAN 0x200与0x201报文。'
  },
  {
    step: 6,
    title: '故障模拟与排障诊断闭环',
    desc: '尝试注入CAN断开、供电异常或编码器故障，观察系统即时保护停机与中文诊断输出；清除故障后系统自动恢复。'
  }
];

// DOM 元素引用
const dom = {
  canvasContainer: document.getElementById('motor-lab-canvas'),
  webglFallback: document.getElementById('webgl-fallback'),
  portPromptCard: document.getElementById('port-prompt-card'),
  portPromptText: document.getElementById('port-prompt-text'),

  // 顶栏按钮
  btnToggleLeft: document.getElementById('btn-toggle-left-panel'),
  btnToggleRight: document.getElementById('btn-toggle-right-panel'),
  btnToggleProj: document.getElementById('btn-toggle-projection'),
  btnResetCam: document.getElementById('btn-reset-camera'),
  panelLeft: document.getElementById('panel-left'),
  panelRight: document.getElementById('panel-right'),
  btnCollapseLeft: document.getElementById('btn-collapse-left'),
  btnCollapseRight: document.getElementById('btn-collapse-right'),

  // 接线操作
  btnAutoConnect: document.getElementById('btn-auto-connect'),
  btnDisconnectAll: document.getElementById('btn-disconnect-all'),
  linksList: document.getElementById('links-list'),

  // 步骤引导
  walkthroughStepBadge: document.getElementById('walkthrough-step-badge'),
  walkthroughStepTitle: document.getElementById('walkthrough-step-title'),
  walkthroughStepDesc: document.getElementById('walkthrough-step-desc'),
  btnWalkthroughPrev: document.getElementById('btn-walkthrough-prev'),
  btnWalkthroughNext: document.getElementById('btn-walkthrough-next'),
  btnSkipWalkthrough: document.getElementById('btn-skip-walkthrough'),

  // 运行控制
  btnTogglePower: document.getElementById('btn-toggle-power'),
  powerBtnLabel: document.getElementById('power-btn-label'),
  btnToggleRun: document.getElementById('btn-toggle-run'),
  runBtnLabel: document.getElementById('run-btn-label'),
  btnStep: document.getElementById('btn-step'),
  btnTogglePause: document.getElementById('btn-toggle-pause'),
  pauseBtnLabel: document.getElementById('pause-btn-label'),
  btnReset: document.getElementById('btn-reset'),
  inputTargetRpmRange: document.getElementById('input-target-rpm-range'),
  inputTargetRpm: document.getElementById('input-target-rpm'),
  selectMotorId: document.getElementById('select-motor-id'),
  selectCommandId: document.getElementById('select-command-id'),
  selectFault: document.getElementById('select-fault'),
  btnClearFault: document.getElementById('btn-clear-fault'),

  // 代码控制台
  codeEditor: document.getElementById('code-editor'),
  btnRunCode: document.getElementById('btn-run-code'),
  codeFeedback: document.getElementById('code-feedback'),

  // 遥测与报文
  telemetryRotorRpm: document.getElementById('telemetry-rotor-rpm'),
  telemetryShaftRpm: document.getElementById('telemetry-shaft-rpm'),
  telemetryCurrent: document.getElementById('telemetry-current'),
  telemetryTemp: document.getElementById('telemetry-temp'),
  frameTxId: document.getElementById('frame-tx-id'),
  frameTxData: document.getElementById('frame-tx-data'),
  frameRxId: document.getElementById('frame-rx-id'),
  frameRxData: document.getElementById('frame-rx-data'),

  // 诊断与状态栏
  diagnosticsList: document.getElementById('diagnostics-list'),
  diagStatusDot: document.getElementById('diag-status-dot'),
  footerStatusText: document.getElementById('footer-status-text'),
  footerDot: document.getElementById('footer-dot')
};

// ============================================================================
// 2. Three.js 场景、渲染器与相机设置
// ============================================================================

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let _animFrameId = null;
window.addEventListener('pagehide', () => {
  if (_animFrameId !== null) cancelAnimationFrame(_animFrameId);
  controls?.dispose();
  canvasResizeObserver?.disconnect();
  renderer?.dispose();
}, { once: true });

// 3D 节点引用集合
const sceneNodes = {
  portMeshes: new Map(), // portId -> THREE.Mesh
  wireGroups: new Map(), // linkId -> THREE.Group
  indicatorLeds: {},     // ledId -> THREE.Mesh
  motorShaft: null,      // M3508 输出轴（独立旋转）
  motorRotor: null       // M3508 内部转子指示环
};

// 交互状态
let selectedPortId = null;
let currentWalkthroughIndex = 0;
let isWalkthroughSkipped = false;
let isSimPaused = false;

/**
 * 初始化 3D WebGL 运行环境
 */
function initThreeScene() {
  if (!dom.canvasContainer) return false;

  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = null; // Preserve the reviewed device colours; no distance washout.

    const width = dom.canvasContainer.clientWidth || 800;
    const height = dom.canvasContainer.clientHeight || 600;

    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);
    camera.position.set(0, 3.8, 4.6);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    canvasResizeObserver = new ResizeObserver(() => {
      if (renderer.domElement.width !== Math.round(dom.canvasContainer.clientWidth * renderer.getPixelRatio()) ||
          renderer.domElement.height !== Math.round(dom.canvasContainer.clientHeight * renderer.getPixelRatio())) {
        onWindowResize();
      }
    });
    canvasResizeObserver.observe(dom.canvasContainer);
    renderer.shadowMap.enabled = false; // CAD surfaces retain geometry; avoid a second heavy shadow pass.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    dom.canvasContainer.innerHTML = '';
    dom.canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.25, 0.1);
    controls.maxPolarAngle = Math.PI - 0.03;
    controls.minDistance = 0.15;
    controls.maxDistance = 30.0;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;

    // 灯光体系：科技感白色环境光 + 主定向投影光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 0.85);
    mainSun.position.set(3, 6, 4);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 1024;
    mainSun.shadow.mapSize.height = 1024;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 15;
    mainSun.shadow.bias = -0.001;
    scene.add(mainSun);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.4);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);

    // 实验操作台网格与地台
    buildLabWorkbench(scene);

    // Model loading is asynchronous; interaction is enabled only after all six sources load.

    return true;
  } catch (err) {
    console.error('WebGL 初始化异常:', err);
    if (dom.webglFallback) {
      dom.webglFallback.style.display = 'flex';
    }
    return false;
  }
}

/**
 * 实验工作台与科技网格地面
 */
function buildLabWorkbench(targetScene) {
  // 台面主网格
  const gridHelper = new THREE.GridHelper(10, 20, 0x0284c7, 0xe2e8f0);
  gridHelper.position.y = -0.001;
  targetScene.add(gridHelper);

  // 防静电实验台面垫 (哑光浅灰蓝)
  const matGeo = new THREE.BoxGeometry(9.2, 0.04, 5.2);
  const matMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.85,
    metalness: 0.1
  });
  const matMesh = new THREE.Mesh(matGeo, matMat);
  matMesh.position.set(0, -0.02, 0.1);
  matMesh.receiveShadow = true;
  targetScene.add(matMesh);

  // 台面边缘导电包边线
  const borderGeo = new THREE.BoxGeometry(9.24, 0.01, 5.24);
  const borderMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true });
  const borderMesh = new THREE.Mesh(borderGeo, borderMat);
  borderMesh.position.set(0, 0.005, 0.1);
  targetScene.add(borderMesh);
}

/**
 * 构建可点击与连线交互的插座网格
 */
function buildPortMeshes(targetScene) {
  for (const [portId, meta] of Object.entries(PORTS_METADATA)) {
    const portGroup = new THREE.Group();
    portGroup.position.copy(meta.pos);

    let color = 0x94a3b8;
    let size = [0.08, 0.08, 0.08];

    if (meta.category === 'power') {
      color = 0xea580c; // 橙色 XT60/XT30
      size = [0.09, 0.06, 0.09];
    } else if (meta.category === 'can') {
      color = 0x0284c7; // 蓝色 CAN
      size = [0.07, 0.06, 0.07];
    } else if (meta.category === 'phases') {
      color = 0xd97706; // 琥珀三相
      size = [0.08, 0.08, 0.12];
    } else if (meta.category === 'data') {
      color = 0x059669; // 翠绿 7-pin
      size = [0.08, 0.08, 0.12];
    }

    const socketGeo = new THREE.BoxGeometry(...size);
    const socketMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.3
    });
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.castShadow = true;
    socket.userData = { isPort: true, portId };
    portGroup.add(socket);

    // 交互高亮发光环
    const ringGeo = new THREE.RingGeometry(0.06, 0.08, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    portGroup.add(ring);

    socket.userData.ring = ring;
    sceneNodes.portMeshes.set(portId, socket);
    targetScene.add(portGroup);
  }
}

/**
 * 根据 state.connections 动态重建柔性 Curve 3D 导线
 */
function updateFlexibleWires(targetScene) {
  // 移除既有导线网格
  for (const group of sceneNodes.wireGroups.values()) {
    targetScene.remove(group);
    group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  sceneNodes.wireGroups.clear();

  // 根据已连接链路创建新三维导线
  for (const linkId of state.connections) {
    const pair = LINK_PAIR_MAP[linkId];
    if (!pair) continue;

    const [pA, pB] = pair;
    const metaA = PORTS_METADATA[pA];
    const metaB = PORTS_METADATA[pB];
    if (!metaA || !metaB) continue;

    const wireGroup = new THREE.Group();
    const posA = metaA.pos.clone();
    const posB = metaB.pos.clone();

    const nA = metaA.normal.clone().normalize();
    const nB = metaB.normal.clone().normalize();

    // 考虑四类线缆样式与故障状态
    let wireColor = 0x94a3b8;
    let radius = 0.016;

    const isFaulty = (
      (state.fault === 'can' && metaA.category === 'can') ||
      (state.fault === 'power' && metaA.category === 'power') ||
      (state.fault === 'phases' && linkId === 'esc-phases') ||
      (state.fault === 'data' && linkId === 'esc-data')
    );

    if (isFaulty) {
      wireColor = 0xef4444; // 故障红色警示
    } else if (metaA.category === 'power') {
      wireColor = 0xea580c; // 橙色功率主供电
      radius = 0.022;
    } else if (metaA.category === 'can') {
      wireColor = 0x0284c7; // 蓝色 CAN 差分通信
      radius = 0.015;
    } else if (metaA.category === 'phases') {
      wireColor = 0xd97706; // 琥珀色 三相动力
      radius = 0.019;
    } else if (metaA.category === 'data') {
      wireColor = 0x059669; // 翠绿色 7-pin 数据线
      radius = 0.016;
    }

    const boxes = realModels ? [...realModels.boxes] : [];
    const curve = createCableRoute(posA, nA, posB, nB, boxes, sim.LINKS.indexOf(linkId), radius);
    const candidates = findCableIntersections(curve, boxes, posA, posB, radius);
    wireGroup.userData.boundsCandidates = candidates;
    wireGroup.userData.intersections = realModels
      ? findMeshCableIntersections(curve, candidates, realModels.roots, posA, posB, radius)
      : candidates;
    wireGroup.userData.curve = curve;
    const tubeGeo = new THREE.TubeGeometry(curve, 96, radius, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: wireColor,
      roughness: 0.5,
      metalness: 0.2,
      emissive: isFaulty ? 0x7f1d1d : 0x000000
    });

    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.castShadow = true;
    wireGroup.add(tubeMesh);
    // Abstract plug grips start flush at the endpoint and extend outward.
    for (const [endpoint, normal] of [[posA, nA], [posB, nB]]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(.055, .06, .085),
        new THREE.MeshStandardMaterial({ color: wireColor, roughness: .6 }));
      grip.position.copy(endpoint).addScaledVector(normal, .0425);
      grip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      wireGroup.add(grip);
    }

    sceneNodes.wireGroups.set(linkId, wireGroup);
    targetScene.add(wireGroup);
  }
}

// ============================================================================
// 3. 3D 射线交互、端点选择与视角控制
// ============================================================================

function setupInteractionEvents() {
  if (!renderer || !camera) return;
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let gesture = null;
  let hovered = null;
  let preview = null;

  function pointRay(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((e.clientX - rect.left) / rect.width * 2 - 1,
      -(e.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(mouse, camera);
    return rect;
  }

  // 屏幕空间容错随缩放保持一致，不用扩大实际端口或改变拓扑。
  function pickPort(e) {
    const rect = pointRay(e);
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) return null;
    let nearest = null;
    let distance = 12;
    for (const [id, mesh] of sceneNodes.portMeshes) {
      const point = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      const pixels = Math.hypot(rect.left + (point.x + 1) * rect.width / 2 - e.clientX,
        rect.top + (1 - point.y) * rect.height / 2 - e.clientY);
      if (pixels < distance) { distance = pixels; nearest = id; }
    }
    return nearest;
  }

  function clearHover() {
    if (hovered && hovered !== selectedPortId) highlightPort(hovered, false);
    hovered = null;
  }

  function finishGesture() {
    if (!gesture) return;
    sceneNeedsRender = true;
    const old = gesture;
    gesture = null;
    controls.enabled = old.controlsEnabled;
    if (canvas.hasPointerCapture(old.id)) canvas.releasePointerCapture(old.id);
    if (old.port !== selectedPortId) highlightPort(old.port, false);
    if (preview) {
      scene.remove(preview);
      preview.geometry.dispose();
      preview.material.dispose();
      preview = null;
    }
    canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || gesture) return;
    const port = pickPort(e);
    if (!port) return; // 空白区拖动仍交给OrbitControls。
    clearHover();
    gesture = { id: e.pointerId, port, x: e.clientX, y: e.clientY,
      moved: false, controlsEnabled: controls.enabled };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
    e.preventDefault();
    highlightPort(port, true);
    canvas.style.cursor = 'crosshair';
    dom.portPromptText.textContent = `端口：${PORTS_METADATA[port].name}；拖到匹配端口松手，或点击后再点另一端`;
  }, true);

  canvas.addEventListener('pointermove', e => {
    if (!gesture) {
      const port = pickPort(e);
      clearHover();
      hovered = port;
      if (port) highlightPort(port, true);
      canvas.style.cursor = port ? 'pointer' : 'grab';
      return;
    }
    if (e.pointerId !== gesture.id) return;
    e.stopImmediatePropagation();
    gesture.moved ||= Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 5;
    if (!gesture.moved) return;
    const target = pickPort(e);
    clearHover();
    hovered = target;
    if (target) highlightPort(target, true);
    const source = PORTS_METADATA[gesture.port].pos;
    const end = new THREE.Vector3();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()), source);
    if (raycaster.ray.intersectPlane(plane, end)) {
      if (target) end.copy(PORTS_METADATA[target].pos);
      if (preview) preview.geometry.dispose();
      const geometry = new THREE.BufferGeometry().setFromPoints([source, end]);
      if (!preview) {
        preview = new THREE.Line(geometry, new THREE.LineDashedMaterial({
          color: 0x0284c7, dashSize: 0.08, gapSize: 0.04, depthTest: false }));
        preview.renderOrder = 10;
        scene.add(preview);
      } else preview.geometry = geometry;
      preview.computeLineDistances();
      sceneNeedsRender = true;
    }
    dom.portPromptText.textContent = target
      ? `松手连接：${PORTS_METADATA[gesture.port].name} → ${PORTS_METADATA[target].name}`
      : '拖动中：移到匹配端口后松手；在空白处松手取消';
  }, true);

  canvas.addEventListener('pointerup', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    e.stopImmediatePropagation();
    const { port, moved } = gesture;
    const target = pickPort(e);
    clearHover();
    finishGesture();
    if (!moved) {
      handlePortClick(port);
    } else {
      if (selectedPortId) highlightPort(selectedPortId, false);
      selectedPortId = null;
      if (target && target !== port) {
        handlePortClick(port);
        handlePortClick(target); // 同一配对规则、同一sim.connect路径。
      } else dom.portPromptText.textContent = '已取消拖线；请将线端拖到匹配端口';
    }
  }, true);

  function cancelGesture() {
    clearHover();
    finishGesture();
    if (selectedPortId) highlightPort(selectedPortId, false);
    selectedPortId = null;
  }
  canvas.addEventListener('pointercancel', cancelGesture, true);
  canvas.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
  canvas.addEventListener('pointerleave', () => { if (!gesture) clearHover(); });
  window.addEventListener('blur', cancelGesture);

  // 视角预设按键监听
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const view = e.currentTarget.dataset.view;
      setCameraPreset(view);
    });
  });
}

/**
 * 处理端口点击接线逻辑
 */
function handlePortClick(portId) {
  const meta = PORTS_METADATA[portId];
  if (!meta) return;

  // 首次点击：选定端点 A
  if (!selectedPortId) {
    selectedPortId = portId;
    highlightPort(portId, true);
    if (dom.portPromptText) {
      dom.portPromptText.textContent = `已选定端点 A: [${meta.name}]，请点击对应匹配端点 B 完成连接`;
    }
    return;
  }

  // 再次点击相同端点：取消选定
  if (selectedPortId === portId) {
    highlightPort(selectedPortId, false);
    selectedPortId = null;
    if (dom.portPromptText) {
      dom.portPromptText.textContent = '已取消端点选择，可继续点击或在左侧面板管理连线';
    }
    return;
  }

  // 两次不同端点：查找是否构成有效链路
  const firstId = selectedPortId;
  const linkKey = `${firstId}|${portId}`;
  const matchedLinkId = PORT_PAIR_TO_LINK[linkKey];

  highlightPort(firstId, false);
  selectedPortId = null;

  if (!matchedLinkId) {
    if (dom.portPromptText) {
      dom.portPromptText.textContent = `⚠️ 端点类型不匹配或非有效电气拓扑: [${PORTS_METADATA[firstId].name}] 与 [${meta.name}] 无法直连`;
    }
    return;
  }

  // 调用 sim.connect
  const res = sim.connect(state, matchedLinkId);
  if (res.ok) {
    if (dom.portPromptText) {
      dom.portPromptText.textContent = `✅ 成功建立链路: ${sim.LINK_DESCRIPTIONS[matchedLinkId] || matchedLinkId}`;
    }
  } else {
    if (dom.portPromptText) {
      dom.portPromptText.textContent = `ℹ️ ${res.reason}`;
    }
  }

  syncFullUI();
}

/**
 * 端口光环高亮
 */
function highlightPort(portId, active) {
  sceneNeedsRender = true;
  const socket = sceneNodes.portMeshes.get(portId);
  if (socket && socket.userData.ring) {
    socket.userData.ring.material.opacity = active ? 0.85 : 0.0;
  }
}

/**
 * 基于全部5大设备与端点包围盒自适应机位，避免三栏窄画布时两端裁切
 */
function fitCameraToScene() {
  if (realModels?.labels) for (const label of realModels.labels.values()) label.visible = true;
  if (!camera || !controls || !dom.canvasContainer) return;
  const width = dom.canvasContainer.clientWidth;
  const height = dom.canvasContainer.clientHeight;
  if (width <= 0 || height <= 0) return;

  const aspect = width / height;

  const box = new THREE.Box3();
  if (realModels) {
    for (const root of realModels.roots.values()) root.traverse(object => {
      if (object.isMesh && object.visible) box.expandByObject(object);
    });
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-3.5, 0, -1.8), new THREE.Vector3(3.5, 2.5, 1.8));
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  // 综合计算横向与纵向视锥所需距离，并预留 18% 安全可视边距
  const dist = size.length() / 2 / Math.sin(Math.min(vFov, hFov) / 2) * 1.12;

  const elevation = 0.65; // 约 37 度俯仰视线
  camera.position.set(
    center.x,
    center.y + dist * Math.sin(elevation),
    center.z + dist * Math.cos(elevation)
  );
  controls.target.copy(center);
  controls.update();
}

/**
 * 相机视角预设平滑切换
 */
function setCameraPreset(preset) {
  sceneNeedsRender = true;
  if (realModels?.labels) {
    for (const label of realModels.labels.values()) label.visible = preset === 'overview';
  }
  if (!camera || !controls) return;

  if (modelsReady && preset !== 'overview') {
    const id = { motor: 'm3508', esc: 'c620', controller: 'c-board', supply: 'tb47d', center: 'center-board2' }[preset];
    const box = realModels.boxes.get(id);
    if (box) {
      const center = box.getCenter(new THREE.Vector3());
      const distance = box.getSize(new THREE.Vector3()).length() / Math.sin(camera.fov * Math.PI / 360);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(distance));
      controls.update();
      return;
    }
  }
  switch (preset) {
    case 'motor':
      camera.position.set(2.6, 1.2, 1.8);
      controls.target.set(2.6, 0.4, 0.4);
      controls.update();
      break;
    case 'esc':
      camera.position.set(0.3, 1.1, 1.4);
      controls.target.set(0.0, 0.2, 0.0);
      controls.update();
      break;
    case 'controller':
      camera.position.set(-1.4, 1.0, 2.4);
      controls.target.set(-1.4, 0.1, 1.4);
      controls.update();
      break;
    case 'overview':
    default:
      fitCameraToScene();
      break;
  }
}

// ============================================================================
// 4. UI 交互绑定与状态同步
// ============================================================================

function setupUIBindings() {
  // 顶栏折叠与投影控制
  if (dom.btnToggleLeft && dom.panelLeft) {
    dom.btnToggleLeft.addEventListener('click', () => {
      dom.panelLeft.classList.toggle('collapsed');
      const isExpanded = !dom.panelLeft.classList.contains('collapsed');
      dom.btnToggleLeft.setAttribute('aria-expanded', String(isExpanded));
      onWindowResize();
    });
  }

  if (dom.btnCollapseLeft && dom.panelLeft) {
    dom.btnCollapseLeft.addEventListener('click', () => {
      dom.panelLeft.classList.add('collapsed');
      if (dom.btnToggleLeft) dom.btnToggleLeft.setAttribute('aria-expanded', 'false');
      onWindowResize();
    });
  }

  if (dom.btnToggleRight && dom.panelRight) {
    dom.btnToggleRight.addEventListener('click', () => {
      dom.panelRight.classList.toggle('collapsed');
      const isExpanded = !dom.panelRight.classList.contains('collapsed');
      dom.btnToggleRight.setAttribute('aria-expanded', String(isExpanded));
      onWindowResize();
    });
  }

  if (dom.btnCollapseRight && dom.panelRight) {
    dom.btnCollapseRight.addEventListener('click', () => {
      dom.panelRight.classList.add('collapsed');
      if (dom.btnToggleRight) dom.btnToggleRight.setAttribute('aria-expanded', 'false');
      onWindowResize();
    });
  }

  // 投影模式切换
  if (dom.btnToggleProj) {
    dom.btnToggleProj.addEventListener('click', () => {
      document.body.classList.toggle('projection-mode');
      const isProj = document.body.classList.contains('projection-mode');
      dom.btnToggleProj.setAttribute('aria-pressed', String(isProj));
      dom.btnToggleProj.classList.toggle('active', isProj);
    });
  }

  // 视角复位
  if (dom.btnResetCam) {
    dom.btnResetCam.addEventListener('click', () => {
      setCameraPreset('overview');
    });
  }

  // 一键自动接线与断开
  if (dom.btnAutoConnect) {
    dom.btnAutoConnect.addEventListener('click', () => {
      sim.autoConnect(state);
      syncFullUI();
      if (dom.portPromptText) dom.portPromptText.textContent = '已自动建立全部7条标准电气与通信链路';
    });
  }

  if (dom.btnDisconnectAll) {
    dom.btnDisconnectAll.addEventListener('click', () => {
      for (const id of sim.LINKS) {
        sim.disconnect(state, id);
      }
      syncFullUI();
      if (dom.portPromptText) dom.portPromptText.textContent = '已断开所有连线';
    });
  }

  // 左侧面板单条链路点击切换
  if (dom.linksList) {
    dom.linksList.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-link-action');
      if (!btn) return;
      const targetLink = btn.dataset.target;
      if (!targetLink) return;

      if (state.connections.includes(targetLink)) {
        sim.disconnect(state, targetLink);
      } else {
        sim.connect(state, targetLink);
      }
      syncFullUI();
    });
  }

  // 步骤引导翻页
  if (dom.btnWalkthroughNext) {
    dom.btnWalkthroughNext.addEventListener('click', () => {
      if (currentWalkthroughIndex < WALKTHROUGH_STEPS.length - 1) {
        currentWalkthroughIndex++;
        updateWalkthroughView();
      }
    });
  }

  if (dom.btnWalkthroughPrev) {
    dom.btnWalkthroughPrev.addEventListener('click', () => {
      if (currentWalkthroughIndex > 0) {
        currentWalkthroughIndex--;
        updateWalkthroughView();
      }
    });
  }

  if (dom.btnSkipWalkthrough) {
    dom.btnSkipWalkthrough.addEventListener('click', () => {
      isWalkthroughSkipped = true;
      if (dom.walkthroughStepBadge) dom.walkthroughStepBadge.textContent = '自由实验模式';
      if (dom.walkthroughStepTitle) dom.walkthroughStepTitle.textContent = '自主接线与验证';
      if (dom.walkthroughStepDesc) dom.walkthroughStepDesc.textContent = '当前为自由探索阶段，可任意模拟接线、调速、代码指令与排查各种故障组合。';
      if (dom.btnWalkthroughNext) dom.btnWalkthroughNext.disabled = true;
      if (dom.btnWalkthroughPrev) dom.btnWalkthroughPrev.disabled = true;
    });
  }

  // 运行控制按键
  if (dom.btnTogglePower) {
    dom.btnTogglePower.addEventListener('click', () => {
      state.power = !state.power;
      syncFullUI();
    });
  }

  if (dom.btnToggleRun) {
    dom.btnToggleRun.addEventListener('click', () => {
      state.running = !state.running;
      syncFullUI();
    });
  }

  if (dom.btnStep) {
    dom.btnStep.addEventListener('click', () => {
      // 单步步进：自动置为暂停时间状态，单次仅推进 0.05s
      isSimPaused = true;
      if (dom.pauseBtnLabel) dom.pauseBtnLabel.textContent = '继续模拟';
      if (dom.btnTogglePause) dom.btnTogglePause.classList.add('active');
      sim.step(state, 0.05);
      syncFullUI();
    });
  }

  if (dom.btnTogglePause && dom.pauseBtnLabel) {
    dom.btnTogglePause.addEventListener('click', () => {
      // 独立暂停/继续模拟时间自动推进（不影响电机运行指令，不重置接线）
      isSimPaused = !isSimPaused;
      dom.pauseBtnLabel.textContent = isSimPaused ? '继续模拟' : '暂停模拟';
      dom.btnTogglePause.classList.toggle('active', isSimPaused);
    });
  }

  if (dom.btnReset) {
    dom.btnReset.addEventListener('click', () => {
      sim.reset(state);
      isSimPaused = false;
      if (dom.pauseBtnLabel) dom.pauseBtnLabel.textContent = '暂停模拟';
      if (dom.btnTogglePause) dom.btnTogglePause.classList.remove('active');

      // 严格同步所有控制台控件，避免每帧抢占输入
      if (dom.inputTargetRpm) dom.inputTargetRpm.value = state.targetRpm;
      if (dom.inputTargetRpmRange) dom.inputTargetRpmRange.value = state.targetRpm;
      if (dom.selectMotorId) dom.selectMotorId.value = String(state.motorId);
      if (dom.selectCommandId) dom.selectCommandId.value = String(state.commandId);
      if (dom.selectFault) dom.selectFault.value = state.fault || 'none';

      syncFullUI();
      if (dom.codeFeedback) {
        dom.codeFeedback.style.display = 'none';
      }
      if (dom.portPromptText) {
        dom.portPromptText.textContent = '系统已完全重置为初始状态';
      }
    });
  }

  // 目标 RPM 调节
  if (dom.inputTargetRpmRange && dom.inputTargetRpm) {
    dom.inputTargetRpmRange.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      state.targetRpm = val;
      dom.inputTargetRpm.value = val;
      syncFullUI();
    });

    dom.inputTargetRpm.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10) || 0;
      val = Math.max(-3000, Math.min(3000, val));
      state.targetRpm = val;
      dom.inputTargetRpm.value = val;
      dom.inputTargetRpmRange.value = val;
      syncFullUI();
    });

    document.querySelectorAll('.btn-quick-rpm').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rpm = parseInt(e.currentTarget.dataset.rpm, 10) || 0;
        state.targetRpm = rpm;
        dom.inputTargetRpm.value = rpm;
        dom.inputTargetRpmRange.value = rpm;
        syncFullUI();
      });
    });
  }

  // ID 配置
  if (dom.selectMotorId) {
    dom.selectMotorId.addEventListener('change', (e) => {
      state.motorId = parseInt(e.target.value, 10) || 1;
      syncFullUI();
    });
  }

  if (dom.selectCommandId) {
    dom.selectCommandId.addEventListener('change', (e) => {
      state.commandId = parseInt(e.target.value, 10) || 1;
      syncFullUI();
    });
  }

  // 故障注入
  if (dom.selectFault) {
    dom.selectFault.addEventListener('change', (e) => {
      state.fault = e.target.value || 'none';
      syncFullUI();
    });
  }

  if (dom.btnClearFault) {
    dom.btnClearFault.addEventListener('click', () => {
      state.fault = 'none';
      if (dom.selectFault) dom.selectFault.value = 'none';
      syncFullUI();
    });
  }

  // 代码控制台执行与代码片段
  if (dom.btnRunCode && dom.codeEditor) {
    dom.btnRunCode.addEventListener('click', () => {
      const code = dom.codeEditor.value;
      const res = sim.parseProgram(code);

      if (!res.ok) {
        if (dom.codeFeedback) {
          dom.codeFeedback.className = 'code-feedback feedback-error';
          dom.codeFeedback.textContent = `❌ 语法或指令错误: ${res.error}`;
        }
      } else {
        // 严格遵循合同：解析成功才写状态
        state.targetRpm = res.targetRpm;
        state.running = res.running;
        if (dom.inputTargetRpm) dom.inputTargetRpm.value = res.targetRpm;
        if (dom.inputTargetRpmRange) dom.inputTargetRpmRange.value = res.targetRpm;

        if (dom.codeFeedback) {
          dom.codeFeedback.className = 'code-feedback feedback-ok';
          dom.codeFeedback.textContent = `✅ 指令执行成功：目标转速设为 ${res.targetRpm} RPM，电机状态: ${res.running ? '启动' : '停止'}`;
        }
        syncFullUI();
      }
    });

    document.querySelectorAll('.btn-snippet').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const snippet = e.currentTarget.dataset.code;
        if (snippet && dom.codeEditor) {
          dom.codeEditor.value = snippet;
        }
      });
    });
  }

  window.addEventListener('resize', onWindowResize);
}

/**
 * 更新步骤引导视图
 */
function updateWalkthroughView() {
  if (isWalkthroughSkipped) return;
  const item = WALKTHROUGH_STEPS[currentWalkthroughIndex];
  if (!item) return;

  if (dom.walkthroughStepBadge) {
    dom.walkthroughStepBadge.textContent = `步骤 ${item.step} / ${WALKTHROUGH_STEPS.length}`;
  }
  if (dom.walkthroughStepTitle) {
    dom.walkthroughStepTitle.textContent = item.title;
  }
  if (dom.walkthroughStepDesc) {
    dom.walkthroughStepDesc.textContent = item.desc;
  }

  if (dom.btnWalkthroughPrev) {
    dom.btnWalkthroughPrev.disabled = (currentWalkthroughIndex === 0);
  }
  if (dom.btnWalkthroughNext) {
    dom.btnWalkthroughNext.disabled = (currentWalkthroughIndex === WALKTHROUGH_STEPS.length - 1);
  }
}

/**
 * 全量同步 UI 控件、3D导线与诊断信息
 */
function syncFullUI() {
  sceneNeedsRender = true;
  // 1. 同步导线 3D 网格
  if (scene) {
    updateFlexibleWires(scene);
  }

  // 2. 更新电源开关按钮样式
  if (dom.btnTogglePower && dom.powerBtnLabel) {
    if (state.power) {
      dom.btnTogglePower.className = 'toggle-btn btn-power-on';
      dom.btnTogglePower.setAttribute('aria-pressed', 'true');
      dom.powerBtnLabel.textContent = '24V电源：开 (ON)';
    } else {
      dom.btnTogglePower.className = 'toggle-btn btn-power-off';
      dom.btnTogglePower.setAttribute('aria-pressed', 'false');
      dom.powerBtnLabel.textContent = '24V电源：关 (OFF)';
    }
  }

  // 3. 更新电机运行控制按键
  const issues = sim.diagnose(state);

  if (dom.btnToggleRun && dom.runBtnLabel) {
    dom.btnToggleRun.disabled = !modelsReady || !state.power;
    if (state.running) {
      dom.btnToggleRun.className = 'toggle-btn btn-run-on';
      dom.btnToggleRun.setAttribute('aria-pressed', 'true');
      dom.runBtnLabel.textContent = '电机运行：启动中';
    } else {
      dom.btnToggleRun.className = 'toggle-btn btn-run-off';
      dom.btnToggleRun.setAttribute('aria-pressed', 'false');
      dom.runBtnLabel.textContent = '电机运行：停止';
    }
  }

  // 4. 同步左侧接线列表状态
  if (dom.linksList) {
    for (const linkId of sim.LINKS) {
      const row = dom.linksList.querySelector(`[data-link-id="${linkId}"]`);
      if (row) {
        const isConnected = state.connections.includes(linkId);
        row.classList.toggle('connected', isConnected);
        const statusSpan = row.querySelector('.link-status');
        if (statusSpan) {
          statusSpan.textContent = isConnected ? '已连接' : '未连接';
        }
        const actionBtn = row.querySelector('.btn-link-action');
        if (actionBtn) {
          actionBtn.textContent = isConnected ? '断开' : '连接';
        }
      }
    }
  }

  // 5. 更新诊断告警面板
  if (dom.diagnosticsList) {
    dom.diagnosticsList.innerHTML = '';
    if (issues.length === 0) {
      const li = document.createElement('li');
      li.className = 'diag-item diag-ok';
      li.textContent = state.running
        ? '✓ 全部链路通畅，电机闭环运行中'
        : '✓ 系统就绪，等待下发启动指令';
      dom.diagnosticsList.appendChild(li);
    } else {
      for (const issue of issues) {
        const li = document.createElement('li');
        li.className = 'diag-item diag-warn';
        li.textContent = `⚠️ ${issue}`;
        dom.diagnosticsList.appendChild(li);
      }
    }
  }

  // 6. 状态点指示
  if (dom.diagStatusDot) {
    if (issues.length > 0) {
      dom.diagStatusDot.className = 'diag-status-dot dot-fault';
    } else if (state.running) {
      dom.diagStatusDot.className = 'diag-status-dot dot-running';
    } else {
      dom.diagStatusDot.className = 'diag-status-dot dot-idle';
    }
  }

  if (dom.footerDot && dom.footerStatusText) {
    if (!state.power) {
      dom.footerDot.style.backgroundColor = '#94a3b8';
      dom.footerStatusText.textContent = '系统断电中 · 请开启24V主电源以启动实验';
    } else if (issues.length > 0) {
      dom.footerDot.style.backgroundColor = '#ef4444';
      dom.footerStatusText.textContent = `存在运行阻塞 (${issues.length}项) · 请根据诊断建议排查接线或故障`;
    } else if (state.running) {
      dom.footerDot.style.backgroundColor = '#10b981';
      dom.footerStatusText.textContent = runningStatusText();
    } else {
      dom.footerDot.style.backgroundColor = '#3b82f6';
      dom.footerStatusText.textContent = '电源与通信正常 · 处于待命状态';
    }
  }
  gateModelControls();
}

/**
 * 实时遥测仪表盘与CAN报文监视帧更新 (严格不伪造物理参数)
 */
function runningStatusText() {
  return `${isSimPaused ? '模拟已暂停' : 'SIM运行中'} · 目标 ${state.targetRpm} RPM | SIM转子 ${state.rotorRpm.toFixed(1)} RPM`;
}

function updateTelemetryUI() {
  if (dom.footerStatusText && modelsReady && state.power && state.running && sim.diagnose(state).length === 0) {
    dom.footerStatusText.textContent = runningStatusText();
  }
  // 真实计算的转子转速
  if (dom.telemetryRotorRpm) {
    dom.telemetryRotorRpm.textContent = state.rotorRpm.toFixed(1);
  }

  // 减速输出轴转速 (额定减速比 3591 / 187)
  if (dom.telemetryShaftRpm) {
    const shaftRpm = state.rotorRpm / sim.REDUCTION_RATIO;
    dom.telemetryShaftRpm.textContent = shaftRpm.toFixed(2);
  }

  // 电流与温度明确不捏造，标明无硬件采样
  if (dom.telemetryCurrent) {
    dom.telemetryCurrent.textContent = '未建模/无硬件采样';
  }
  if (dom.telemetryTemp) {
    dom.telemetryTemp.textContent = '未建模/无硬件采样';
  }

  // CAN 总线状态判定：仅当供电且两条CAN链路连接、无CAN/Power故障时才连通
  const isCanActive = state.power &&
    ['supply-center', 'center-controller', 'center-esc'].every(id => state.connections.includes(id)) &&
    state.connections.includes('controller-can') &&
    state.connections.includes('esc-can') &&
    state.fault !== 'can' &&
    state.fault !== 'power';

  // C620 CAN 控制帧 (0x200 / 0x1FF)：固定教学编码示例，不参与SIM，不随转速捏造
  if (dom.frameTxId && dom.frameTxData) {
    if (!isCanActive) {
      dom.frameTxId.textContent = 'ID: --';
      dom.frameTxData.textContent = '-- -- -- -- -- -- -- -- (总线离线/故障中断)';
    } else {
      dom.frameTxId.textContent = 'ID: 0x200';
      dom.frameTxData.textContent = '03 E8 00 00 00 00 00 00';
    }
  }

  // C620 CAN 反馈帧 (0x201)：固定离线静态参考帧 (4096角度/-60RPM/100raw/25℃)，非实测采样
  if (dom.frameRxId && dom.frameRxData) {
    if (!isCanActive) {
      dom.frameRxId.textContent = 'ID: --';
      dom.frameRxData.textContent = '-- -- -- -- -- -- -- -- (无反馈交互)';
    } else {
      dom.frameRxId.textContent = 'ID: 0x201';
      dom.frameRxData.textContent = '10 00 FF C4 00 64 19 00';
    }
  }
}

/**
 * 刷新指示灯状态
 */
function updateLeds(time) {
  // 电源灯 (绿色)
  if (sceneNodes.indicatorLeds.power) {
    sceneNodes.indicatorLeds.power.material.color.setHex(state.power ? 0x22c55e : 0x334155);
  }

  // 中心板供电灯
  const hasCenterPwr = state.power && state.connections.includes('supply-center');
  if (sceneNodes.indicatorLeds.center) {
    sceneNodes.indicatorLeds.center.material.color.setHex(hasCenterPwr ? 0x22c55e : 0x334155);
  }

  // 主控板供电与CAN
  const hasCtrlPwr = hasCenterPwr && state.connections.includes('center-controller');
  if (sceneNodes.indicatorLeds.ctrlPower) {
    sceneNodes.indicatorLeds.ctrlPower.material.color.setHex(hasCtrlPwr ? 0x22c55e : 0x334155);
  }
  if (sceneNodes.indicatorLeds.ctrlCan) {
    const isCanActive = hasCtrlPwr && state.connections.includes('controller-can') && (Math.sin(time * 10) > 0);
    sceneNodes.indicatorLeds.ctrlCan.material.color.setHex(isCanActive ? 0x38bdf8 : 0x1e293b);
  }

  // 电调状态灯 (绿闪正常/红常亮故障)
  if (sceneNodes.indicatorLeds.esc) {
    const hasEscPwr = hasCenterPwr && state.connections.includes('center-esc');
    if (!hasEscPwr) {
      sceneNodes.indicatorLeds.esc.material.color.setHex(0x334155);
    } else if (state.fault !== 'none') {
      sceneNodes.indicatorLeds.esc.material.color.setHex(0xef4444);
    } else if (state.running) {
      const fastBlink = Math.sin(time * 16) > 0;
      sceneNodes.indicatorLeds.esc.material.color.setHex(fastBlink ? 0x22c55e : 0x14532d);
    } else {
      const slowBlink = Math.sin(time * 4) > 0;
      sceneNodes.indicatorLeds.esc.material.color.setHex(slowBlink ? 0x22c55e : 0x14532d);
    }
  }
}

// ============================================================================
// 5. 动画循环与时间推进
// ============================================================================

let lastTimestamp = 0;
let uiThrottleCounter = 0;

function animate(now) {
  _animFrameId = requestAnimationFrame(animate);

  const dt = lastTimestamp ? Math.min((now - lastTimestamp) / 1000, 0.05) : 0.016;
  lastTimestamp = now;

  // 仅在未暂停时自动步进物理时间
  if (!isSimPaused) {
    sim.step(state, dt);
  }

  // M3508 电机输出轴独立旋转
  // 注意：输出轴转速由减速比 3591 / 187 决定
  if (sceneNodes.motorShaft) {
    sceneNodes.motorShaft.rotation.x = state.angle / sim.REDUCTION_RATIO;
  }

  // M3508 内部转子高速旋转
  if (sceneNodes.motorRotor) {
    sceneNodes.motorRotor.rotation.z = state.angle;
  }

  // 更新教学指示灯 (纯示意，不套用真实C620故障灯码)
  updateLeds(now * 0.001);

  // 轨道控制器阻尼推进
  const cameraChanged = controls ? controls.update() : false;

  // Static CAD does not need continuous redraw. Simulation/telemetry keeps ticking,
  // while orbit, drag previews and state changes invalidate the scene explicitly.
  if (renderer && scene && camera && (sceneNeedsRender || cameraChanged || sceneNodes.motorShaft || sceneNodes.motorRotor)) {
    renderer.render(scene, camera);
    sceneNeedsRender = false;
  }

  // 仪表盘高频遥测更新 (~20Hz 节流)
  uiThrottleCounter++;
  if (uiThrottleCounter % 3 === 0) {
    updateTelemetryUI();
  }
}

function onWindowResize() {
  sceneNeedsRender = true;
  if (!dom.canvasContainer || !renderer || !camera) return;
  const w = dom.canvasContainer.clientWidth;
  const h = dom.canvasContainer.clientHeight;
  if (w <= 0 || h <= 0) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  // 保持全景包围盒视角自适应
  fitCameraToScene();
}

// ============================================================================
// 6. 测试钩子暴露与应用入口
// ============================================================================

/**
 * 暴露给端到端无头测试的只读测试钩子（按规范仅保留 getState）
 */
/**
 * Debug helper: count sampled cable points that fall inside another device body.
 * Visual routing check only; not an electrical or mechanical clearance certificate.
 */
function countCableIntersections() {
  return [...sceneNodes.wireGroups].flatMap(([linkId, group]) =>
    (group.userData.intersections || []).map(hit => ({ linkId, ...hit })));
}

window.motorLab = {
  getState: () => structuredClone(state),
  getSceneStatus: () => {
    const rect = renderer?.domElement.getBoundingClientRect();
    camera?.updateMatrixWorld();
    const ports = modelsReady && rect ? Object.entries(PORTS_METADATA).map(([id, meta]) => {
      const p = meta.pos.clone().project(camera);
      return { id, x: rect.left + (p.x + 1) * rect.width / 2,
        y: rect.top + (1 - p.y) * rect.height / 2,
        visible: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z >= -1 && p.z <= 1,
        position: meta.pos.toArray(), normal: meta.normal.toArray(),
        device: meta.deviceId, anchorBasis: meta.anchorBasis,
        verification: meta.verification };
    }) : [];
    const modelBounds = realModels && rect ? [...realModels.boxes].map(([id, box]) => {
      const projected = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        projected.push({ x: rect.left + (p.x + 1) * rect.width / 2,
          y: rect.top + (1 - p.y) * rect.height / 2, z: p.z });
      }
      return { id, projected };
    }) : [];
    const cableIntersections = countCableIntersections();
    return structuredClone({ ready: modelsReady, errors: modelErrors, modelBounds,
      models: realModels?.models || [], ports, cableIntersections,
      cableBoundsCandidates: [...sceneNodes.wireGroups].flatMap(([linkId, group]) =>
        (group.userData.boundsCandidates || []).map(hit => ({ linkId, ...hit }))),
      cableRoutes: [...sceneNodes.wireGroups].map(([linkId, group]) => {
        const curve = group.userData.curve;
        return { linkId, start: curve.getPoint(0).toArray(), end: curve.getPoint(1).toArray(),
          startTangent: curve.getTangent(0).toArray(), endTangent: curve.getTangent(1).toArray() };
      }),
      cameraPosition: camera?.position.toArray(), cameraTarget: controls?.target.toArray() });
  }
};

// 启动应用
async function startApp() {
  const ready = initThreeScene();
  setupUIBindings();
  updateWalkthroughView();
  syncFullUI();

  if (ready) {
    onWindowResize(); // 初次加载也适配全局，不能等用户点复位或改变窗口。
    lastTimestamp = performance.now();
    _animFrameId = requestAnimationFrame(animate);
    dom.portPromptText.textContent = '正在加载真实器件模型，请稍候…';
    realModels = await loadRealModels(scene);
    modelErrors = realModels.errors;
    if (modelErrors.length) {
      dom.portPromptText.textContent = '模型加载失败，请使用本地专用模型服务打开。';
      if (dom.webglFallback) {
        dom.webglFallback.style.display = 'flex';
        dom.webglFallback.textContent = `真实模型加载失败：${modelErrors.join('；')}。请运行 scripts/run_motor_lab_local.py。`;
      }
      gateModelControls();
      return;
    }
    bindRealPorts(PORTS_METADATA, realModels);
    buildPortMeshes(scene);
    setupInteractionEvents();
    modelsReady = true;
    for (const panel of [dom.panelLeft, dom.panelRight]) {
      panel?.querySelectorAll('button, input, select, textarea').forEach(input => { input.disabled = false; });
    }
    dom.portPromptText.textContent = '真实器件已加载：拖动彩色功能端点接线；空白拖动旋转，右键平移，滚轮缩放';
    syncFullUI();
    fitCameraToScene();
  }
}

// 页面 DOM 加载完毕时运行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
