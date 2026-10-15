import { getNodeTransform } from './glb-transform-writer.js';

/**
 * 计算 Uint8Array 或 ArrayBuffer 的 SHA-256 哈希字符串 (小写十六进制)。
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<string>}
 */
export async function sha256(bytes) {
  let buffer;
  if (bytes instanceof Uint8Array) {
    buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } else if (bytes instanceof ArrayBuffer) {
    buffer = bytes;
  } else if (ArrayBuffer.isView(bytes)) {
    buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } else {
    throw new Error('sha256 输入必须为 Uint8Array 或 ArrayBuffer');
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 递归/反查计算 glTF 节点的路径。
 * 格式如: /0:Root/3:Name
 * 检查重复父/循环。
 * @param {Object} document
 * @param {number} targetIndex
 * @returns {string}
 */
export function nodePath(document, targetIndex) {
  if (!document || !Array.isArray(document.nodes)) {
    throw new Error('nodePath: document 缺少 nodes 数组');
  }
  const nodes = document.nodes;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= nodes.length) {
    throw new Error(`nodePath: 无效的目标索引 ${targetIndex}`);
  }

  // 构建 child -> parent 映射，检查每个节点是否有多于一个父节点
  const parentMap = new Map();
  for (let pIdx = 0; pIdx < nodes.length; pIdx++) {
    const pNode = nodes[pIdx];
    if (pNode && Array.isArray(pNode.children)) {
      for (const cIdx of pNode.children) {
        if (!Number.isInteger(cIdx) || cIdx < 0 || cIdx >= nodes.length) {
          throw new Error(`node[${pIdx}] 的子节点索引 ${cIdx} 越界`);
        }
        if (cIdx === pIdx) {
          throw new Error(`检测到自循环引用：节点 ${pIdx} 将自身作为子节点`);
        }
        if (parentMap.has(cIdx)) {
          throw new Error(`检测到重复父节点：节点 ${cIdx} 同时有父节点 ${parentMap.get(cIdx)} 和 ${pIdx}`);
        }
        parentMap.set(cIdx, pIdx);
      }
    }
  }

  // 从 targetIndex 向上回溯到根，同时检测循环引用
  const chain = [];
  const visited = new Set();
  let curr = targetIndex;

  while (curr !== undefined) {
    if (visited.has(curr)) {
      throw new Error(`检测到父子链循环引用，环包含节点 ${curr}`);
    }
    visited.add(curr);
    chain.push(curr);
    curr = parentMap.get(curr);
  }

  // chain 当前是从 target 到 root，反转为从 root 到 target
  chain.reverse();

  // 构建路径字符串，例如 /0:Root/3:Name
  const parts = chain.map(idx => {
    const node = nodes[idx];
    const name = (node && typeof node.name === 'string' && node.name.length > 0) ? node.name : `Node_${idx}`;
    return `${idx}:${name}`;
  });

  return '/' + parts.join('/');
}

/**
 * 创建补丁对象。
 * @param {Object} parsed parseGlb 返回的结果
 * @param {Array<{nodeIndex: number, transform: Object, note?: string, verifiedAgainstCAD?: boolean}>} edits
 * @param {string} filename
 * @param {string} note
 * @param {boolean} [verified=false]
 * @returns {Promise<Object>}
 */
export async function createPatch(parsed, edits, filename, note, verified = false) {
  if (!parsed || !parsed.document || !parsed.bytes) {
    throw new Error('createPatch: 无效的 parsed 对象');
  }
  if (!Array.isArray(edits)) {
    throw new Error('createPatch: edits 必须为数组');
  }

  const hash = await sha256(parsed.bytes);
  const sizeBytes = parsed.bytes.byteLength;

  const patchEdits = [];
  const seenIndices = new Set();

  for (const edit of edits) {
    const { nodeIndex, transform, note: editNote, verifiedAgainstCAD } = edit;
    if (typeof nodeIndex !== 'number' || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= parsed.document.nodes.length) {
      throw new Error(`createPatch: 无效的 nodeIndex ${nodeIndex}`);
    }
    if (seenIndices.has(nodeIndex)) {
      throw new Error(`createPatch: 重复的 nodeIndex ${nodeIndex}`);
    }
    seenIndices.add(nodeIndex);

    const sourceNode = parsed.document.nodes[nodeIndex];
    const original = getNodeTransform(sourceNode);

    // 校验 repaired 变换
    if (!transform || typeof transform !== 'object') {
      throw new Error(`nodeIndex ${nodeIndex} 的 transform 无效`);
    }
    // 使用 getNodeTransform 归一化 repaired
    const repaired = getNodeTransform(transform);

    const p = nodePath(parsed.document, nodeIndex);

    patchEdits.push({
      nodeIndex,
      nodePath: p,
      original,
      repaired,
      note: editNote || note || '人工修正位置，待机械核验',
      verifiedAgainstCAD: typeof verifiedAgainstCAD === 'boolean' ? verifiedAgainstCAD : Boolean(verified)
    });
  }

  return {
    schemaVersion: 1,
    source: {
      filename: filename || 'model.glb',
      sha256: hash,
      sizeBytes
    },
    coordinateSpace: 'local',
    edits: patchEdits
  };
}

/**
 * 校验补丁并返回规范化的 edits。
 * 校验项目：
 * - 全部哈希匹配
 * - sizeBytes 匹配
 * - schemaVersion === 1
 * - 路径与源节点一致
 * - original 与源节点当前变换等价 (误差阈值内)
 * - 索引唯一
 * - repaired scale 与 original scale 一致 (不支持缩放编辑)
 * - 数值有限 + quat 归一化
 *
 * 失败抛错，且不修改传入的任何输入对象。
 * @param {Object} parsed
 * @param {Object} patch
 * @returns {Promise<Array<{nodeIndex: number, transform: {translation: number[], rotation: number[], scale: number[]}}>>}
 */
export async function validatePatch(parsed, patch) {
  if (!parsed || !parsed.document || !parsed.bytes) {
    throw new Error('validatePatch: 无效的 parsed 对象');
  }
  if (!patch || typeof patch !== 'object') {
    throw new Error('validatePatch: 无效的 patch 对象');
  }

  if (patch.schemaVersion !== 1) {
    throw new Error(`validatePatch: 不支持的 schemaVersion ${patch.schemaVersion}`);
  }

  if (!patch.source || typeof patch.source !== 'object') {
    throw new Error('validatePatch: patch 缺少 source 对象');
  }

  // 校验 sizeBytes
  if (patch.source.sizeBytes !== parsed.bytes.byteLength) {
    throw new Error(`validatePatch: 文件体积不匹配 (补丁期望 ${patch.source.sizeBytes} 字节，源文件实际 ${parsed.bytes.byteLength} 字节)`);
  }

  // 校验 SHA-256
  const actualHash = await sha256(parsed.bytes);
  if (typeof patch.source.sha256 !== 'string' || patch.source.sha256.toLowerCase() !== actualHash.toLowerCase()) {
    throw new Error(`validatePatch: 文件 SHA-256 哈希不匹配 (补丁期望 ${patch.source.sha256}，源文件实际 ${actualHash})`);
  }

  if (patch.coordinateSpace !== 'local') {
    throw new Error(`validatePatch: 坐标空间必须为 'local'，得到 '${patch.coordinateSpace}'`);
  }

  if (!Array.isArray(patch.edits)) {
    throw new Error('validatePatch: patch.edits 必须为数组');
  }

  const nodes = parsed.document.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('validatePatch: parsed.document 缺少 nodes 数组');
  }

  const seenIndices = new Set();
  const normalizedEdits = [];

  for (let i = 0; i < patch.edits.length; i++) {
    const edit = patch.edits[i];
    if (!edit || typeof edit !== 'object') {
      throw new Error(`validatePatch: edits[${i}] 无效`);
    }

    const { nodeIndex, nodePath: expectedPath, original, repaired } = edit;

    if (typeof nodeIndex !== 'number' || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) {
      throw new Error(`validatePatch: edits[${i}] 的 nodeIndex ${nodeIndex} 越界`);
    }

    if (seenIndices.has(nodeIndex)) {
      throw new Error(`validatePatch: 重复的 nodeIndex ${nodeIndex}`);
    }
    seenIndices.add(nodeIndex);

    // 检查 nodePath
    const actualPath = nodePath(parsed.document, nodeIndex);
    if (expectedPath !== actualPath) {
      throw new Error(`validatePatch: nodeIndex ${nodeIndex} 的路径不匹配 (期望 ${expectedPath}，实际 ${actualPath})`);
    }

    // 检查 original 与源节点当前变换等价
    const currentTransform = getNodeTransform(nodes[nodeIndex]);
    if (!original || typeof original !== 'object') {
      throw new Error(`validatePatch: nodeIndex ${nodeIndex} 缺少 original 变换`);
    }

    for(const [key,length]of [['translation',3],['rotation',4],['scale',3]]){
      for(const value of [original,repaired]){
        if(!value||!Array.isArray(value[key])||value[key].length!==length||value[key].some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error(`validatePatch: ${key} 数组无效`);
      }
    }
    getNodeTransform(original);
    // 校验 original 各维度等价性
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(original.translation[axis] - currentTransform.translation[axis]) > 1e-4) {
        throw new Error(`validatePatch: nodeIndex ${nodeIndex} original.translation 与源节点不一致`);
      }
      if (Math.abs(original.scale[axis] - currentTransform.scale[axis]) > 1e-4) {
        throw new Error(`validatePatch: nodeIndex ${nodeIndex} original.scale 与源节点不一致`);
      }
    }
    // 四元数等价性 (考虑 q 和 -q 等价)
    const dot = original.rotation[0] * currentTransform.rotation[0] +
                original.rotation[1] * currentTransform.rotation[1] +
                original.rotation[2] * currentTransform.rotation[2] +
                original.rotation[3] * currentTransform.rotation[3];
    if (Math.abs(Math.abs(dot) - 1.0) > 1e-3) {
      throw new Error(`validatePatch: nodeIndex ${nodeIndex} original.rotation 与源节点不一致`);
    }

    // 检查 repaired 变换：有限、归一化、scale 必须与 original 一致（不支持缩放编辑）
    if (!repaired || typeof repaired !== 'object') {
      throw new Error(`validatePatch: nodeIndex ${nodeIndex} 缺少 repaired 变换`);
    }

    const normRepaired = getNodeTransform(repaired);

    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(normRepaired.scale[axis] - original.scale[axis]) > 1e-5) {
        throw new Error(`validatePatch: nodeIndex ${nodeIndex} 缩放被修改 (原缩放 [${original.scale}], 补丁缩放 [${normRepaired.scale}])，首版不支持缩放编辑`);
      }
    }

    normalizedEdits.push({
      nodeIndex,
      transform: normRepaired
    });
  }

  return normalizedEdits;
}
