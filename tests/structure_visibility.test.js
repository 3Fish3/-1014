import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three/three.module.js';
import { StructureVisibility } from '../web/js/structure-visibility.js';

function createTestScene() {
  const root = new THREE.Group();
  const nodes = new Map();

  const group1 = new THREE.Group();
  group1.name = 'Group1';
  nodes.set(1, group1);
  root.add(group1);

  const child1 = new THREE.Mesh();
  child1.name = 'Child1';
  nodes.set(2, child1);
  group1.add(child1);

  const group2 = new THREE.Group();
  group2.name = 'Group2';
  nodes.set(3, group2);
  root.add(group2);

  const child2 = new THREE.Mesh();
  child2.name = 'Child2';
  nodes.set(4, child2);
  group2.add(child2);

  const sibling2 = new THREE.Mesh();
  sibling2.name = 'Sibling2';
  nodes.set(5, sibling2);
  group2.add(sibling2);

  const node549 = new THREE.Mesh();
  node549.name = 'Node549';
  nodes.set(549, node549);
  root.add(node549);

  const child549 = new THREE.Mesh();
  child549.name = 'Child549';
  nodes.set(550, child549);
  node549.add(child549);

  const unmapped = new THREE.Mesh();
  unmapped.name = 'UnmappedSynthetic';
  root.add(unmapped);

  return { root, nodes };
}

test('1. defaultHidden语义：默认549节点visible=false，子件自身visible=true但isVisible为false', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, [549]);

  const n549 = nodes.get(549);
  const c549 = nodes.get(550);

  assert.equal(n549.visible, false);
  assert.equal(c549.visible, true);
  assert.equal(sv.isVisible(c549), false);
  assert.equal(sv.isVisible(n549), false);
});

test('2. hide组语义：隐藏组会影响子件的effective visibility (isVisible)', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  const group1 = nodes.get(1);
  const child1 = nodes.get(2);

  assert.equal(sv.isVisible(child1), true);
  sv.hide(1);
  assert.equal(group1.visible, false);
  assert.equal(child1.visible, true);
  assert.equal(sv.isVisible(child1), false);
});

test('3. show子件语义：打开必要祖先但保留兄弟hidden', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  const group2 = nodes.get(3);
  const child2 = nodes.get(4);
  const sibling2 = nodes.get(5);

  group2.visible = false;
  sibling2.visible = false;
  child2.visible = false;

  sv.show(4);
  assert.equal(group2.visible, true);
  assert.equal(child2.visible, true);
  assert.equal(sibling2.visible, false);
});

test('4. show组语义：显示组保留孩子hidden状态', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  const group1 = nodes.get(1);
  const child1 = nodes.get(2);

  group1.visible = false;
  child1.visible = false;

  sv.show(1);
  assert.equal(group1.visible, true);
  assert.equal(child1.visible, false);
});

test('5. isolate语义与exitIsolation恢复：对子组和自身祖先true，其他false，且exitIsolation准确恢复原完整快照含合成primitive未映射对象', () => {
  const { root, nodes } = createTestScene();
  const unmapped = root.children[root.children.length - 1];
  unmapped.visible = true;

  const sv = new StructureVisibility(root, nodes, []);
  const child2 = nodes.get(4);
  const group2 = nodes.get(3);
  const sibling2 = nodes.get(5);
  child2.visible = false;
  nodes.get(1).visible = false;
  const original = [];
  root.traverse(object => original.push([object, object.visible]));

  sv.isolate(3);
  assert.equal(group2.visible, true);
  assert.equal(child2.visible, true);
  assert.equal(sibling2.visible, true);
  assert.equal(nodes.get(1).visible, false);
  assert.equal(unmapped.visible, false);

  sv.isolate(1);
  assert.equal(nodes.get(1).visible, true);
  assert.equal(group2.visible, false);

  sv.exitIsolation();
  for (const [object, visible] of original) assert.equal(object.visible, visible);
  assert.equal(group2.visible, true);
  assert.equal(child2.visible, false);
  assert.equal(nodes.get(1).visible, false);
  assert.equal(unmapped.visible, true);
  assert.equal(sv.isolatedIndex, null);
});

test('6. hide/show在isolate时自动先exit再操作', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  sv.isolate(3);
  assert.notEqual(sv.isolatedIndex, null);

  sv.hide(2);
  assert.equal(sv.isolatedIndex, null);
  assert.equal(nodes.get(2).visible, false);

  sv.isolate(3);
  assert.notEqual(sv.isolatedIndex, null);

  sv.show(2);
  assert.equal(sv.isolatedIndex, null);
  assert.equal(nodes.get(2).visible, true);
});

test('7. showAll语义：包含549在内的所有节点设为visible=true', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, [549]);

  assert.equal(nodes.get(549).visible, false);
  sv.showAll();
  assert.equal(nodes.get(549).visible, true);
  assert.equal(root.children.every(c => c.visible), true);
  assert.equal(sv.isolatedIndex, null);
  assert.equal(sv.isolationSnapshot, null);
});

test('8. resetDefault语义：恢复到初态（含defaultHidden）', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, [549]);

  sv.showAll();
  assert.equal(nodes.get(549).visible, true);

  sv.resetDefault();
  assert.equal(nodes.get(549).visible, false);
  assert.equal(sv.isolatedIndex, null);
  assert.equal(sv.isolationSnapshot, null);
});

test('9. 无效index方法拒绝且不吞掉当前isolation snapshot', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  sv.isolate(3);
  const snapshotBefore = sv.isolationSnapshot;
  assert.notEqual(snapshotBefore, null);

  assert.throws(() => sv.hide(99999), /未找到源节点/);
  assert.equal(sv.isolatedIndex, 3);
  assert.equal(sv.isolationSnapshot, snapshotBefore);

  assert.throws(() => sv.show(99999), /未找到源节点/);
  assert.equal(sv.isolatedIndex, 3);
  assert.equal(sv.isolationSnapshot, snapshotBefore);

  assert.throws(() => sv.isolate(99999), /未找到源节点/);
  assert.equal(sv.isolatedIndex, 3);
  assert.equal(sv.isolationSnapshot, snapshotBefore);
});

test('10. 相同方法重复调用安全（幂等/无错）', () => {
  const { root, nodes } = createTestScene();
  const sv = new StructureVisibility(root, nodes, []);

  sv.hide(2);
  sv.hide(2);
  assert.equal(nodes.get(2).visible, false);

  sv.show(2);
  sv.show(2);
  assert.equal(nodes.get(2).visible, true);

  sv.isolate(3);
  sv.isolate(3);
  assert.equal(nodes.get(3).visible, true);

  sv.showAll();
  sv.showAll();
  assert.equal(nodes.get(3).visible, true);

  sv.resetDefault();
  sv.resetDefault();
  assert.equal(sv.isolatedIndex, null);
});
