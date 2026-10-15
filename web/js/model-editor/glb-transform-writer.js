import * as THREE from '../../vendor/three/three.module.js';

const GLB_MAGIC = 0x46546c67; // 'glTF' in little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON' in little-endian

/**
 * Validates that numbers are finite.
 */
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function assertFiniteArray(arr, len, name) {
  if (!Array.isArray(arr) || arr.length !== len) {
    throw new Error(`${name} 必须为长度为 ${len} 的数组`);
  }
  for (let i = 0; i < len; i++) {
    if (!isFiniteNumber(arr[i])) {
      throw new Error(`${name}[${i}] 必须为有效有限数字`);
    }
  }
}

/**
 * 校验并提取/分解节点变换。
 * - 对 matrix 使用 Three.Matrix4 分解，并重构检查以拒绝剪切 (shear)。
 * - 对 TRS 提供默认值，并校验数值有限与四元数归一化。
 * 返回标准 TRS 格式：{ translation: [x,y,z], rotation: [x,y,z,w], scale: [x,y,z] }
 */
export function getNodeTransform(node) {
  if (!node || typeof node !== 'object') {
    throw new Error('无效的节点对象');
  }

  if (node.matrix !== undefined) {
    if(['translation','rotation','scale'].some(key=>node[key]!==undefined))throw new Error('matrix 与 TRS 不允许同时存在');
    assertFiniteArray(node.matrix, 16, 'node.matrix');
    if([3,7,11].some(i=>Math.abs(node.matrix[i])>1e-10)||Math.abs(node.matrix[15]-1)>1e-10)throw new Error('矩阵不是仿射变换');
    const m = new THREE.Matrix4();
    m.fromArray(node.matrix);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    m.decompose(position, quaternion, scale);
    if([...position.toArray(),...quaternion.toArray(),...scale.toArray()].some(v=>!Number.isFinite(v)))throw new Error('矩阵无法有限分解');
    quaternion.normalize();

    // 检查 scale 不能为 0
    if (Math.abs(scale.x) < 1e-12 || Math.abs(scale.y) < 1e-12 || Math.abs(scale.z) < 1e-12) {
      throw new Error('矩阵分解失败：scale 不能为零或接近零');
    }

    // 重构检查以拒绝剪切 (shear)
    const recomposed = new THREE.Matrix4();
    recomposed.compose(position, quaternion, scale);

    for (let i = 0; i < 16; i++) {
      if (Math.abs(m.elements[i] - recomposed.elements[i]) > 1e-4) {
        throw new Error('检测到矩阵包含剪切(shear)或不可正交分解的变换，已拒绝');
      }
    }

    return {
      translation: [position.x, position.y, position.z],
      rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      scale: [scale.x, scale.y, scale.z]
    };
  }

  // TRS 格式
  const translation = node.translation !== undefined ? [...node.translation] : [0, 0, 0];
  const rotation = node.rotation !== undefined ? [...node.rotation] : [0, 0, 0, 1];
  const scale = node.scale !== undefined ? [...node.scale] : [1, 1, 1];

  assertFiniteArray(translation, 3, 'translation');
  assertFiniteArray(rotation, 4, 'rotation');
  assertFiniteArray(scale, 3, 'scale');

  for (let i = 0; i < 3; i++) {
    if (Math.abs(scale[i]) < 1e-12) {
      throw new Error(`scale[${i}] 不能为零`);
    }
  }

  const qLenSq = rotation[0] * rotation[0] + rotation[1] * rotation[1] + rotation[2] * rotation[2] + rotation[3] * rotation[3];
  if (Math.abs(qLenSq - 1.0) > 1e-3 || qLenSq < 1e-6) {
    throw new Error('rotation 四元数未归一化或为全零四元数');
  }

  // 稍微归一化以保证精确
  const qLen = Math.sqrt(qLenSq);
  const normalizedRot = [
    rotation[0] / qLen,
    rotation[1] / qLen,
    rotation[2] / qLen,
    rotation[3] / qLen
  ];

  return {
    translation,
    rotation: normalizedRot,
    scale
  };
}

/**
 * 解析 GLB 文件二进制数据。
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{document: Object, chunks: Array<{type: number, data: Uint8Array}>, bytes: Uint8Array}}
 */
export function parseGlb(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new Error('parseGlb 输入必须为 Uint8Array 或 ArrayBuffer');
  }

  if (bytes.byteLength < 12) {
    throw new Error('GLB 数据长度不足 12 字节头部');
  }

  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dataView.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error(`GLB magic 错误：期望 0x46546c67，得到 0x${magic.toString(16)}`);
  }

  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`仅支持 GLB version 2，得到 version ${version}`);
  }

  const totalLength = dataView.getUint32(8, true);
  if (totalLength !== bytes.byteLength) {
    throw new Error(`GLB 文件长度不匹配：头部声明 ${totalLength}，实际字节长 ${bytes.byteLength}`);
  }

  const chunks = [];
  let offset = 12;
  let jsonChunkCount = 0;

  while (offset < totalLength) {
    if (offset + 8 > totalLength) {
      throw new Error(`GLB chunk 头部在偏移量 ${offset} 处越界`);
    }

    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    offset += 8;

    if (chunkLength % 4 !== 0) throw new Error('GLB chunk 长度必须4字节对齐');

    if (offset + chunkLength > totalLength) {
      throw new Error(`GLB chunk 数据超出文件总长边界：offset ${offset} + chunkLength ${chunkLength} > ${totalLength}`);
    }

    if (chunks.length === 0 && chunkType !== CHUNK_TYPE_JSON) {
      throw new Error('GLB 首个 chunk 必须为 JSON (0x4E4F534A)');
    }

    if (chunkType === CHUNK_TYPE_JSON) {
      jsonChunkCount++;
      if (jsonChunkCount > 1) {
        throw new Error('GLB 中只允许包含且必须包含唯一 JSON chunk');
      }
    }

    const chunkData = bytes.subarray(offset, offset + chunkLength);
    chunks.push({
      type: chunkType,
      data: chunkData
    });

    offset += chunkLength;
  }

  if (chunks.length === 0 || chunks[0].type !== CHUNK_TYPE_JSON) {
    throw new Error('GLB 缺少必需的 JSON chunk');
  }

  // 解析首个 chunk（JSON）
  const textDecoder = new TextDecoder('utf-8', {fatal:true});
  let jsonText = textDecoder.decode(chunks[0].data);
  // 去除末尾的填充空格 (0x20)
  jsonText = jsonText.trimEnd();

  let document;
  try {
    document = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`GLB JSON chunk 解析失败: ${err.message}`);
  }

  if (!document || typeof document !== 'object') {
    throw new Error('GLB JSON document 必须为有效对象');
  }

  if (!Array.isArray(document.nodes)) {
    throw new Error('GLB document 缺少有效的 nodes 数组');
  }

  if(document.asset?.version!=='2.0')throw new Error('仅支持glTF asset version 2.0');
  const binChunks=chunks.filter(c=>c.type===0x004e4942);
  if(binChunks.length>1)throw new Error('重复BIN chunk');
  if(binChunks.length&&chunks[1]?.type!==0x004e4942)throw new Error('BIN必须紧随JSON');
  if((document.buffers?.length||0)>1)throw new Error('首版仅支持单内嵌buffer');
  if(document.buffers?.length&&document.buffers[0].uri===undefined){
    const size=document.buffers[0].byteLength;
    if(!Number.isInteger(size)||size<0||!binChunks.length||binChunks[0].data.length<size||binChunks[0].data.length-size>3)throw new Error('BIN长度与buffer声明不匹配');
  }

  // 检查外部 buffer URI
  if (Array.isArray(document.buffers)) {
    for (const [idx, buf] of document.buffers.entries()) {
      if (buf.uri !== undefined) {
        throw new Error(`GLB 包含外部 buffer[${idx}] URI (${buf.uri})，首版不支持外部资源`);
      }
    }
  }

  // 检查外部 image URI
  if (Array.isArray(document.images)) {
    for (const [idx, img] of document.images.entries()) {
      if (img.uri !== undefined && !img.uri.startsWith('data:')) {
        throw new Error(`GLB 包含外部 image[${idx}] URI (${img.uri})，首版仅支持内嵌资源`);
      }
    }
  }

  // 检查 extensionsRequired：仅允许 KHR_materials_unlit，其余拒绝
  if (Array.isArray(document.extensionsRequired)) {
    const allowed = new Set(['KHR_materials_unlit']);
    const unsupported = document.extensionsRequired.filter(ext => !allowed.has(ext));
    if (unsupported.length > 0) {
      throw new Error(`GLB 包含不支持的必需扩展 extensionsRequired: ${unsupported.join(', ')}`);
    }
  }

  return {
    document,
    chunks,
    bytes
  };
}

/**
 * 将 edits 应用到 parsed GLB 中并输出新的 GLB 二进制 Uint8Array。
 * @param {{document: Object, chunks: Array<{type: number, data: Uint8Array}>, bytes: Uint8Array}} parsed
 * @param {Array<{nodeIndex: number, transform: {translation: number[], rotation: number[], scale: number[]}}>} edits
 * @returns {Uint8Array}
 */
export function writeGlbTransforms(parsed, edits) {
  if (!parsed || !parsed.document || !Array.isArray(parsed.chunks)) {
    throw new Error('writeGlbTransforms: 无效的 parsed 对象');
  }
  if (!Array.isArray(edits)) {
    throw new Error('writeGlbTransforms: edits 必须为数组');
  }

  // 深拷贝 document，避免破坏传入的原始对象
  let doc;
  try {
    doc = JSON.parse(JSON.stringify(parsed.document));
  } catch (err) {
    throw new Error(`writeGlbTransforms document 序列化失败: ${err.message}`);
  }
  const nodes = doc.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('GLB document 缺少 nodes 数组');
  }

  // 检查重复索引
  const seenIndices = new Set();
  for (const edit of edits) {
    const { nodeIndex, transform } = edit;
    if (typeof nodeIndex !== 'number' || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) {
      throw new Error(`无效的 nodeIndex: ${nodeIndex}`);
    }
    if (seenIndices.has(nodeIndex)) {
      throw new Error(`edits 中存在重复的 nodeIndex: ${nodeIndex}`);
    }
    seenIndices.add(nodeIndex);

    // 检查并归一化 transform
    if (!transform || typeof transform !== 'object') {
      throw new Error(`nodeIndex ${nodeIndex} 的 transform 无效`);
    }
    assertFiniteArray(transform.translation, 3, `nodeIndex ${nodeIndex} translation`);
    assertFiniteArray(transform.rotation, 4, `nodeIndex ${nodeIndex} rotation`);
    assertFiniteArray(transform.scale, 3, `nodeIndex ${nodeIndex} scale`);

    for (let i = 0; i < 3; i++) {
      if (Math.abs(transform.scale[i]) < 1e-12) {
        throw new Error(`nodeIndex ${nodeIndex} scale[${i}] 不能为零`);
      }
    }

    const qLenSq = transform.rotation[0] ** 2 + transform.rotation[1] ** 2 + transform.rotation[2] ** 2 + transform.rotation[3] ** 2;
    if (Math.abs(qLenSq - 1.0) > 1e-3 || qLenSq < 1e-6) {
      throw new Error(`nodeIndex ${nodeIndex} rotation 四元数未归一化`);
    }
    const qLen = Math.sqrt(qLenSq);
    const normRot = [
      transform.rotation[0] / qLen,
      transform.rotation[1] / qLen,
      transform.rotation[2] / qLen,
      transform.rotation[3] / qLen
    ];

    const targetNode = nodes[nodeIndex];
    if (!targetNode || typeof targetNode !== 'object') {
      throw new Error(`未找到目标节点 ${nodeIndex}`);
    }

    // 若原 node 有 matrix，则用 Three.Matrix4 compose 更新 matrix 且删除 translation/rotation/scale
    if (targetNode.matrix !== undefined) {
      const pos = new THREE.Vector3(...transform.translation);
      const quat = new THREE.Quaternion(...normRot);
      const scl = new THREE.Vector3(...transform.scale);

      const m = new THREE.Matrix4();
      m.compose(pos, quat, scl);
      targetNode.matrix = Array.from(m.elements);

      delete targetNode.translation;
      delete targetNode.rotation;
      delete targetNode.scale;
    } else {
      // 否则更新 TRS，不添加 matrix
      targetNode.translation = [...transform.translation];
      targetNode.rotation = normRot;
      targetNode.scale = [...transform.scale];
      delete targetNode.matrix;
    }
  }

  // 序列化 JSON chunk，并对齐到 4 字节边界（用空格 0x20 填充）
  const textEncoder = new TextEncoder();
  const rawJsonBytes = textEncoder.encode(JSON.stringify(doc));
  const jsonPadding = (4 - (rawJsonBytes.byteLength % 4)) % 4;
  const jsonChunkDataLength = rawJsonBytes.byteLength + jsonPadding;

  const jsonChunkData = new Uint8Array(jsonChunkDataLength);
  jsonChunkData.set(rawJsonBytes, 0);
  for (let i = rawJsonBytes.byteLength; i < jsonChunkDataLength; i++) {
    jsonChunkData[i] = 0x20; // space
  }

  // 计算新的 GLB 文件总长度
  let totalLength = 12; // 12-byte header
  totalLength += 8 + jsonChunkDataLength; // JSON chunk header + data

  // 原样保留其余 chunks (如 BIN chunk 及未知合法 chunk)
  for (let i = 1; i < parsed.chunks.length; i++) {
    const chunk = parsed.chunks[i];
    // 每个 chunk 数据必须按 4 字节对齐
    totalLength += 8 + chunk.data.byteLength;
  }

  // 组装新的 GLB 二进制
  const output = new Uint8Array(totalLength);
  const outView = new DataView(output.buffer, output.byteOffset, output.byteLength);

  // Header: magic (4) + version (4) + length (4)
  outView.setUint32(0, GLB_MAGIC, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, totalLength, true);

  let writeOffset = 12;

  // Write JSON chunk
  outView.setUint32(writeOffset, jsonChunkDataLength, true);
  outView.setUint32(writeOffset + 4, CHUNK_TYPE_JSON, true);
  writeOffset += 8;
  output.set(jsonChunkData, writeOffset);
  writeOffset += jsonChunkDataLength;

  // Write remaining chunks verbatim
  for (let i = 1; i < parsed.chunks.length; i++) {
    const chunk = parsed.chunks[i];
    outView.setUint32(writeOffset, chunk.data.byteLength, true);
    outView.setUint32(writeOffset + 4, chunk.type, true);
    writeOffset += 8;
    output.set(chunk.data, writeOffset);
    writeOffset += chunk.data.byteLength;
  }

  return output;
}
