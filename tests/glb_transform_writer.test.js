import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three/three.module.js';
import { parseGlb, writeGlbTransforms, getNodeTransform } from '../web/js/model-editor/glb-transform-writer.js';

// Helper: build minimal GLB binary
function buildMinimalGlb({
  document = { asset: { version: '2.0' }, nodes: [{ name: 'Root' }] },
  customChunks = [],
  corruptMagic = false,
  corruptVersion = false,
  corruptTotalLength = null,
  corruptChunkOffset = false,
  corruptJsonPadding = false
} = {}) {
  const textEncoder = new TextEncoder();
  const rawJson = textEncoder.encode(JSON.stringify(document));
  const padding = corruptJsonPadding ? 1 : (4 - (rawJson.byteLength % 4)) % 4;
  const jsonChunkData = new Uint8Array(rawJson.byteLength + padding);
  jsonChunkData.set(rawJson, 0);
  for (let i = rawJson.byteLength; i < jsonChunkData.length; i++) {
    jsonChunkData[i] = 0x20;
  }

  let totalSize = 12 + 8 + jsonChunkData.byteLength;
  for (const c of customChunks) {
    totalSize += 8 + c.data.byteLength;
  }

  const fileBytes = new Uint8Array(totalSize);
  const view = new DataView(fileBytes.buffer);

  view.setUint32(0, corruptMagic ? 0x12345678 : 0x46546c67, true);
  view.setUint32(4, corruptVersion ? 1 : 2, true);
  view.setUint32(8, corruptTotalLength !== null ? corruptTotalLength : totalSize, true);

  let offset = 12;
  view.setUint32(offset, jsonChunkData.byteLength, true);
  view.setUint32(offset + 4, 0x4e4f534a, true); // JSON
  offset += 8;
  fileBytes.set(jsonChunkData, offset);
  offset += jsonChunkData.byteLength;

  for (const c of customChunks) {
    const chunkLen = corruptChunkOffset ? c.data.byteLength + 100 : c.data.byteLength;
    view.setUint32(offset, chunkLen, true);
    view.setUint32(offset + 4, c.type, true);
    offset += 8;
    fileBytes.set(c.data, offset);
    offset += c.data.byteLength;
  }

  return fileBytes;
}

test('parseGlb: 拒绝未对齐chunk、重复BIN及不支持的asset版本',()=>{
  const unaligned=buildMinimalGlb({customChunks:[{type:0x12345678,data:new Uint8Array(3)}]});
  assert.throws(()=>parseGlb(unaligned),/4字节对齐/);
  assert.throws(()=>parseGlb(buildMinimalGlb({customChunks:[{type:0x004e4942,data:new Uint8Array(4)},{type:0x004e4942,data:new Uint8Array(4)}]})),/重复BIN/);
  assert.throws(()=>parseGlb(buildMinimalGlb({document:{asset:{version:'1.0'},nodes:[]}})),/version 2.0/);
});

test('getNodeTransform: 拒绝matrix和TRS共存及非仿射矩阵',()=>{
  const matrix=new THREE.Matrix4().elements;
  assert.throws(()=>getNodeTransform({matrix,translation:[0,0,0]}),/同时存在/);
  const projective=[...matrix];projective[3]=.1;
  assert.throws(()=>getNodeTransform({matrix:projective}),/仿射/);
});

test('parseGlb: 正常解析合法 GLB 并验证返回值结构', () => {
  const glbBytes = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [
        { name: 'Node0', translation: [1, 2, 3] },
        { name: 'Node1', matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 4,5,6,1] }
      ]
    }
  });

  const parsed = parseGlb(glbBytes);
  assert.ok(parsed.document);
  assert.equal(parsed.document.nodes.length, 2);
  assert.equal(parsed.chunks.length, 1);
  assert.equal(parsed.chunks[0].type, 0x4e4f534a);
  assert.ok(parsed.bytes instanceof Uint8Array);
  assert.equal(parsed.bytes.byteLength, glbBytes.byteLength);
});

test('parseGlb: 坏头与边界防护（magic、version、总长、越界 chunk、多重 JSON、缺少 nodes）', () => {
  // 长度小于 12
  assert.throws(() => parseGlb(new Uint8Array(10)), /长度不足/);

  // 坏 magic
  const badMagic = buildMinimalGlb({ corruptMagic: true });
  assert.throws(() => parseGlb(badMagic), /GLB magic 错误/);

  // 坏 version
  const badVersion = buildMinimalGlb({ corruptVersion: true });
  assert.throws(() => parseGlb(badVersion), /仅支持 GLB version 2/);

  // 坏总长
  const badLength = buildMinimalGlb({ corruptTotalLength: 99999 });
  assert.throws(() => parseGlb(badLength), /GLB 文件长度不匹配/);

  // 越界 chunk 长度
  const binData = new Uint8Array([1, 2, 3, 4]);
  const badChunkOffset = buildMinimalGlb({
    customChunks: [{ type: 0x004e4942, data: binData }],
    corruptChunkOffset: true
  });
  assert.throws(() => parseGlb(badChunkOffset), /超出文件总长边界/);

  // 首个 chunk 不是 JSON
  const notJsonFirst = new Uint8Array(24);
  const njView = new DataView(notJsonFirst.buffer);
  njView.setUint32(0, 0x46546c67, true);
  njView.setUint32(4, 2, true);
  njView.setUint32(8, 24, true);
  njView.setUint32(12, 4, true);
  njView.setUint32(16, 0x004e4942, true); // BIN
  assert.throws(() => parseGlb(notJsonFirst), /首个 chunk 必须为 JSON/);

  // 缺少 nodes 数组
  const noNodesGlb = buildMinimalGlb({ document: { asset: { version: '2.0' } } });
  assert.throws(() => parseGlb(noNodesGlb), /缺少有效的 nodes 数组/);
});

test('parseGlb: 拒绝外部 buffer URI、外部 image URI 及不支持的 extensionsRequired', () => {
  // 外部 buffer
  const extBufferGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [],
      buffers: [{ uri: 'http://example.com/buffer.bin', byteLength: 100 }]
    }
  });
  assert.throws(() => parseGlb(extBufferGlb), /包含外部 buffer/);

  // 外部 image
  const extImgGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [],
      images: [{ uri: 'image.png' }]
    }
  });
  assert.throws(() => parseGlb(extImgGlb), /包含外部 image/);

  // 允许 data: URI 的 image
  const dataImgGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [],
      images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }]
    }
  });
  assert.doesNotThrow(() => parseGlb(dataImgGlb));

  // extensionsRequired: 允许 KHR_materials_unlit
  const unlitGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [],
      extensionsRequired: ['KHR_materials_unlit']
    }
  });
  assert.doesNotThrow(() => parseGlb(unlitGlb));

  // extensionsRequired: 包含不支持的扩展如 KHR_draco_mesh_compression
  const unsupportedExtGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [],
      extensionsRequired: ['KHR_materials_unlit', 'KHR_draco_mesh_compression']
    }
  });
  assert.throws(() => parseGlb(unsupportedExtGlb), /包含不支持的必需扩展 extensionsRequired/);
});

test('getNodeTransform: TRS 提取与默认值补全', () => {
  const nodeEmpty = {};
  const t = getNodeTransform(nodeEmpty);
  assert.deepEqual(t.translation, [0, 0, 0]);
  assert.deepEqual(t.rotation, [0, 0, 0, 1]);
  assert.deepEqual(t.scale, [1, 1, 1]);

  const nodeTRS = {
    translation: [10, 20, 30],
    rotation: [0, 0, 0, 1],
    scale: [2, 2, 2]
  };
  const t2 = getNodeTransform(nodeTRS);
  assert.deepEqual(t2.translation, [10, 20, 30]);
  assert.deepEqual(t2.scale, [2, 2, 2]);
});

test('getNodeTransform: 拒绝全零四元数、非归一化四元数、scale为0', () => {
  // 全零四元数
  assert.throws(() => getNodeTransform({ rotation: [0, 0, 0, 0] }), /未归一化或为全零四元数/);

  // 未归一化四元数
  assert.throws(() => getNodeTransform({ rotation: [1, 1, 1, 1] }), /未归一化/);

  // scale 为 0
  assert.throws(() => getNodeTransform({ scale: [1, 0, 1] }), /scale\[1\] 不能为零/);
});

test('getNodeTransform: matrix 分解与剪切(shear)拒绝', () => {
  // 合法正交旋转+平移+缩放
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion(0, 0, 0, 1), new THREE.Vector3(2, 2, 2));
  const nodeValid = { matrix: Array.from(m.elements) };
  const t = getNodeTransform(nodeValid);
  assert.deepEqual(t.translation, [1, 2, 3]);
  assert.deepEqual(t.scale, [2, 2, 2]);

  // 剪切矩阵 (Non-orthogonal matrix containing shear)
  const shearElements = [
    1, 0, 0, 0,
    1, 1, 0, 0, // shear on Y from X
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  assert.throws(() => getNodeTransform({ matrix: shearElements }), /剪切\(shear\)/);
});

test('writeGlbTransforms: 原样保留 BIN chunk 字节及未知合法 chunk 逐字节一致', () => {
  const binPayload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
  const unknownChunkType = 0x12345678;
  const unknownPayload = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);

  const originalGlb = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [
        { name: 'TargetNode', translation: [0, 0, 0] },
        { name: 'UntouchedNode', translation: [1, 1, 1], mesh: 0 }
      ],
      meshes: [{ name: 'TestMesh' }],
      materials: [{ name: 'TestMaterial' }]
    },
    customChunks: [
      { type: 0x004e4942, data: binPayload }, // BIN chunk
      { type: unknownChunkType, data: unknownPayload } // Unknown chunk
    ]
  });

  const parsed = parseGlb(originalGlb);
  assert.equal(parsed.chunks.length, 3);

  const edits = [{
    nodeIndex: 0,
    transform: {
      translation: [100, 200, 300],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    }
  }];

  const newGlb = writeGlbTransforms(parsed, edits);
  const reParsed = parseGlb(newGlb);

  // 验证 chunk 结构与逐字节一致
  assert.equal(reParsed.chunks.length, 3);
  assert.equal(reParsed.chunks[1].type, 0x004e4942);
  assert.deepEqual(Array.from(reParsed.chunks[1].data), Array.from(binPayload));
  assert.equal(reParsed.chunks[2].type, unknownChunkType);
  assert.deepEqual(Array.from(reParsed.chunks[2].data), Array.from(unknownPayload));

  // 验证未修改的节点与非目标字段不变
  assert.deepEqual(reParsed.document.nodes[1], { name: 'UntouchedNode', translation: [1, 1, 1], mesh: 0 });
  assert.deepEqual(reParsed.document.meshes, [{ name: 'TestMesh' }]);
  assert.deepEqual(reParsed.document.materials, [{ name: 'TestMaterial' }]);

  // 验证目标节点已更新
  assert.deepEqual(reParsed.document.nodes[0].translation, [100, 200, 300]);
});

test('writeGlbTransforms: matrix 节点更新与 TRS 节点更新互斥', () => {
  // 原节点带 matrix
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(1, 1, 1), new THREE.Quaternion(0, 0, 0, 1), new THREE.Vector3(1, 1, 1));

  const glbBytes = buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [
        { name: 'MatrixNode', matrix: Array.from(m.elements) },
        { name: 'TrsNode', translation: [5, 5, 5] }
      ]
    }
  });

  const parsed = parseGlb(glbBytes);
  const edits = [
    {
      nodeIndex: 0,
      transform: { translation: [10, 20, 30], rotation: [0, 0, 0, 1], scale: [2, 2, 2] }
    },
    {
      nodeIndex: 1,
      transform: { translation: [50, 60, 70], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    }
  ];

  const updatedBytes = writeGlbTransforms(parsed, edits);
  const reParsed = parseGlb(updatedBytes);

  const updatedMatrixNode = reParsed.document.nodes[0];
  assert.ok(updatedMatrixNode.matrix !== undefined);
  assert.equal(updatedMatrixNode.translation, undefined);
  assert.equal(updatedMatrixNode.rotation, undefined);
  assert.equal(updatedMatrixNode.scale, undefined);

  // 检验更新后的 matrix 内容
  const t0 = getNodeTransform(updatedMatrixNode);
  assert.deepEqual(t0.translation, [10, 20, 30]);
  assert.deepEqual(t0.scale, [2, 2, 2]);

  const updatedTrsNode = reParsed.document.nodes[1];
  assert.equal(updatedTrsNode.matrix, undefined);
  assert.deepEqual(updatedTrsNode.translation, [50, 60, 70]);
  assert.deepEqual(updatedTrsNode.scale, [1, 1, 1]);
});

test('writeGlbTransforms: 拒绝重复索引与非法 nodeIndex', () => {
  const parsed = parseGlb(buildMinimalGlb({
    document: {
      asset: { version: '2.0' },
      nodes: [{ name: 'A' }, { name: 'B' }]
    }
  }));

  // 重复索引
  assert.throws(() => {
    writeGlbTransforms(parsed, [
      { nodeIndex: 0, transform: { translation: [1, 1, 1], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
      { nodeIndex: 0, transform: { translation: [2, 2, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }
    ]);
  }, /重复的 nodeIndex/);

  // 越界索引
  assert.throws(() => {
    writeGlbTransforms(parsed, [
      { nodeIndex: 99, transform: { translation: [1, 1, 1], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }
    ]);
  }, /无效的 nodeIndex/);
});
