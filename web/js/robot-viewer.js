import * as THREE from '../vendor/three/three.module.js';
import {SceneViewer} from './viewer.js';
import {StructureVisibility} from './structure-visibility.js';
import {pickNode} from './model-editor/selection.js';
import {ASSEMBLY_MODELS, assemblyKind} from './assembly-models.js';

const $ = id => document.getElementById(id);
const viewport = $('canvas');
const selectedAssembly = assemblyKind(new URLSearchParams(location.search).get('assembly'));
const originalReference = selectedAssembly === 'original';
const descriptions = {
  step: 'STEP对齐版：位置经用户确认，#549完整显示。同步带工作面、张紧及整车机械设计未认证。',
  original: '原样参考：默认隐藏 #549 偏置组，可用“全部显示”恢复；原GLB未修改。',
  inferred: '旧推定版：重复平移补偿，未机械核验；保留供历史对照。'
};
document.querySelector('h1').textContent = `英雄机器人 · ${{step: 'STEP对齐版', original: '原样参考', inferred: '旧推定版'}[selectedAssembly]}`;
document.querySelector('.notice').textContent = descriptions[selectedAssembly];
const viewer = new SceneViewer(viewport);
window.viewer = viewer; // 保留原独立观察页的验收入口。
viewer.scene.background = new THREE.Color(0xf4f7fb);
viewer.scene.traverse(object => {
  if (object.type === 'GridHelper') {
    object.material.vertexColors = false;
    object.material.color.setHex(0xdce5ef);
  }
});
const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xe58b16);
selectionBox.material.depthTest = false;
selectionBox.material.depthWrite = false;
selectionBox.visible = false;
viewer.scene.add(selectionBox);
let robot = null, visibility = null, selected = null, disposed = false;
let wireframe = false, pointer = null, frameId = null;
const nodes = new Map(), indices = new Map(), entries = new Map(), parents = new Map();

function status(message) {
  const hidden = visibility ? [...nodes.values()].filter(object => !visibility.isVisible(object)).length : 0;
  $('status').textContent = `整车${robot ? '已加载' : '未加载'} · ${hidden}个源节点当前不可见${visibility?.isolatedIndex !== null && visibility ? ' · 隔离中' : ''} · ${message}`;
}

/** 只累积实际可见Mesh的自身几何，不把隐藏子件重新算进包围盒。 */
function boundsOfVisible(root = robot) {
  const bounds = new THREE.Box3();
  if (!root || !visibility) return bounds;
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (!object.isMesh || !visibility.isVisible(object)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

function fitVisible(root = robot) {
  if (disposed || !robot) return false;
  const bounds = boundsOfVisible(root);
  if (bounds.isEmpty()) {
    status('当前范围没有可见几何；可从结构树显示或点击“全部显示”。');
    return false;
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const direction = new THREE.Vector3(-1, .8, 1.25).normalize();
  const inverse = new THREE.Matrix4().lookAt(center.clone().add(direction), center, new THREE.Vector3(0, 1, 0)).invert();
  const tanV = Math.tan(THREE.MathUtils.degToRad(viewer.camera.fov / 2));
  const tanH = tanV * viewer.camera.aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(center).applyMatrix4(inverse);
    distance = Math.max(distance, Math.abs(p.x) / tanH + p.z, Math.abs(p.y) / tanV + p.z);
  }
  distance = Math.max(distance * 1.12, .001);
  const controls = viewer.controls;
  const autoRotate = controls.autoRotate, damping = controls.enableDamping;
  controls.autoRotate = false;
  controls.enableDamping = false;
  controls.update(); // 消耗拖动遗留阻尼，复位后不再漂移。
  viewer.camera.position.copy(center).addScaledVector(direction, distance);
  viewer.camera.near = Math.max(size.length() / 10000, 1e-6);
  viewer.camera.far = Math.max(distance * 25, 10);
  viewer.camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = distance * .1;
  controls.maxDistance = distance * 15;
  controls.update();
  controls.autoRotate = autoRotate;
  controls.enableDamping = damping;
  return true;
}

function updateUI() {
  if (!visibility) return;
  for (const [index, entry] of entries) {
    const object = nodes.get(index);
    const mode = !object.visible ? 'self-hidden' : visibility.isVisible(object) ? 'visible' : 'ancestor-hidden';
    entry.button.dataset.visibility = mode;
    entry.button.classList.toggle('selected', selected === index);
    entry.button.setAttribute('aria-pressed', String(selected === index));
    entry.badge.textContent = mode === 'visible' ? ' · 可见' : mode === 'self-hidden' ? ' · 自身隐藏' : ' · 祖先隐藏';
  }
  const object = nodes.get(selected);
  $('selection-name').textContent = object ? `#${selected} ${object.userData.cadName || '（未命名）'}` : '未选择';
  $('selection-state').textContent = object
    ? `${object.visible ? visibility.isVisible(object) ? '当前可见' : '自身可见，但被祖先隐藏' : '自身隐藏'}；父组操作影响整个子树。`
    : '单击模型或结构树选中；拖动旋转，滚轮缩放。';
  for (const id of ['hide-selected', 'show-selected', 'isolate-selected']) $(id).disabled = !object;
  $('focus-selected').disabled = !object || boundsOfVisible(object).isEmpty();
  $('parent-selected').disabled = !parents.has(selected);
  $('exit-isolation').disabled = visibility.isolatedIndex === null;
  const bounds = object ? boundsOfVisible(object) : new THREE.Box3();
  selectionBox.visible = !bounds.isEmpty();
  if (selectionBox.visible) selectionBox.box.copy(bounds);
}

function select(index) {
  if (index !== null && !nodes.has(index)) throw new Error(`未找到源节点 #${index}`);
  selected = index;
  for (let parent = parents.get(index); parent !== undefined; parent = parents.get(parent)) {
    const details = entries.get(parent)?.details;
    if (details) details.open = true;
  }
  updateUI();
  entries.get(index)?.button.scrollIntoView({block: 'nearest'});
  status(index === null ? '已清除选择。' : `已选中 #${index}；可隐藏、显示或隔离。`);
}

function buildTree() {
  $('structure-tree').replaceChildren();
  const add = (index, container, depth) => {
    const object = nodes.get(index), children = [...parents].filter(([, parent]) => parent === index).map(([child]) => child);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.nodeIndex = String(index);
    button.title = `#${index} ${object.userData.cadName || '（未命名）'}`;
    const label = document.createElement('span'), badge = document.createElement('span');
    label.textContent = `#${index} ${(object.userData.cadName || '（未命名）').split('/').at(-1)}`;
    button.append(label, badge);
    button.onclick = event => { event.stopPropagation(); select(index); };
    let row = button, details = null;
    if (children.length) {
      details = document.createElement('details');
      details.open = depth < 2;
      const summary = document.createElement('summary');
      summary.append(button);
      const nested = document.createElement('div');
      nested.className = 'tree-nested';
      details.append(summary, nested);
      children.forEach(child => add(child, nested, depth + 1));
      row = details;
    } else button.className = 'tree-leaf';
    entries.set(index, {button, badge, row, details});
    container.append(row);
  };
  for (const [index] of nodes) if (!parents.has(index)) add(index, $('structure-tree'), 0);
}

let searchSnapshot = null;
$('search').oninput = () => {
  const query = $('search').value.trim().toLowerCase();
  if (query && !searchSnapshot) searchSnapshot = new Map([...entries].filter(([, e]) => e.details).map(([i, e]) => [i, e.details.open]));
  const keep = new Set();
  for (const [index, object] of nodes) {
    if (!query || `${index} ${object.userData.cadName}`.toLowerCase().includes(query)) {
      for (let current = index; current !== undefined; current = parents.get(current)) keep.add(current);
    }
  }
  for (const [index, entry] of entries) {
    entry.row.hidden = !keep.has(index);
    if (entry.details && query && keep.has(index)) entry.details.open = true;
    if (entry.details && !query && searchSnapshot) entry.details.open = searchSnapshot.get(index);
  }
  if (!query) searchSnapshot = null;
};

function changeVisibility(action) {
  if (!visibility) return;
  if (action === 'showAll') visibility.showAll();
  else if (action === 'resetDefault') visibility.resetDefault();
  else if (action === 'exitIsolation') visibility.exitIsolation();
  else if (selected !== null) visibility[action](selected);
  else return;
  updateUI();
  status(boundsOfVisible().isEmpty()
    ? '当前没有可见几何；可从结构树显示或点击“全部显示”。视角保持不变。'
    : '显隐已更新，视角保持不变；需要取景时点击“适配可见结构”或“聚焦选中”。');
}
for (const [id, action] of [['hide-selected', 'hide'], ['show-selected', 'show'], ['isolate-selected', 'isolate'], ['exit-isolation', 'exitIsolation'], ['show-all', 'showAll'], ['restore-default', 'resetDefault']]) {
  $(id).onclick = () => changeVisibility(action);
}
$('parent-selected').onclick = () => { if (parents.has(selected)) select(parents.get(selected)); };
$('focus-selected').onclick = () => { if (selected !== null && fitVisible(nodes.get(selected))) status(`已聚焦可见结构 #${selected}。`); };
$('reset').onclick = () => { if (fitVisible()) status('已适配当前可见结构。'); };
$('rotate').onclick = () => {
  viewer.controls.autoRotate = !viewer.controls.autoRotate;
  $('rotate').setAttribute('aria-pressed', String(viewer.controls.autoRotate));
};
$('wire').onclick = () => {
  if (!robot) return;
  wireframe = !wireframe;
  robot.traverse(object => {
    if (object.isMesh) for (const material of [object.material].flat()) material.wireframe = wireframe;
  });
  $('wire').setAttribute('aria-pressed', String(wireframe));
};
window.addEventListener('keydown', event => {
  if (event.target.closest?.('input,textarea,select,button,a,summary,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'h' && selected !== null) { event.preventDefault(); changeVisibility(event.shiftKey ? 'show' : 'hide'); }
  if (key === 'f' && selected !== null) { event.preventDefault(); $('focus-selected').click(); }
  if (key === 'escape') select(null);
});
const canvas = viewer.renderer.domElement;
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary) { if (pointer) pointer.moved = true; return; }
  if (event.button === 0) pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
});
canvas.addEventListener('pointermove', event => {
  if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
});
canvas.addEventListener('pointerup', event => {
  const click = pointer;
  if (click?.id !== event.pointerId) return;
  pointer = null;
  if (!click.moved && robot) select(pickNode(event, canvas, viewer.camera, {root: robot, indices}));
});
canvas.addEventListener('pointercancel', () => { pointer = null; });

const observer = new ResizeObserver(() => {
  if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
  viewer.handleResize();
  if (robot) fitVisible();
});
observer.observe(viewport);
let previous = performance.now();
function frame(time) {
  if (disposed) return;
  const dt = Math.min((time - previous) / 1000, .05);
  previous = time;
  viewer.render(null, dt);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposed = true;
  cancelAnimationFrame(frameId);
  observer.disconnect();
  viewer.dispose();
}, {once: false});

try {
  robot = await viewer.loadHeroRobot(ASSEMBLY_MODELS[selectedAssembly].url);
  if (robot && !disposed) {
    robot.traverse(object => {
      const index = object.userData.cadNodeIndex;
      if (!Number.isInteger(index)) return;
      if (nodes.has(index)) throw new Error(`重复源节点索引 #${index}`);
      nodes.set(index, object);
      indices.set(object, index);
    });
    for (const [index, object] of nodes) {
      for (let parent = object.parent; parent && parent !== robot.parent; parent = parent.parent) {
        if (indices.has(parent)) { parents.set(index, indices.get(parent)); break; }
      }
    }
    const hidden = nodes.get(549);
    if (hidden?.userData.cadName !== 'Yaw轴装配体2.1改' || parents.get(549) !== 543 || parents.get(543) !== 389) throw new Error('装配目标的名称或层级不符，未应用显隐策略');
    visibility = new StructureVisibility(robot, nodes, originalReference ? [549] : []);
    buildTree();
    updateUI();
    for (const id of ['reset', 'show-all', 'restore-default']) $(id).disabled = false;
    fitVisible();
    status(descriptions[selectedAssembly]);
  }
} catch (error) {
  if (!disposed) { $('status').textContent = `加载失败：${error.message}`; console.error(error); }
}
// 仅本地验收状态，不提供文件写入或远端控制接口。
window.robotViewer = {viewer, nodes, indices, parents, assemblyKind: selectedAssembly, get root() { return robot; }, get visibility() { return visibility; }, get selected() { return selected; }, select, fitVisible, boundsOfVisible};
