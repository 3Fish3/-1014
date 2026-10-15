// MR-3有限覆盖几何审计：真实世界矩阵、全部指定三角对；不改资产、不认证机械装配。
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as T from '../web/vendor/three/three.module.js';
import {parseGlb,getNodeTransform} from '../web/js/model-editor/glb-transform-writer.js';
import {sha256} from '../web/js/model-editor/repair-patch.js';
import {sourceFile,candidateFile,buildCandidate} from './generate_assembly_candidate.mjs';

export const CONTACT_EPSILON=1e-6; // 源单位；只用于浮点/简化网格接触分类，不是制造公差。
const pairList=[[552,547],[553,547],[559,547],[551,563],[550,552],[551,552],[555,551],[556,551],[553,559],[552,566]];
const interval=(points,axis)=>{const values=points.map(p=>p.dot(axis));return [Math.min(...values),Math.max(...values)];};

/** 分类面片交线，不把共面接触当实体穿透；退化三角形明确返回unknown。 */
export function classifyTriangleIntersection(a,b,epsilon=CONTACT_EPSILON){
 const normal=tri=>new T.Vector3().subVectors(tri[1],tri[0]).cross(new T.Vector3().subVectors(tri[2],tri[0]));
 const na=normal(a),nb=normal(b);
 if(na.lengthSq()<1e-24||nb.lengthSq()<1e-24)return 'degenerate';
 na.normalize();nb.normalize();
 const da=a.map(p=>new T.Vector3().subVectors(p,b[0]).dot(nb));
 const db=b.map(p=>new T.Vector3().subVectors(p,a[0]).dot(na));
 const outside=d=>d.every(v=>v>epsilon)||d.every(v=>v<-epsilon);
 if(outside(da)||outside(db))return 'separated';
 const axis=new T.Vector3().crossVectors(na,nb);
 if(axis.lengthSq()<1e-16){
  if(Math.abs(na.dot(new T.Vector3().subVectors(b[0],a[0])))>epsilon)return 'separated';
  // 共面三角形需要平面内分离轴；单用法向及edge×edge会误判平面内分离。
  for(const tri of[a,b])for(let i=0;i<3;i++){
   const inPlane=new T.Vector3().subVectors(tri[(i+1)%3],tri[i]).cross(na).normalize();
   const [loA,hiA]=interval(a,inPlane),[loB,hiB]=interval(b,inPlane);
   if(hiA<loB-epsilon||hiB<loA-epsilon)return 'separated';
  }
  return 'coplanar-contact';
 }
 axis.normalize();
 const cut=(tri,distances)=>{
  const points=[];
  for(let i=0;i<3;i++){
   const j=(i+1)%3,x=distances[i],y=distances[j];
   if(Math.abs(x)<=epsilon)points.push(tri[i]);
   if((x>epsilon&&y<-epsilon)||(x<-epsilon&&y>epsilon))points.push(tri[i].clone().lerp(tri[j],x/(x-y)));
  }
  return points;
 };
 const ca=cut(a,da),cb=cut(b,db);
 if(!ca.length||!cb.length)return 'separated';
 const [loA,hiA]=interval(ca,axis),[loB,hiB]=interval(cb,axis),overlap=Math.min(hiA,hiB)-Math.max(loA,loB);
 if(overlap<-epsilon)return 'separated';
 const straddles=d=>Math.min(...d)<-epsilon&&Math.max(...d)>epsilon;
 return overlap>epsilon&&straddles(da)&&straddles(db)?'proper-surface-crossing':'edge-contact';
}

export function checkAabbIntersection(a,b,epsilon=CONTACT_EPSILON){return a.clone().expandByScalar(epsilon).intersectsBox(b);}
export function auditMeshInterpenetration(a,b){
 const result={aabbIntersected:checkAabbIntersection(a.bounds,b.bounds),status:'aabb-separated',totalTrianglePairs:a.triangles.length*b.triangles.length,trianglePairsVisited:0,triangleAabbCandidates:0,properCrossings:0,contacts:0,degeneratePairs:0,examples:[]};
 if(!result.aabbIntersected)return result;
 const prepare=mesh=>mesh.triangles.map(indices=>{const points=indices.map(i=>mesh.vertices[i]);return {points,bounds:new T.Box3().setFromPoints(points)};});
 const ta=prepare(a),tb=prepare(b);
 for(let i=0;i<ta.length;i++)for(let j=0;j<tb.length;j++){
  result.trianglePairsVisited++;
  if(!checkAabbIntersection(ta[i].bounds,tb[j].bounds))continue;
  result.triangleAabbCandidates++;
  const kind=classifyTriangleIntersection(ta[i].points,tb[j].points);
  if(kind==='proper-surface-crossing')result.properCrossings++;
  else if(kind==='coplanar-contact'||kind==='edge-contact')result.contacts++;
  else if(kind==='degenerate')result.degeneratePairs++;
  // 仅例证列表限8项；计数和三角对遍历不抽样、不截断。
  if(kind!=='separated'&&result.examples.length<8)result.examples.push({triangles:[i,j],kind});
 }
 result.status=result.properCrossings?'surface-crossing-review-required':result.contacts?'surface-contact-review-required':'aabb-overlap-unknown-containment';
 return result;
}

function localMatrix(node){const t=getNodeTransform(node);return new T.Matrix4().compose(new T.Vector3(...t.translation),new T.Quaternion(...t.rotation),new T.Vector3(...t.scale));}
export function geometryReader(parsed){
 const d=parsed.document,parents=new Map,matrices=new Map,cache=new Map;
 d.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
 const world=i=>{
  if(!matrices.has(i))matrices.set(i,parents.has(i)?world(parents.get(i)).clone().multiply(localMatrix(d.nodes[i])):localMatrix(d.nodes[i]));
  return matrices.get(i);
 };
 const bin=parsed.chunks.find(c=>c.type===0x004e4942).data,view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const accessor=id=>{
  const a=d.accessors[id],v=d.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type];
  const bytes={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'getFloat32',5125:'getUint32',5123:'getUint16',5121:'getUint8'}[a.componentType];
  if(!n||!bytes||a.sparse)throw new Error('审计暂不支持此accessor布局，不能跳过');
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>view[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*bytes)+j*bytes,true)));
 };
 const geometry=index=>{
  if(cache.has(index))return cache.get(index);
  const vertices=[],triangles=[],node=d.nodes[index];if(node.mesh===undefined)throw new Error(`节点${index}没有几何`);
  for(const primitive of d.meshes[node.mesh].primitives){
   if(primitive.mode!==undefined&&primitive.mode!==4)throw new Error('仅支持三角形模式');
   const start=vertices.length,positions=accessor(primitive.attributes.POSITION);
   // candidate矩阵已经含549补偿；严禁再在子件坐标中减一次offset。
   for(const position of positions)vertices.push(new T.Vector3(...position).applyMatrix4(world(index)));
   const ids=primitive.indices===undefined?positions.map((_,i)=>[i]):accessor(primitive.indices);
   for(let i=0;i<ids.length;i+=3)triangles.push(ids.slice(i,i+3).map(a=>a[0]+start));
  }
  const mesh={index,name:node.name,vertices,triangles,bounds:new T.Box3().setFromPoints(vertices)};cache.set(index,mesh);return mesh;
 };
 return {geometry,world};
}

export async function auditAssembly(sourceBytes,candidateBytes){
 const expected=await buildCandidate(sourceBytes),candidateHash=await sha256(candidateBytes);
 if(candidateHash!==expected.evidence.candidateHash)throw new Error('候选文件与已审查的单节点补丁不一致，拒绝出具审计');
 const source=geometryReader(parseGlb(sourceBytes)),candidate=geometryReader(parseGlb(candidateBytes));
 const relations=reader=>{
  const bearing=reader.geometry(552),plate=reader.geometry(547),drive=reader.geometry(563),driven=reader.geometry(551);
  const origin=new T.Vector3().setFromMatrixPosition(reader.world(543));
  const bearingOrigin=new T.Vector3().setFromMatrixPosition(reader.world(552));
  const driveOrigin=new T.Vector3().setFromMatrixPosition(reader.world(563));
  const bearingAxis=new T.Vector3(0,1,0).transformDirection(reader.world(552));
  const plateAxis=new T.Vector3(0,1,0).transformDirection(reader.world(547));
  return {bearingAxisOffsetXZ:[bearingOrigin.x-origin.x,bearingOrigin.z-origin.z],axisParallelError:1-Math.abs(bearingAxis.dot(plateAxis)),contactGap:bearing.bounds.min.y-plate.bounds.max.y,bearingBottomY:bearing.bounds.min.y,plateTopY:plate.bounds.max.y,driveDrivenAxisDistanceXZ:Math.hypot(bearingOrigin.x-driveOrigin.x,bearingOrigin.z-driveOrigin.z),gearYOverlap:Math.min(drive.bounds.max.y,driven.bounds.max.y)-Math.max(drive.bounds.min.y,driven.bounds.min.y)};
 };
 const before=relations(source),after=relations(candidate);
 if(Math.abs(after.contactGap-expected.evidence.contactGap)>1e-9)throw new Error('世界坐标与局部补偿接触面分析不一致');
 const pairs=reader=>pairList.map(pair=>({pair,names:pair.map(i=>reader.geometry(i).name),...auditMeshInterpenetration(...pair.map(i=>reader.geometry(i)))}));
 return {sourceHash:await sha256(sourceBytes),candidateHash,verifiedAgainstCAD:false,mechanicalStatus:'推定修复，待机械核验',units:'GLB源坐标单位，未换算成制造精度',contactClassificationEpsilon:CONTACT_EPSILON,before,after,holes:expected.evidence.holes,sourcePairs:pairs(source),candidatePairs:pairs(candidate),coverage:{selectedPairs:pairList.length,triangleSampling:false,exampleLimit:8,scope:'549内部主零件及其与547底板、543下相邻驱动零件的指定对；非整车全对扫描'},limitations:['AABB重叠不等于穿模；接触面、边接触与实际贯穿分类分开','无表面交线不能排除完全包含；未进行封闭实体布尔体积或公差分析','只检查所列10对，螺栓螺纹/所有其他整车零件不在碰撞覆盖内','简化网格可能丢失孔、倒角或微小接触；epsilon不是制造公差','两个45齿命名零件中心距约0.115，传动形式和缺件未确认，不能推断直接齿轮啮合']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const output=process.env.OUTPUT_DIR||'.tmp/ci/hero-assembly';mkdirSync(output,{recursive:true});
 const report=await auditAssembly(readFileSync(sourceFile),readFileSync(candidateFile));
 writeFileSync(`${output}/audit.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({after:report.after,candidatePairs:report.candidatePairs.map(p=>({pair:p.pair,status:p.status,crossings:p.properCrossings,contacts:p.contacts})),mechanicalStatus:report.mechanicalStatus},null,2));
}
