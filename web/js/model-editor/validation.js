import { parseGlb } from './glb-transform-writer.js';

/** JSON语义只允许目标节点变换变化，所有其他chunk必须逐字节一致。 */
export function validateExport(source,bytes,edits) {
  const target=parseGlb(bytes);
  const changed=new Set(edits.map(e=>e.nodeIndex));
  if(source.document.nodes.length!==target.document.nodes.length)throw new Error('导出节点数变化');
  const before=structuredClone(source.document),after=structuredClone(target.document);
  for(const index of changed){
    for(const doc of [before,after])for(const key of ['translation','rotation','scale','matrix'])delete doc.nodes[index][key];
  }
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('导出改变了非目标节点或其他模型信息');
  if(source.chunks.length!==target.chunks.length)throw new Error('导出chunk数量变化');
  for(let i=1;i<source.chunks.length;i++){
    const a=source.chunks[i],b=target.chunks[i];
    if(a.type!==b.type||a.data.length!==b.data.length||a.data.some((v,j)=>v!==b.data[j]))throw new Error('二进制/其他chunk不一致，禁止导出');
  }
  return target;
}
