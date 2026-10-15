import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGlb} from '../web/js/model-editor/glb-transform-writer.js';
import {TOUR_MODEL, TOUR_MODULES, TOUR_DETAILS, TOUR_SCENES, TOUR_NODE_GUARDS} from '../web/js/hero-tour-config.js';

const bytes = readFileSync('web/models/hero_robot_step_aligned.glb');
const document = parseGlb(bytes).document;
const evidence = JSON.parse(readFileSync('docs/hero-tour/node-map.json'));
const parents = new Map();
document.nodes.forEach((node, index) => (node.children || []).forEach(child => parents.set(child, index)));

test('第一章不改变四份已有GLB和两份装配补丁', () => {
  const frozen = {
    'web/models/diff_car_teaching.glb': 'bf561d777edffc595cffcc40b500aa0a646b56145471129e91ae6b410a5f82e7',
    'web/models/hero_robot_clean.glb': 'f2eefd1ee718e8c0bebd7490968d5b62b4f99a6b640e57905bb3ef940c374baf',
    'web/models/hero_robot_inferred.glb': 'd85a76bd7a2835362efc5839d71e837dfc34fb9b7470d22fd2e03bc7d95337ff',
    'web/models/hero_robot_step_aligned.glb': 'cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af',
    'web/models/repairs/yaw-offset-inferred.json': '5f9d7f037466648813e0f1c7e7f9bdafaea5fbe7f17195383e3052f072181ed9',
    'web/models/repairs/yaw-step-aligned.json': 'c6be03342b19f2724a364d717ac5e96d0e1dedcfbb3111c92d8d144674dbfcda'
  };
  for (const [path, digest] of Object.entries(frozen)) {
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), digest, path);
  }
});

test('第一章映射绑定冻结STEP资产与真实父链，不套用其他模型', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af');
  assert.equal(TOUR_MODEL.sha256, evidence.sha256);
  for (const [index, parent, name] of TOUR_NODE_GUARDS) {
    assert.equal(parents.get(index) ?? null, parent);
    assert.equal(document.nodes[index].name, name);
  }
  for (const row of evidence.nodes) {
    assert.equal(document.nodes[row.index].name, row.name);
    assert.equal(parents.get(row.index) ?? null, row.parent);
    assert.deepEqual(document.nodes[row.index].children || [], row.children);
    const path = [];
    for (let i = row.index; i !== undefined; i = parents.get(i)) path.unshift(i);
    assert.deepEqual(path, row.path);
  }
});

test('发射系统跨拨弹与云台子装配，云台与发射模块允许重叠', () => {
  assert.deepEqual(TOUR_MODULES.launcher.nodeIndices, [2, 394]);
  assert.deepEqual(TOUR_MODULES.gimbal.nodeIndices, [389]);
  assert.equal(parents.get(394), 390);
  assert.equal(parents.get(390), 389);
  assert.deepEqual(TOUR_MODULES.chassis.nodeIndices, [135]);
});

test('四轮组及驱动电机一一对应，教学细节仅引用有几何的已记录节点', () => {
  for (const [motor, group, wheel] of [[142,139,145],[155,152,158],[171,166,175],[254,248,260]]) {
    assert.equal(parents.get(motor), group);
    assert.equal(parents.get(wheel), group);
    assert.equal(parents.get(group), 137);
  }
  const known = new Map(evidence.nodes.map(row => [row.index, row]));
  for (const list of Object.values(TOUR_DETAILS)) {
    assert.equal(new Set(list.map(detail => detail.id)).size, list.length);
    for (const detail of list) for (const index of detail.nodeIndices) {
      assert.ok(known.get(index)?.meshNodeCount > 0, `教学节点 #${index} 无可核对几何`);
    }
  }
});

test('六场景遵循整车、云台、底盘、发射、引出电机的讲师顺序', () => {
  assert.deepEqual(TOUR_SCENES.map(scene => scene.id), ['opening','whole','gimbal','chassis','launcher','motors']);
  for (const scene of TOUR_SCENES) {
    assert.ok(scene.title && scene.description);
    assert.ok(scene.camera.padding > 1);
    assert.equal(scene.camera.direction.length, 3);
    assert.ok(scene.camera.direction.every(Number.isFinite));
    if (scene.module) assert.ok(TOUR_MODULES[scene.module]);
    if (scene.details) assert.ok(TOUR_DETAILS[scene.details]);
  }
});
