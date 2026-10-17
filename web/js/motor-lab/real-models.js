import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';

// Local research preview: source meshes are never edited or publicly repackaged.
const SCALE = 20; // One shared display scale for every metric source model.
const SPECS = [
  { id: 'tb47d', position: [-2.7, 0, -1.1], rotation: [0, Math.PI, 0] },
  // Rack lies horizontally around the neck below the battery lid (manual physical p13).
  // The common metric scale is preserved; height is a visual placement, not a tolerance certificate.
  { id: 'battery-rack', position: [-2.7, 0, -1.1], rotation: [-Math.PI / 2, 0, 0] },
  // SHELL_UP is on source -Z; rotate that normal towards world +Y.
  { id: 'center-board2', position: [-0.8, 0, 0.3], rotation: [Math.PI / 2, 0, 0] },
  { id: 'c-board', position: [-2.2, 0, 1.5] },
  { id: 'c620', position: [0.7, 0, 0.6], rotation: [-Math.PI / 2, 0, 0], body: ['7', '8'] },
  { id: 'm3508', position: [2.3, 0, -0.1], body: ['1_1', '16', '17', '23'] }
];
const HIDDEN_M3508_LEADS = new Set(['15', '001', '002',
  '20', '19', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017']);
const HIDDEN_C620_LEADS = new Set(['10', '14', '015', '016', '1', '017', '022', '019', '020', '021']);

export async function loadRealModels(scene) {
  const loader = new GLTFLoader();
  const roots = new Map();
  const boxes = new Map();
  const labels = new Map();
  const models = [];
  const errors = [];
  await Promise.all(SPECS.map(async spec => {
    const source = `/motor-lab-models/${spec.id}.glb`;
    try {
      const gltf = await loader.loadAsync(source);
      const root = gltf.scene;
      let count = 0;
      root.traverse(object => {
        if (!object.isMesh) return;
        count++;
        object.castShadow = true;
        object.receiveShadow = true;
        // Replace only the identified trailing lead meshes with interactive cables.
        if (spec.id === 'c620' && HIDDEN_C620_LEADS.has(object.name)) object.visible = false;
        if (spec.id === 'm3508' && HIDDEN_M3508_LEADS.has(object.name)) object.visible = false;
      });
      if (!count) throw new Error('模型没有可显示网格');
      const group = new THREE.Group();
      group.name = `real-${spec.id}`;
      group.add(root);
      root.scale.setScalar(SCALE);
      if (spec.rotation) root.rotation.set(...spec.rotation);
      root.updateMatrixWorld(true);
      const bodyBox = new THREE.Box3();
      root.traverse(object => {
        if (object.isMesh && object.visible && (!spec.body || spec.body.includes(object.name))) {
          bodyBox.expandByObject(object);
        }
      });
      if (bodyBox.isEmpty()) throw new Error('无法定位主体网格');
      const center = bodyBox.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -bodyBox.min.y + 0.08, -center.z);
      group.position.set(...spec.position);
      scene.add(group);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      root.traverse(object => {
        if (object.isMesh && object.visible && (!spec.body || spec.body.includes(object.name))) box.expandByObject(object);
      });
      roots.set(spec.id, group);
      boxes.set(spec.id, box);
      const names = { tb47d: 'TB47D · 24V SIM', 'battery-rack': '电池架 · 颈部安装展示',
        'center-board2': '电调中心板2', 'c-board': 'C型开发板', c620: 'C620电调', m3508: 'M3508电机' };
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(names[spec.id], 256, 48);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      label.position.copy(box.getCenter(new THREE.Vector3()));
      label.position.y = box.max.y + .18;
      label.scale.set(1.1, .21, 1);
      scene.add(label);
      labels.set(spec.id, label);
      models.push({ id: spec.id, loaded: true, meshCount: count, source });
    } catch (error) {
      errors.push(`${spec.id}: ${error.message}`);
      models.push({ id: spec.id, loaded: false, meshCount: 0, source });
    }
    return spec.id;
  }));
  const battery = roots.get('tb47d');
  const rack = roots.get('battery-rack');
  if (battery && rack) {
    // Manual physical p13: collar underneath the lid, not below the cell body.
    // Both source models remain at identical scale. Nominal CAD check of all
    // 15 rack shapes at this pose found zero positive-volume overlap.
    rack.position.copy(battery.position);
    rack.children[0].position.copy(battery.children[0].position)
      .add(new THREE.Vector3(-.0005, .012, -.00695).multiplyScalar(SCALE));
    rack.updateMatrixWorld(true);
    const rackBox = new THREE.Box3().setFromObject(rack);
    boxes.set('battery-rack', rackBox);
    const label = labels.get('battery-rack');
    label.position.copy(rackBox.getCenter(new THREE.Vector3()));
    label.position.y = rackBox.max.y + .12;
  }
  return { roots, boxes, labels, models, errors, commonDisplayScale: SCALE };
}

// These are visible function-level connection markers, NOT certified mating planes.
// Exact pin mapping and connector variants remain unverified; assembly pose is
// checked against the installation illustration and nominal BRep overlap only.
export function bindRealPorts(metadata, real) {
  // Named socket bounding faces are a visual attachment estimate, not a
  // pin-level mating certificate. Normal vectors are transformed from source
  // model coordinates, so flipping a device also flips its cable exit.
  function sourceAnchor(device, xyz, direction, basis) {
    const root = real.roots.get(device).children[0];
    root.updateMatrixWorld(true);
    return { device, point: root.localToWorld(new THREE.Vector3(...xyz)),
      normal: new THREE.Vector3(...direction).transformDirection(root.matrixWorld), basis };
  }
  function socketFace(device, name, direction, basis) {
    const mesh = real.roots.get(device).getObjectByName(name);
    if (!mesh?.isMesh) throw new Error(`找不到接口几何 ${device}/${name}`);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const point = box.getCenter(new THREE.Vector3());
    const normal = new THREE.Vector3(...direction);
    for (const axis of ['x', 'y', 'z']) {
      if (normal[axis] > .5) point[axis] = box.max[axis];
      if (normal[axis] < -.5) point[axis] = box.min[axis];
    }
    mesh.updateWorldMatrix(true, false);
    return { device, point: mesh.localToWorld(point),
      normal: normal.transformDirection(mesh.matrixWorld), basis: `${name}: ${basis}` };
  }
  const rackEnd = [...real.roots.get('battery-rack').children[0].children]
    .find(object => object.isMesh)?.name;
  const entries = {
    'supply-xt60': socketFace('battery-rack', rackEnd, [0, 1, 0],
      '端面组件外侧候选；取电端口身份尚未核实，不认证XT60配合面'),
    'center-xt60': socketFace('center-board2', 'XT60____-8______-UL-21156-1-SOL', [0, 1, 0],
      '原CAD接触圆柱轴经装配变换/坐标映射后为源+Y，当前朝世界+Z端面；不是上盖'),
    'center-xt30-a': socketFace('center-board2', 'XT30UPB-F_SJ', [0, 0, -1], '上表面开口候选'),
    'center-xt30-b': socketFace('center-board2', 'XT30UPB-F_SJ001', [0, 0, -1], '上表面开口候选'),
    'ctrl-xt30': sourceAnchor('c-board', [.01317, .00815, .0257], [0, 1, 0],
      '上视丝印24V输入＋原CAD端口区域顶面；精确配合平面待核'),
    'ctrl-can': sourceAnchor('c-board', [-.020502, -.000375, -.003165], [-1, 0, 0],
      '手册物理页5 CAN1标识＋CAD负X侧第一个2-pin区域外侧面'),
    'center-can-ctrl': socketFace('center-board2', 'BM02B-GHS-TBT', [0, 0, -1], '顶部2-pin插座开口候选，非4-pin'),
    'center-can-esc': socketFace('center-board2', 'SM02B-GHS-TB001', [-1, 0, 0], '负X侧卧式2-pin插座外侧面'),
    'esc-pwr': socketFace('c620', '6', [-1, 0, 0], '原长供电线出线护口外端面'),
    'esc-can': socketFace('c620', '002', [-1, 0, 0], '2-pin座外端面，区别于001三芯PWM座'),
    'esc-phases': sourceAnchor('c620', [.12334, -.00016, -.00076], [1, 0, 0],
      '原三相线出线轴与壳体7正X边缘的功能标记，非新造实际插座'),
    'esc-data': socketFace('c620', '2', [1, 0, 0], '7-pin长座正X外端面候选'),
    'motor-phases': sourceAnchor('m3508', [-.0027, -.02145, -.0284], [0, 0, 1],
      '隐藏原三相线15近机身端与圆筒外沿；外部线头用功能示意'),
    'motor-data': socketFace('m3508', '__-__20', [1, 0, 0], '机身数据座外侧候选，逐针未核实')
  };
  for (const [id, anchor] of Object.entries(entries)) {
    // Recessed upward sockets are reached through openings in the upper cover.
    // Mark the cover opening plane rather than starting the visual wire below it.
    const body = real.boxes.get(anchor.device);
    if (anchor.device === 'center-board2' && anchor.normal.y > .99 && anchor.point.y < body.max.y) {
      anchor.point.y = body.max.y + .005;
      anchor.basis += '；凹入插座沿轴延至上盖开口高度（配合面未认证）';
    }
    if (id === 'center-xt60' && anchor.point.z < body.max.z) {
      anchor.point.z = body.max.z + .005;
      anchor.basis += '；内置座沿同轴延至外壳出口作功能标记，不是原厂插头模型';
    }
    metadata[id].pos.copy(anchor.point);
    metadata[id].normal.copy(anchor.normal);
    metadata[id].deviceId = anchor.device;
    metadata[id].anchorBasis = anchor.basis;
    metadata[id].verification = 'function_level_unverified';
  }
  metadata['supply-xt60'].name = 'TB47D兼容电池架供电输出 · 24V SIM';
}
