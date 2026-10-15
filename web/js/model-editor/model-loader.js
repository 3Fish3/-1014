import * as THREE from '../../vendor/three/three.module.js';
import { parseGlb, getNodeTransform } from './glb-transform-writer.js';
import { sha256, nodePath } from './repair-patch.js';

export function disposeModel(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root?.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of [n.material].flat().filter(Boolean)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});
}

export async function loadSource(bytes, filename) {
  const parsed=parseGlb(bytes);
  // 编辑器不运行动画或骨骼，避免导出静态变换与实际动画姿态不一致。
  if(parsed.document.animations?.length||parsed.document.skins?.length)throw new Error('首版不支持动画/骨骼模型的装配编辑');
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw new Error('编辑器禁止加载外部模型资源');
    return url;
  });
  for(let i=0;i<parsed.document.nodes.length;i++)nodePath(parsed.document,i);
  const {GLTFLoader}=await import('../../vendor/three/GLTFLoader.js');
  const loader=new GLTFLoader(manager);
  const buffer=parsed.bytes.slice().buffer;
  const gltf=await loader.parseAsync(buffer,'');
  try {
    const root=gltf.scene;
    const nodes=new Map(),indices=new Map(),metadata=new Map();
    const mounted=new Set();root.traverse(o=>mounted.add(o));
    for(let i=0;i<parsed.document.nodes.length;i++) {
      const object=await gltf.parser.getDependency('node',i);
      if(!mounted.has(object))continue;
      if(gltf.parser.associations.get(object)?.nodes!==i)throw new Error(`源节点映射不稳定：${i}`);
      if(indices.has(object))throw new Error('多个源节点映射到同一对象');
      nodes.set(i,object);indices.set(object,i);
      let transform=null,error=null;
      try{transform=getNodeTransform(parsed.document.nodes[i]);}catch(e){error=e.message;}
      metadata.set(i,{path:nodePath(parsed.document,i),original:transform,baseline:objectTransform(object),error});
    }
    root.updateMatrixWorld(true);
    return {parsed,root,nodes,indices,metadata,filename,hash:await sha256(parsed.bytes)};
  }catch(error){gltf.scenes.forEach(disposeModel);throw error;}
}

export function objectTransform(object) {
  return {translation:object.position.toArray(),rotation:object.quaternion.toArray(),scale:object.scale.toArray()};
}

export function applyTransform(object, transform) {
  object.position.fromArray(transform.translation);
  object.quaternion.fromArray(transform.rotation).normalize();
  object.scale.fromArray(transform.scale);
  object.updateMatrix();object.updateMatrixWorld(true);
}

export function checkedTransform(object, originalScale) {
  object.updateWorldMatrix(true,false);
  if(object.parent&&Math.abs(object.parent.matrixWorld.determinant())<1e-12)throw new Error('父级世界矩阵不可逆，禁止编辑');
  if(object.parent&&object.parent.matrixWorld.determinant()<0)throw new Error('父链含镜像反射；首版禁止手柄与数值编辑，避免世界旋转方向错误');
  const result=getNodeTransform({matrix:object.matrix.elements});
  if(result.scale.some((value,i)=>Math.abs(value-originalScale[i])>1e-5))throw new Error('该变换改变比例或引入剪切，已拒绝');
  // TransformControls 世界旋转在非均匀父缩放下没有可靠TRS结果。
  if(object.parent){
    const parent=getNodeTransform({matrix:object.parent.matrixWorld.elements});
    const scales=parent.scale.map(Math.abs);
    if(Math.max(...scales)-Math.min(...scales)>1e-5)throw new Error('父级含非均匀缩放；首版仅允许可靠的等比父链编辑');
  }
  return result;
}
