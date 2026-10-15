// 仅生成“重复平移补偿”候选，不覆盖源模型，不认定机械安装位置。
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as T from '../web/vendor/three/three.module.js';
import {parseGlb,getNodeTransform,writeGlbTransforms} from '../web/js/model-editor/glb-transform-writer.js';
import {createPatch,sha256} from '../web/js/model-editor/repair-patch.js';
import {validateExport} from '../web/js/model-editor/validation.js';

export const sourceFile='web/models/hero_robot_clean.glb';
export const candidateFile='web/models/hero_robot_inferred.glb';
export const patchFile='web/models/repairs/yaw-offset-inferred.json';
export const sourceHash='f2eefd1ee718e8c0bebd7490968d5b62b4f99a6b640e57905bb3ef940c374baf';
const near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
function matrix(node){const t=getNodeTransform(node);return new T.Matrix4().compose(new T.Vector3(...t.translation),new T.Quaternion(...t.rotation),new T.Vector3(...t.scale));}

export async function buildCandidate(bytes){
 if(await sha256(bytes)!==sourceHash)throw new Error('源模型哈希变化，拒绝把历史推定套在其他模型上');
 const parsed=parseGlb(bytes),d=parsed.document;
 const parent=new Map;d.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
 const world=i=>parent.has(i)?world(parent.get(i)).multiply(matrix(d.nodes[i])):matrix(d.nodes[i]);
 if(parent.get(549)!==543||parent.get(543)!==389||d.nodes[549].name!=='Yaw轴装配体2.1改')throw new Error('候选装配层级不符');
 const parentWorld=world(543),elements=parentWorld.elements;
 for(let i=0;i<16;i++){if([12,13,14].includes(i))continue;if(!near(elements[i],new T.Matrix4().elements[i],1e-10))throw new Error('父链不再是纯平移，不可直接采用重复坐标假设');}
 const origin=new T.Vector3().setFromMatrixPosition(parentWorld);
 for(const i of[550,551,552,553,555,556,559]){
  const p=d.nodes[i].translation;
  if(!near(p[0],origin.x)||!near(p[2],origin.z))throw new Error(`节点${i}不满足重复XZ原点特征`);
 }
 const original=getNodeTransform(d.nodes[549]);
 if(original.translation.some(v=>v!==0))throw new Error('候选组已存在平移，拒绝二次补偿');
 const edits=[{nodeIndex:549,transform:{...original,translation:origin.clone().negate().toArray()}}];
 const output=writeGlbTransforms(parsed,edits);validateExport(parsed,output,edits);
 const patch=await createPatch(parsed,edits,'hero_robot_clean.glb','推定装配：子组疑似重复使用上层全局坐标，仅补偿父组平移；无CAD或照片依据，未机械核验。',false);
 const evidence=measure(parsed,origin);
 return {bytes:output,patch,evidence:{...evidence,sourceHash,candidateHash:await sha256(output),changedNode:549,compensation:edits[0].transform.translation,verifiedAgainstCAD:false}};
}

function measure(parsed,offset){
 const d=parsed.document,bin=parsed.chunks.find(c=>c.type===0x004e4942).data;
 const view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 function accessor(id){
  const a=d.accessors[id],v=d.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type];
  const size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'getFloat32',5125:'getUint32',5123:'getUint16',5121:'getUint8'}[a.componentType];
  if(!n||!size||a.sparse)throw new Error('接口分析暂不支持此accessor布局');
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>view[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+j*size,true)));
 }
 function geometry(index){
  const vertices=[],triangles=[];
  for(const p of d.meshes[d.nodes[index].mesh].primitives){
   const start=vertices.length,positions=accessor(p.attributes.POSITION);
   const m=matrix(d.nodes[index]);
   vertices.push(...positions.map(a=>{const p=new T.Vector3(...a).applyMatrix4(m);return index>=550&&index<=560?p.sub(offset):p;}));
   const ids=p.indices===undefined?positions.map((_,i)=>[i]):accessor(p.indices);
   for(let j=0;j<ids.length;j+=3)triangles.push(ids.slice(j,j+3).map(a=>a[0]+start));
  }
  return {vertices,triangles,bounds:new T.Box3().setFromPoints(vertices)};
 }
 function faceHoles(g,y){
  const edges=new Map,coordinates=new Map;
  const key=v=>[v.x,v.z].map(x=>Math.round(x*1e7)).join(',');
  for(const tri of g.triangles){
   if(!tri.every(i=>near(g.vertices[i].y,y)))continue;
   for(let j=0;j<3;j++){
    const a=key(g.vertices[tri[j]]),b=key(g.vertices[tri[(j+1)%3]]),pair=[a,b].sort().join('|');
    coordinates.set(a,g.vertices[tri[j]]);coordinates.set(b,g.vertices[tri[(j+1)%3]]);edges.set(pair,(edges.get(pair)||0)+1);
   }
  }
  const links=new Map;for(const[k,count]of edges)if(count===1){const[a,b]=k.split('|');for(const[x,y]of[[a,b],[b,a]]){if(!links.has(x))links.set(x,[]);links.get(x).push(y);}}
  const seen=new Set,holes=[];
  for(const start of links.keys()){
   if(seen.has(start))continue;const pending=[start],points=[];
   while(pending.length){const next=pending.pop();if(seen.has(next))continue;seen.add(next);points.push(coordinates.get(next));for(const n of links.get(next)||[])if(!seen.has(n))pending.push(n);}
   if(points.length<3)continue;
   // 对边界前三个非共线顶点求外接圆，并以全部边界顶点验证，不凭包围盒当孔心。
   let circle;
   for(let i=1;i<points.length-1&&!circle;i++){
    const a=points[0],b=points[i],c=points[i+1];
    const den=2*(a.x*(b.z-c.z)+b.x*(c.z-a.z)+c.x*(a.z-b.z));if(Math.abs(den)<1e-14)continue;
    const aa=a.x*a.x+a.z*a.z,bb=b.x*b.x+b.z*b.z,cc=c.x*c.x+c.z*c.z;
    const x=(aa*(b.z-c.z)+bb*(c.z-a.z)+cc*(a.z-b.z))/den;
    const z=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/den;
    const radius=Math.hypot(a.x-x,a.z-z),residual=Math.max(...points.map(p=>Math.abs(Math.hypot(p.x-x,p.z-z)-radius)));
    if(radius<.01&&radius>.001&&residual<.0001)circle={center:[x,y,z],radius,residual,vertices:points.length};
   }
   if(circle)holes.push(circle);
  }
  return holes;
 }
 const plate=geometry(547),bearing=geometry(552),drive=geometry(563),driven=geometry(551);
 const plateHoles=faceHoles(plate,plate.bounds.max.y),bearingHoles=faceHoles(bearing,bearing.bounds.min.y);
 const bolts=[562,567,568,570,571,572].map(i=>({node:i,axisXZ:[d.nodes[i].translation[0],d.nodes[i].translation[2]]}));
 const holes=[...plateHoles.map(h=>({...h,node:547})),...bearingHoles.map(h=>({...h,node:552}))].map(h=>{
  const distances=bolts.map(b=>({bolt:b.node,distance:Math.hypot(h.center[0]-b.axisXZ[0],h.center[2]-b.axisXZ[1])})).sort((a,b)=>a.distance-b.distance);
  return {...h,nearestBolt:distances[0]};
 });
 const bearingAxis=d.nodes[552].translation.map((v,i)=>v-offset.toArray()[i]);
 const gearYOverlap=Math.min(drive.bounds.max.y,driven.bounds.max.y)-Math.max(drive.bounds.min.y,driven.bounds.min.y);
 return {hypothesis:'子组全局平移被再次叠加，补偿后接口吻合；并非CAD恢复证明',units:'GLB源坐标单位',bearingBottomY:bearing.bounds.min.y,plateTopY:plate.bounds.max.y,contactGap:bearing.bounds.min.y-plate.bounds.max.y,bearingAxisOffsetXZ:[bearingAxis[0],bearingAxis[2]],holes,driveAndDrivenYOverlap:gearYOverlap,driveDrivenAxisDistanceXZ:Math.hypot(d.nodes[563].translation[0]-bearingAxis[0],d.nodes[563].translation[2]-bearingAxis[2]),limitations:['两个45齿零件的中心距约0.115，不能据名称断言直接齿轮啮合；未补造皮带或其他缺失传动件','简化网格可能丢失部分孔形；孔位吻合只作为支持证据','无CAD、实拍或机械确认，不认定真实安装位置']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await buildCandidate(readFileSync(sourceFile));
 mkdirSync('web/models/repairs',{recursive:true});mkdirSync('docs/model-editor/inferred-assembly',{recursive:true});
 writeFileSync(candidateFile,result.bytes);writeFileSync(patchFile,JSON.stringify(result.patch,null,2));
 writeFileSync('docs/model-editor/inferred-assembly/几何依据.json',JSON.stringify(result.evidence,null,2));
 console.log(JSON.stringify(result.evidence,null,2));
}
