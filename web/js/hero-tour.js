/**
 * 第一章 · 英雄机器人结构导览 (hero-tour.js)
 * 严格遵循只读展示、单一 WebGLRenderer、运行时材质安全克隆与低显存释放原则。
 */

import * as THREE from '../vendor/three/three.module.js';
import { SceneViewer } from './viewer.js';
import { StructureVisibility } from './structure-visibility.js';
import {
  TOUR_MODEL,
  TOUR_MODULES,
  TOUR_DETAILS,
  TOUR_SCENES,
  TOUR_NODE_GUARDS
} from './hero-tour-config.js';

// DOM 元素引用
const $ = (id) => document.getElementById(id);
const canvasContainer = $('tour-canvas');
const titleEl = $('tour-title');
const descEl = $('tour-description');
const keywordsEl = $('tour-keywords');
const statusEl = $('tour-status');
const sceneCounterEl = $('tour-scene-counter');
const stepsNav = $('tour-steps');
const modulesSection = $('tour-modules-section');
const modulesContainer = $('tour-modules');
const detailsContainer = $('tour-details');
const detailNoteEl = $('tour-detail-note');
const revealBtn = $('tour-reveal');
const prevBtn = $('tour-prev');
const nextBtn = $('tour-next');
const resetBtn = $('tour-reset');
const replayBtn = $('tour-replay');
const rotateBtn = $('tour-rotate');
const isolateBtn = $('tour-isolate');
const continueBtn = $('tour-continue');

// 核心运行时状态
let viewer = null;
let robot = null;
let visibility = null;
let isReady = false;
let disposed = false;
let frameId = null;
let resizeObserver = null;
let previousTime = performance.now();

// 节点与层级映射
const nodes = new Map();
const indices = new Map();
const parents = new Map();

// 镜头平滑过渡状态
let isTransitioning = false;
let transitionStartTime = 0;
let transitionDuration = 700;
const transitionStartPos = new THREE.Vector3();
const transitionTargetPos = new THREE.Vector3();
const transitionStartTarget = new THREE.Vector3();
const transitionTargetLookAt = new THREE.Vector3();

// 材质克隆与高亮跟踪 (仅克隆临时副本，不修改源材质)
const activeHighlights = new Map();
let pulseTimer = null;

// 场景与细节状态
let currentSceneIndex = 0;
let selectedDetailId = null;
let revealedModuleCount = 0;
let wantsRotation = false;

// 云台方向箭头叠加层 (仅视觉指示，不驱动节点)
let gimbalArrowsGroup = null;

/** 更新状态栏文本 */
function updateStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

/** 清除当前所有临时高亮并释放克隆材质，恢复源材质 */
function clearHighlights() {
  if (pulseTimer) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
  for (const [mesh, original] of activeHighlights) {
    for (const mat of [mesh.material].flat()) {
      if (mat !== original) {
        mat.dispose();
      }
    }
    mesh.material = original;
  }
  activeHighlights.clear();
}

/** 为指定节点列表施加临时高亮材质 */
function highlightNodes(nodeIndices, highlightColor = 0x0284c7, emissiveColor = 0x006688) {
  clearHighlights();
  if (!nodeIndices || nodeIndices.length === 0) return;

  for (const idx of nodeIndices) {
    const node = nodes.get(idx);
    if (!node) continue;
    node.traverse((child) => {
      if (child.isMesh && !activeHighlights.has(child)) {
        const original = child.material;
        activeHighlights.set(child, original);
        const copies = [original].flat().map((mat) => {
          const copy = mat.clone();
          if (copy.emissive) copy.emissive.setHex(emissiveColor);
          if (copy.color) copy.color.setHex(highlightColor);
          copy.vertexColors = false;
          return copy;
        });
        child.material = Array.isArray(original) ? copies : copies[0];
      }
    });
  }
}

/** 场景1专用：短暂高亮指定模块后自动恢复 */
function pulseHighlight(nodeIndices) {
  if (pulseTimer) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
  highlightNodes(nodeIndices, 0x0284c7, 0x007799);
  pulseTimer = setTimeout(() => {
    clearHighlights();
    pulseTimer = null;
  }, 1800);
}

/** 构建云台 Yaw 与 Pitch 教学方向指示箭头 (独立Overlay，不驱动模型节点) */
function setupGimbalArrows() {
  gimbalArrowsGroup = new THREE.Group();
  gimbalArrowsGroup.name = 'GimbalDirectionArrows';
  gimbalArrowsGroup.visible = false;

  const gimbalNode = nodes.get(389);
  if (!gimbalNode) return;
  gimbalNode.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  gimbalNode.traverse((c) => {
    if (c.isMesh && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      bounds.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
    }
  });

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.42;

  // 1. Yaw 水平旋转环形指示箭头 (X-Z 水平平铺，切线精确导向)
  const yawGroup = new THREE.Group();
  const yawArcLength = Math.PI * 1.5;
  const yawArcGeo = new THREE.TorusGeometry(radius, 0.003, 16, 48, yawArcLength);
  const yawMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.9 });
  const yawArc = new THREE.Mesh(yawArcGeo, yawMat);
  yawArc.rotation.x = Math.PI / 2;

  const coneGeo = new THREE.ConeGeometry(0.008, 0.022, 16);
  const yawConeMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });

  // 弧末端切线方向锥 (θ = yawArcLength)
  const yawCone1 = new THREE.Mesh(coneGeo, yawConeMat);
  const yawEndPos = new THREE.Vector3(radius * Math.cos(yawArcLength), 0, radius * Math.sin(yawArcLength));
  const yawEndTangent = new THREE.Vector3(-Math.sin(yawArcLength), 0, Math.cos(yawArcLength)).normalize();
  yawCone1.position.copy(yawEndPos);
  yawCone1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), yawEndTangent);

  // 弧始端反向切线锥 (θ = 0)
  const yawCone2 = new THREE.Mesh(coneGeo, yawConeMat);
  const yawStartPos = new THREE.Vector3(radius, 0, 0);
  const yawStartTangent = new THREE.Vector3(0, 0, -1);
  yawCone2.position.copy(yawStartPos);
  yawCone2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), yawStartTangent);

  yawGroup.add(yawArc, yawCone1, yawCone2);
  yawGroup.position.set(center.x, bounds.min.y + size.y * 0.16, center.z);

  // 2. Pitch 俯仰方向指示弧形箭头 (垂直Y-Z平面，切线精确导向)
  const pitchGroup = new THREE.Group();
  const pitchRadius = radius * 0.88;
  const pitchArcLength = Math.PI * 0.75;
  const pitchArcGeo = new THREE.TorusGeometry(pitchRadius, 0.003, 16, 48, pitchArcLength);
  const pitchMat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.9 });
  const pitchArc = new THREE.Mesh(pitchArcGeo, pitchMat);
  pitchArc.rotation.y = Math.PI / 2;

  const pitchConeMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });

  // 弧末端切线锥 (φ = pitchArcLength)
  const pitchCone1 = new THREE.Mesh(coneGeo, pitchConeMat);
  const pitchEndPos = new THREE.Vector3(0, pitchRadius * Math.sin(pitchArcLength), -pitchRadius * Math.cos(pitchArcLength));
  const pitchEndTangent = new THREE.Vector3(0, Math.cos(pitchArcLength), Math.sin(pitchArcLength)).normalize();
  pitchCone1.position.copy(pitchEndPos);
  pitchCone1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pitchEndTangent);

  // 弧始端切线锥 (φ = 0)
  const pitchCone2 = new THREE.Mesh(coneGeo, pitchConeMat);
  const pitchStartPos = new THREE.Vector3(0, 0, -pitchRadius);
  const pitchStartTangent = new THREE.Vector3(0, -1, 0);
  pitchCone2.position.copy(pitchStartPos);
  pitchCone2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pitchStartTangent);

  pitchGroup.add(pitchArc, pitchCone1, pitchCone2);
  pitchGroup.position.set(center.x + size.x * 0.34, center.y + size.y * 0.05, center.z);

  gimbalArrowsGroup.add(yawGroup, pitchGroup);
  viewer.scene.add(gimbalArrowsGroup);
}

/** 累积指定节点列表（或整车）当前实际可见 Mesh 的世界包围盒 */
function calculateBounds(nodeIndices) {
  const bounds = new THREE.Box3();
  if (!robot || !visibility) return bounds;
  robot.updateWorldMatrix(true, true);

  if (!nodeIndices || nodeIndices.length === 0) {
    robot.traverse((object) => {
      if (!object.isMesh || !visibility.isVisible(object)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
  } else {
    for (const idx of nodeIndices) {
      const node = nodes.get(idx);
      if (!node) continue;
      node.updateWorldMatrix(true, true);
      node.traverse((object) => {
        if (!object.isMesh || !visibility.isVisible(object)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      });
    }
  }

  // 若目标全不可见，兜底回退至全车可见包围盒
  if (bounds.isEmpty()) {
    robot.traverse((object) => {
      if (!object.isMesh || !visibility.isVisible(object)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
  }
  return bounds;
}

/** 根据目标世界包围盒与视锥角/留白计算相机目标位置与视线中心 */
function computeCameraFit(bounds, cameraConfig) {
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const dirArray = cameraConfig?.direction || [-1, 0.8, 1.25];
  const padding = cameraConfig?.padding || 1.14;
  const direction = new THREE.Vector3(...dirArray).normalize();

  const inverse = new THREE.Matrix4().lookAt(
    center.clone().add(direction),
    center,
    new THREE.Vector3(0, 1, 0)
  ).invert();
  const tanV = Math.tan(THREE.MathUtils.degToRad(viewer.camera.fov / 2));
  const tanH = tanV * viewer.camera.aspect;
  let distance = 0;

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).sub(center).applyMatrix4(inverse);
        distance = Math.max(distance, Math.abs(p.x) / tanH + p.z, Math.abs(p.y) / tanV + p.z);
      }
    }
  }
  distance = Math.max(distance * padding, 0.001);
  const targetPos = center.clone().addScaledVector(direction, distance);
  const targetLookAt = center.clone();

  viewer.camera.near = Math.max(size.length() / 10000, 1e-5);
  viewer.camera.far = Math.max(distance * 25, 10);
  viewer.camera.updateProjectionMatrix();
  viewer.controls.minDistance = distance * 0.1;
  viewer.controls.maxDistance = distance * 15;

  return { targetPos, targetLookAt };
}

/** 触发平滑相机运镜过渡 (支持瞬时切换、清旧阻尼与无污染取消) */
function transitionCameraTo(targetPos, targetLookAt, smooth = true, duration = 700) {
  if (!targetPos || !targetLookAt) return;

  isTransitioning = false;
  viewer.controls.autoRotate = false; // 过渡期间暂停旋转，防止污染运镜插值
  viewer.controls.enableDamping = false;
  viewer.controls.update();
  viewer.controls.enableDamping = true;

  if (!smooth) {
    viewer.camera.position.copy(targetPos);
    viewer.controls.target.copy(targetLookAt);
    viewer.controls.update();
    viewer.controls.autoRotate = wantsRotation;
    return;
  }

  isTransitioning = true;
  transitionStartTime = performance.now();
  transitionDuration = duration;
  transitionStartPos.copy(viewer.camera.position);
  transitionTargetPos.copy(targetPos);
  transitionStartTarget.copy(viewer.controls.target);
  transitionTargetLookAt.copy(targetLookAt);
}

/** 隔离指定节点（支持单节点与多节点组合） */
function isolateComponentNodes(nodeIndices) {
  if (!visibility || !nodeIndices || nodeIndices.length === 0) return;
  if (nodeIndices.length === 1) {
    visibility.isolate(nodeIndices[0]);
    return;
  }
  const snapshot = visibility.isolationSnapshot || visibility.snapshot();
  visibility.restore(snapshot);
  const included = new Set();
  for (const idx of nodeIndices) {
    const node = visibility.node(idx);
    node.traverse((obj) => included.add(obj));
    for (let obj = node; obj; obj = obj.parent) {
      included.add(obj);
      if (obj === visibility.root) break;
    }
  }
  visibility.root.traverse((obj) => {
    obj.visible = included.has(obj);
  });
  visibility.isolationSnapshot = snapshot;
  visibility.isolatedIndex = nodeIndices[0];
}

/** 选中或切换结构细节 */
function selectDetail(id) {
  if (!isReady || disposed) return;
  const scene = TOUR_SCENES[currentSceneIndex];
  if (!scene || !scene.details || !TOUR_DETAILS[scene.details]) return;

  const detail = TOUR_DETAILS[scene.details].find((d) => d.id === id);
  if (!detail) return;

  // 若处于隔离状态，切换选中时先退出前一隔离
  if (visibility && visibility.isolatedIndex !== null) {
    visibility.exitIsolation();
  }

  selectedDetailId = id;

  // 更新细节按钮选中样式与无障碍属性
  const detailButtons = detailsContainer.querySelectorAll('.detail-btn');
  detailButtons.forEach((btn) => {
    const isSelected = btn.dataset.detail === id;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
  });

  // 展示细节教学备注卡片
  if (detailNoteEl) {
    detailNoteEl.textContent = detail.note || '';
    detailNoteEl.style.display = detail.note ? 'block' : 'none';
  }

  // 启用隔离按钮
  isolateBtn.disabled = false;
  isolateBtn.setAttribute('aria-pressed', 'false');
  isolateBtn.textContent = '隔离所选';

  // 突出高亮并平滑对焦细节部件
  highlightNodes(detail.nodeIndices);
  const bounds = calculateBounds(detail.nodeIndices);
  const view = computeCameraFit(bounds, scene.camera);
  if (view) {
    transitionCameraTo(view.targetPos, view.targetLookAt, true);
  }

  updateStatus(`已选中细节：${detail.title} · ${detail.note || ''}`);
}

/** 恢复整车结构与视角 */
function restoreWhole() {
  if (!isReady || disposed) return;
  if (visibility) {
    visibility.showAll();
  }
  if (gimbalArrowsGroup) {
    gimbalArrowsGroup.visible = false;
  }
  selectedDetailId = null;

  // 清除细节选中高亮与卡片
  const detailButtons = detailsContainer.querySelectorAll('.detail-btn');
  detailButtons.forEach((btn) => {
    btn.classList.remove('selected');
    btn.setAttribute('aria-pressed', 'false');
  });
  if (detailNoteEl) detailNoteEl.style.display = 'none';

  // 禁用隔离按钮
  isolateBtn.disabled = true;
  isolateBtn.setAttribute('aria-pressed', 'false');
  isolateBtn.textContent = '隔离所选';

  const scene = TOUR_SCENES[currentSceneIndex];
  if (currentSceneIndex === 5) {
    // 场景5固有强调驱动电机
    highlightNodes([142, 155, 171, 254], 0x0284c7, 0x006688);
  } else if (scene?.module && TOUR_MODULES[scene.module]) {
    // 场景2/3/4恢复全车视角时，保持当前场景核心模块的高亮
    highlightNodes(TOUR_MODULES[scene.module].nodeIndices, 0x0284c7, 0x007799);
  } else {
    clearHighlights();
  }

  // 恢复整车平滑取景
  const bounds = calculateBounds([]);
  const view = computeCameraFit(bounds, scene?.camera || { direction: [-1, 0.8, 1.25], padding: 1.14 });
  if (view) {
    transitionCameraTo(view.targetPos, view.targetLookAt, true);
  }

  updateStatus('已恢复整车视图');
}

/** 渲染侧栏核心结构模块按钮 */
function renderModules(scene) {
  if (currentSceneIndex === 0) {
    if (modulesSection) modulesSection.style.display = 'none';
    modulesContainer.replaceChildren();
    revealBtn.style.display = 'none';
    return;
  }
  if (modulesSection) modulesSection.style.display = 'block';
  modulesContainer.style.display = 'grid';

  const moduleKeys = Object.keys(TOUR_MODULES);
  modulesContainer.replaceChildren();

  moduleKeys.forEach((key) => {
    const mod = TOUR_MODULES[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tour-btn module-btn';
    btn.dataset.module = key;
    btn.textContent = mod.title;

    if (currentSceneIndex === 1) {
      // 场景1：根据揭示进度显示或遮蔽
      const modIndex = moduleKeys.indexOf(key);
      if (modIndex >= revealedModuleCount) {
        btn.classList.add('hidden-module');
        btn.textContent = `（待揭示 ${modIndex + 1}）`;
      }
      btn.onclick = () => {
        if (btn.classList.contains('hidden-module')) return;
        pulseHighlight(mod.nodeIndices);
        updateStatus(`已短暂突出显示：${mod.title}`);
      };
    } else {
      // 其他场景：点击导航或高亮该模块
      if (scene.module === key) {
        btn.classList.add('active');
      }
      btn.onclick = () => {
        const targetSceneIdx = TOUR_SCENES.findIndex((s) => s.module === key);
        if (targetSceneIdx !== -1 && targetSceneIdx !== currentSceneIndex) {
          goTo(targetSceneIdx);
        } else {
          highlightNodes(mod.nodeIndices);
        }
      };
    }
    modulesContainer.append(btn);
  });

  // 场景1揭示按钮状态
  if (currentSceneIndex === 1) {
    revealBtn.style.display = 'inline-block';
    revealBtn.textContent =
      revealedModuleCount < moduleKeys.length
        ? `揭示下一结构 (${revealedModuleCount}/${moduleKeys.length})`
        : '重新逐个揭示';
  } else {
    revealBtn.style.display = 'none';
  }
}

/** 渲染当前场景可交互部件细节 */
function renderDetails(scene) {
  detailsContainer.replaceChildren();
  if (detailNoteEl) detailNoteEl.style.display = 'none';

  if (!scene.details || !TOUR_DETAILS[scene.details]) {
    $('tour-details-section').style.display = 'none';
    return;
  }

  $('tour-details-section').style.display = 'block';
  const detailList = TOUR_DETAILS[scene.details];

  detailList.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-btn';
    btn.dataset.detail = item.id;
    btn.textContent = item.title;
    btn.title = item.note || item.title;
    btn.onclick = () => selectDetail(item.id);
    detailsContainer.append(btn);
  });
}

/** 渲染顶部步骤导航小圆点 */
function renderSteps() {
  stepsNav.replaceChildren();
  TOUR_SCENES.forEach((scene, idx) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'step-pill';
    pill.textContent = String(idx + 1);
    pill.title = scene.title;
    if (idx === currentSceneIndex) pill.classList.add('active');
    else if (idx < currentSceneIndex) pill.classList.add('completed');
    pill.onclick = () => goTo(idx);
    stepsNav.append(pill);
  });
}

/** 切换并进入指定场景 */
async function goTo(index, smooth = true) {
  if (disposed || !robot || !visibility || !Number.isInteger(index) || index < 0 || index >= TOUR_SCENES.length) return;

  // 1. 清理上一场景的临时高亮、计时与隔离，全显所有几何
  clearHighlights();
  if (visibility) {
    visibility.showAll();
  }
  selectedDetailId = null;

  currentSceneIndex = index;
  const scene = TOUR_SCENES[index];

  // 2. 更新底部控制按钮状态
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === TOUR_SCENES.length - 1;
  isolateBtn.disabled = true;
  isolateBtn.setAttribute('aria-pressed', 'false');
  isolateBtn.textContent = '隔离所选';

  // 3. 更新侧栏文本
  sceneCounterEl.textContent = `场景 ${index + 1} / ${TOUR_SCENES.length}`;
  titleEl.textContent = scene.title;
  descEl.textContent = scene.description;

  // 4. 更新关键词标签
  keywordsEl.replaceChildren();
  (scene.keywords || []).forEach((kw) => {
    const span = document.createElement('span');
    span.className = 'keyword-tag';
    span.textContent = kw;
    keywordsEl.append(span);
  });

  // 5. 更新顶部步骤导航
  renderSteps();

  // 6. 场景1揭示计数重置
  if (index === 1) {
    revealedModuleCount = 0;
  }

  // 7. 渲染模块按钮与细节列表
  renderModules(scene);
  renderDetails(scene);
  document.querySelector('.sidebar-body').scrollTop = 0;

  // 8. 场景特定交互逻辑
  wantsRotation = index === 0;
  if (index === 0) {
    // 场景0：开启慢速旋转，供开场展示
    viewer.controls.autoRotate = true;
    viewer.controls.autoRotateSpeed = 1.0;
    rotateBtn.setAttribute('aria-pressed', 'true');
    rotateBtn.classList.add('active');
  } else {
    viewer.controls.autoRotate = false;
    rotateBtn.setAttribute('aria-pressed', 'false');
    rotateBtn.classList.remove('active');
  }

  // 场景2：展示云台 Yaw/Pitch 方向箭头
  if (gimbalArrowsGroup) {
    gimbalArrowsGroup.visible = index === 2;
  }

  // 场景2/3/4：进入时默认高亮当前场景核心模块结构
  if (scene.module && TOUR_MODULES[scene.module]) {
    highlightNodes(TOUR_MODULES[scene.module].nodeIndices, 0x0284c7, 0x007799);
  }

  // 场景5：强调四组驱动电机，并激活链接第二章入口
  if (index === 5) {
    highlightNodes([142, 155, 171, 254], 0x0284c7, 0x006688);
    continueBtn.style.display = 'block';
    continueBtn.classList.add('highlight');
  } else {
    continueBtn.style.display = 'none';
    continueBtn.classList.remove('highlight');
  }

  // 9. 运镜对焦到当前场景目标
  let targetNodeIndices = [];
  if (scene.module && TOUR_MODULES[scene.module]) {
    targetNodeIndices = TOUR_MODULES[scene.module].nodeIndices;
  }
  const bounds = calculateBounds(targetNodeIndices);
  const view = computeCameraFit(bounds, scene.camera);
  if (view) {
    transitionCameraTo(view.targetPos, view.targetLookAt, smooth);
  }

  updateStatus(`场景 ${index + 1}/${TOUR_SCENES.length} · ${scene.title}`);
}

// ================= 事件绑定 =================
prevBtn.onclick = () => {
  if (currentSceneIndex > 0) goTo(currentSceneIndex - 1);
};

nextBtn.onclick = () => {
  if (currentSceneIndex < TOUR_SCENES.length - 1) goTo(currentSceneIndex + 1);
};

resetBtn.onclick = () => {
  restoreWhole();
};

replayBtn.onclick = () => {
  goTo(currentSceneIndex, true);
};

rotateBtn.onclick = () => {
  if (!viewer) return;
  wantsRotation = !wantsRotation;
  viewer.controls.autoRotate = wantsRotation && !isTransitioning;
  const isRotating = wantsRotation;
  rotateBtn.setAttribute('aria-pressed', String(isRotating));
  rotateBtn.classList.toggle('active', isRotating);
  updateStatus(isRotating ? '已开启慢速旋转' : '已暂停慢速旋转');
};

isolateBtn.onclick = () => {
if (!visibility || !selectedDetailId) return;

const scene = TOUR_SCENES[currentSceneIndex];
if (!scene || !scene.details || !TOUR_DETAILS[scene.details]) return;
const detail = TOUR_DETAILS[scene.details].find((d) => d.id === selectedDetailId);
if (!detail) return;

  if (visibility.isolatedIndex !== null) {
    visibility.exitIsolation();
    isolateBtn.setAttribute('aria-pressed', 'false');
    isolateBtn.textContent = '隔离所选';
    updateStatus(`已退出隔离：${detail.title}`);
  } else {
    isolateComponentNodes(detail.nodeIndices);
    isolateBtn.setAttribute('aria-pressed', 'true');
    isolateBtn.textContent = '退出隔离';
    updateStatus(`已隔离所选结构：${detail.title}（点击“退出隔离”恢复）`);
  }
};

revealBtn.onclick = () => {
  const moduleKeys = Object.keys(TOUR_MODULES);
  if (revealedModuleCount >= moduleKeys.length) {
    revealedModuleCount = 0;
  } else {
    revealedModuleCount++;
  }
  renderModules(TOUR_SCENES[currentSceneIndex]);
  if (revealedModuleCount > 0) {
    const revealedKey = moduleKeys[revealedModuleCount - 1];
    pulseHighlight(TOUR_MODULES[revealedKey].nodeIndices);
    updateStatus(`已揭示并高亮：${TOUR_MODULES[revealedKey].title}`);
  }
};

// 键盘快捷键监听
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,button,select,a') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowLeft' && !prevBtn.disabled) {
    e.preventDefault();
    prevBtn.click();
  } else if (e.key === 'ArrowRight' && !nextBtn.disabled) {
    e.preventDefault();
    nextBtn.click();
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    rotateBtn.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    resetBtn.click();
  }
});

// 动画主循环
function frame(time) {
  if (disposed) return;
  const dt = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;

  // 相机运镜平滑插值 (按立方缓动精确过渡)
  if (isTransitioning) {
    const elapsed = performance.now() - transitionStartTime;
    const t = Math.min(elapsed / transitionDuration, 1.0);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    viewer.camera.position.lerpVectors(transitionStartPos, transitionTargetPos, ease);
    viewer.controls.target.lerpVectors(transitionStartTarget, transitionTargetLookAt, ease);
    if (t >= 1.0) {
      viewer.camera.position.copy(transitionTargetPos);
      viewer.controls.target.copy(transitionTargetLookAt);
      isTransitioning = false;
      viewer.controls.autoRotate = wantsRotation;
    }
  }

  viewer.render(null, dt);
  frameId = requestAnimationFrame(frame);
}

// 页面销毁与资源释放监听
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  if (frameId) cancelAnimationFrame(frameId);
  if (pulseTimer) clearTimeout(pulseTimer);
  clearHighlights();

  if (gimbalArrowsGroup) {
    gimbalArrowsGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      for (const mat of [obj.material].flat()) {
        if (mat) mat.dispose();
      }
    });
    viewer.scene.remove(gimbalArrowsGroup);
    gimbalArrowsGroup = null;
  }

  if (resizeObserver) resizeObserver.disconnect();
  viewer?.dispose();
});

// 加载中或失败时禁用操作，避免空模型/空渲染器被按钮访问。
const loadingControls = [prevBtn, nextBtn, resetBtn, replayBtn, rotateBtn, revealBtn, isolateBtn];
loadingControls.forEach(button => { button.disabled = true; });

// ================= 初始化与 Fail-Closed 加载核验 =================
try {
  viewer = new SceneViewer(canvasContainer);

  // 适配投影课室白色/高对比度背景
  viewer.scene.background = new THREE.Color(0xf8fafc);
  viewer.scene.traverse((object) => {
    if (object.type === 'GridHelper') {
      object.material.vertexColors = false;
      object.material.color.setHex(0xdbe3ed);
    }
  });

  // 监听 OrbitControls start 事件：用户拖动或缩放时立刻打断运镜并清旧阻尼
  viewer.controls.addEventListener('start', () => {
    isTransitioning = false;
    wantsRotation = false;
    viewer.controls.autoRotate = false;
    rotateBtn.setAttribute('aria-pressed', 'false');
    rotateBtn.classList.remove('active');
  });

  resizeObserver = new ResizeObserver(() => {
    if (disposed || !canvasContainer.clientWidth || !canvasContainer.clientHeight) return;
    viewer.handleResize();
  });
  resizeObserver.observe(canvasContainer);

  // 启动渲染动画帧
  frameId = requestAnimationFrame(frame);

  // 加载 STEP 对齐版英雄机器人资产
  robot = await viewer.loadHeroRobot(TOUR_MODEL.url);
  if (!robot || disposed) {
    throw new Error('整车模型未返回有效对象');
  }

  // 遍历并索引具名源节点
  robot.traverse((object) => {
    const index = object.userData.cadNodeIndex;
    if (!Number.isInteger(index)) return;
    if (nodes.has(index)) {
      throw new Error(`发现重复源节点索引 #${index}`);
    }
    nodes.set(index, object);
    indices.set(object, index);
  });

  // 建立真实节点父链
  for (const [index, object] of nodes) {
    for (let parent = object.parent; parent && parent !== robot.parent; parent = parent.parent) {
      if (indices.has(parent)) {
        parents.set(index, indices.get(parent));
        break;
      }
    }
  }

  // 加载期 Fail-Closed 核验：TOUR_NODE_GUARDS
  for (const [idx, expectedParent, namePart] of TOUR_NODE_GUARDS) {
    const obj = nodes.get(idx);
    if (!obj) {
      throw new Error(`关键守卫节点缺失: #${idx}`);
    }
    const actualParent = parents.get(idx) ?? null;
    if (actualParent !== expectedParent) {
      throw new Error(`节点层级不匹配: #${idx} 预期父节点 #${expectedParent}，实际为 #${actualParent}`);
    }
    if (obj.userData.cadName !== namePart) {
      throw new Error(`节点名称不匹配: #${idx} 预期包含 '${namePart}'，实际为 '${obj.userData.cadName}'`);
    }
  }

  // 核验 TOUR_MODULES 与 TOUR_DETAILS 中所有索引存在性
  for (const mod of Object.values(TOUR_MODULES)) {
    for (const idx of mod.nodeIndices) {
      if (!nodes.has(idx)) {
        throw new Error(`配置模块包含未识别节点 #${idx}`);
      }
    }
  }
  for (const group of Object.values(TOUR_DETAILS)) {
    for (const item of group) {
      for (const idx of item.nodeIndices) {
        if (!nodes.has(idx)) {
          throw new Error(`配置细节包含未识别节点 #${idx}`);
        }
      }
    }
  }

  // 初始化结构显隐控制器
  visibility = new StructureVisibility(robot, nodes, []);

  // 组装云台独立方向指示箭头
  setupGimbalArrows();

  // 首次进入场景0 (开场介绍)
  await goTo(0, false);

  // 标记初始化完成
  isReady = true;
  for (const button of [nextBtn, resetBtn, replayBtn, rotateBtn, revealBtn]) button.disabled = false;
  updateStatus('整车模型已就绪 · 开场介绍');
} catch (error) {
  isReady = false;
  if (robot) robot.visible = false;
  loadingControls.forEach(button => { button.disabled = true; });
  updateStatus(`加载失败：${error.message}`, true);
  console.error('第一章英雄导览初始化失败:', error);
}

// 暴露只读验收入口
window.heroTour = {
  viewer,
  nodes,
  parents,
  get root() {
    return robot;
  },
  get visibility() {
    return visibility;
  },
  get sceneIndex() {
    return currentSceneIndex;
  },
  get transitioning() {
    return isTransitioning;
  },
  get ready() {
    return isReady;
  },
  goTo,
  selectDetail,
  restoreWhole,
  replay: () => goTo(currentSceneIndex, false),
  toggleRotate: () => rotateBtn.click(),
  isolateSelected: () => isolateBtn.click()
};
