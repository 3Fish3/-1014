import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGlb } from '../web/js/model-editor/glb-transform-writer.js';
import { sha256, nodePath, createPatch, validatePatch } from '../web/js/model-editor/repair-patch.js';

function buildTestGlb(document) {
  const textEncoder = new TextEncoder();
  const rawJson = textEncoder.encode(JSON.stringify(document));
  const padding = (4 - (rawJson.byteLength % 4)) % 4;
  const jsonChunkData = new Uint8Array(rawJson.byteLength + padding);
  jsonChunkData.set(rawJson, 0);
  for (let i = rawJson.byteLength; i < jsonChunkData.length; i++) {
    jsonChunkData[i] = 0x20;
  }

  const totalSize = 12 + 8 + jsonChunkData.byteLength;
  const fileBytes = new Uint8Array(totalSize);
  const view = new DataView(fileBytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalSize, true);

  view.setUint32(12, jsonChunkData.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  fileBytes.set(jsonChunkData, 20);

  return fileBytes;
}

test('sha256: 能够正确计算 hash hex', async () => {
  const data = new TextEncoder().encode('hello world');
  const hash = await sha256(data);
  // b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
  assert.equal(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});

test('nodePath: 能够正确追溯层级路径，支持同名节点与嵌套关系', () => {
  const document = {
    nodes: [
      { name: 'Root', children: [1, 2] },
      { name: 'SameName', children: [3] },
      { name: 'SameName', children: [4] },
      { name: 'LeafA' },
      { name: 'LeafB' }
    ]
  };

  assert.equal(nodePath(document, 0), '/0:Root');
  assert.equal(nodePath(document, 1), '/0:Root/1:SameName');
  assert.equal(nodePath(document, 2), '/0:Root/2:SameName');
  assert.equal(nodePath(document, 3), '/0:Root/1:SameName/3:LeafA');
  assert.equal(nodePath(document, 4), '/0:Root/2:SameName/4:LeafB');
});

test('nodePath: 检测循环引用与重复父节点', () => {
  // 自循环
  const selfLoopDoc = {
    nodes: [
      { name: 'SelfLoop', children: [0] }
    ]
  };
  assert.throws(() => nodePath(selfLoopDoc, 0), /自循环引用/);

  // 重复父节点
  const multiParentDoc = {
    nodes: [
      { name: 'Parent1', children: [2] },
      { name: 'Parent2', children: [2] },
      { name: 'Child' }
    ]
  };
  assert.throws(() => nodePath(multiParentDoc, 2), /重复父节点/);

  // 环状引用 Parent1 -> Parent2 -> Parent1
  const cycleDoc = {
    nodes: [
      { name: 'A', children: [1] },
      { name: 'B', children: [0] }
    ]
  };
  // 回溯时检测环
  assert.throws(() => nodePath(cycleDoc, 0), /循环引用/);
});

test('createPatch & validatePatch: 完整流程匹配与原子验证', async () => {
  const glbBytes = buildTestGlb({
    asset: { version: '2.0' },
    nodes: [
      { name: 'Chassis', children: [1], translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { name: 'Motor', translation: [10, 20, 30], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    ]
  });

  const parsed = parseGlb(glbBytes);
  const edits = [
    {
      nodeIndex: 1,
      transform: {
        translation: [15, 25, 35],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      },
      note: '修正电机对齐',
      verifiedAgainstCAD: false
    }
  ];

  const patch = await createPatch(parsed, edits, 'hero_clean.glb', '初始位置校准', false);

  assert.equal(patch.schemaVersion, 1);
  assert.equal(patch.source.filename, 'hero_clean.glb');
  assert.equal(patch.source.sizeBytes, glbBytes.byteLength);
  assert.equal(patch.source.sha256, await sha256(glbBytes));
  assert.equal(patch.coordinateSpace, 'local');
  assert.equal(patch.edits.length, 1);
  assert.equal(patch.edits[0].nodePath, '/0:Chassis/1:Motor');
  assert.deepEqual(patch.edits[0].original.translation, [10, 20, 30]);
  assert.deepEqual(patch.edits[0].repaired.translation, [15, 25, 35]);

  // 校验补丁
  const normalized = await validatePatch(parsed, patch);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].nodeIndex, 1);
  assert.deepEqual(normalized[0].transform.translation, [15, 25, 35]);
});

test('validatePatch: 失败场景测试（哈希不匹配、size不匹配、path不匹配、original不匹配、修改scale）', async () => {
  const glbBytes = buildTestGlb({
    asset: { version: '2.0' },
    nodes: [
      { name: 'Root', translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    ]
  });

  const parsed = parseGlb(glbBytes);
  const basePatch = await createPatch(parsed, [{
    nodeIndex: 0,
    transform: { translation: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
  }], 'test.glb');

  // 1. 哈希不匹配
  const badHashPatch = JSON.parse(JSON.stringify(basePatch));
  badHashPatch.source.sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  await assert.rejects(async () => validatePatch(parsed, badHashPatch), /SHA-256 哈希不匹配/);

  // 2. sizeBytes 不匹配
  const badSizePatch = JSON.parse(JSON.stringify(basePatch));
  badSizePatch.source.sizeBytes = 12345;
  await assert.rejects(async () => validatePatch(parsed, badSizePatch), /文件体积不匹配/);

  // 3. 路径不匹配
  const badPathPatch = JSON.parse(JSON.stringify(basePatch));
  badPathPatch.edits[0].nodePath = '/0:WrongName';
  await assert.rejects(async () => validatePatch(parsed, badPathPatch), /路径不匹配/);

  // 4. original 变换与源节点不匹配
  const badOriginalPatch = JSON.parse(JSON.stringify(basePatch));
  badOriginalPatch.edits[0].original.translation = [999, 999, 999];
  await assert.rejects(async () => validatePatch(parsed, badOriginalPatch), /original.translation 与源节点不一致/);

  // 5. 不支持缩放修改 (scale modified)
  const badScalePatch = JSON.parse(JSON.stringify(basePatch));
  badScalePatch.edits[0].repaired.scale = [2, 2, 2];
  await assert.rejects(async () => validatePatch(parsed, badScalePatch), /缩放被修改.*首版不支持缩放编辑/);

  // 缺失、null、字符串和非有限数值不得绕过original比较。
  for(const invalid of [[],[null,0,0],['0',0,0],[NaN,0,0]]){
    const bad=structuredClone(basePatch);bad.edits[0].original.translation=invalid;
    await assert.rejects(()=>validatePatch(parsed,bad),/数组无效/);
  }
  const duplicate=structuredClone(basePatch);duplicate.edits.push(structuredClone(duplicate.edits[0]));
  await assert.rejects(()=>validatePatch(parsed,duplicate),/重复/);
  // 6. 原子性验证：校验失败时原始 parsed 与 patch 均未被破坏或修改
  assert.equal(parsed.document.nodes[0].translation[0], 0);
});
