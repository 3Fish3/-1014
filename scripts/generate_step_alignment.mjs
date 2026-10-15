// Restore the Yaw children's true CAD-local transforms; do not compensate twice.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as T from '../web/vendor/three/three.module.js';
import {parseGlb, getNodeTransform, writeGlbTransforms} from '../web/js/model-editor/glb-transform-writer.js';
import {sha256, createPatch} from '../web/js/model-editor/repair-patch.js';
import {validateExport} from '../web/js/model-editor/validation.js';

const sourceHash = 'f2eefd1ee718e8c0bebd7490968d5b62b4f99a6b640e57905bb3ef940c374baf';
const stepHash = '315e57be2f96ca55d345b29515488a206bdffdfeee76937ce58bef22b288be5b';
// Reviewed physical-import evidence. Runtime timing/RSS are excluded, never CAD geometry.
const reviewedEvidenceHash = '4a99ce3eb719fa8cc3c261ac850109e6ae937b6f27245018bcd7a0a36b46e05d';
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
const matrix = row => new T.Matrix4().set(...row.flat());
const trs = node => {const t=getNodeTransform(node);return new T.Matrix4().compose(new T.Vector3(...t.translation),new T.Quaternion(...t.rotation),new T.Vector3(...t.scale));};
const maxError = (a,b) => Math.max(...a.elements.map((v,i)=>Math.abs(v-b.elements[i])));
const one = rows => {if(rows.length!==1)throw new Error(`必须唯一匹配，实际${rows.length}项`);return rows[0];};
const position = m => new T.Vector3().setFromMatrixPosition(m);

export async function buildStepAlignment(bytes, assembly, cad) {
  if(await sha256(bytes)!==sourceHash)throw new Error('GLB源哈希不符');
  if(assembly.source.sha256!==stepHash)throw new Error('STEP源哈希不符');
  if(cad.units!=='mm'||!cad.importedChildren?.length)throw new Error('缺少独立CAD导入证据');
  if(!assembly.extractedSha256||cad.inputSha256!==assembly.extractedSha256)throw new Error('CAD导入与本次STEP提取哈希不一致');
  const parsed=parseGlb(bytes),d=parsed.document;
  const parent=new Map();d.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
  const world=i=>parent.has(i)?world(parent.get(i)).multiply(trs(d.nodes[i])):trs(d.nodes[i]);
  if(d.nodes[549]?.name!=='Yaw轴装配体2.1改'||parent.get(549)!==543||parent.get(543)!==389)throw new Error('目标层级不符');
  if(maxError(trs(d.nodes[549]),new T.Matrix4())>1e-12)throw new Error('源目标组不是单位变换');
  const yaw=one(assembly.instances.filter(r=>r.name==='yaw轴3改'));
  const group=one(assembly.instances.filter(r=>r.name==='Yaw轴装配体2.1改'));
  if(group.occurrences.length!==yaw.occurrences.length+1||!yaw.occurrences.every((o,i)=>o===group.occurrences[i]))throw new Error('STEP目标不在指定Yaw之下');
  const instances=assembly.instances.filter(r=>r.name==='yaw轴3改'||(r.occurrences.length>=group.occurrences.length&&group.occurrences.every((o,i)=>o===r.occurrences[i])));
  const cadEvidence=Object.fromEntries(Object.entries(cad).filter(([key])=>!['seconds','peakRssKiB'].includes(key)));
  const evidenceHash=await sha256(new TextEncoder().encode(JSON.stringify(stable({sourceSha256:assembly.source.sha256,extractedSha256:assembly.extractedSha256,instances,cad:cadEvidence}))));
  if(evidenceHash!==reviewedEvidenceHash)throw new Error('已审查STEP矩阵或实体证据内容变化，需重新核验，不能只保留自报哈希');
  const stepYawWorld=matrix(yaw.worldMatrix),stepGroupWorld=matrix(group.worldMatrix);
  const groupRelative=stepYawWorld.clone().invert().multiply(stepGroupWorld);
  if(maxError(groupRelative,new T.Matrix4())>1e-9)throw new Error('STEP组相对Yaw不是单位变换，需重新评估');
  const sourceYawWorld=world(543),origin=position(sourceYawWorld);
  const linear=sourceYawWorld.clone().setPosition(0,0,0);
  if(maxError(linear,new T.Matrix4())>1e-9)throw new Error('原Yaw父链存在旋转/缩放，当前映射不适用');
  // Verify 1000 mm/m using several independent local thicknesses, not vehicle bounds.
  const dimensionChecks=[];
  for(const [node,key,component] of [[547,'plate',1],[552,'bearing',1],[551,'driven',2]]) {
    const p=d.meshes[d.nodes[node].mesh].primitives[0];const a=d.accessors[p.attributes.POSITION];
    const glbMm=(a.max[component]-a.min[component])*1000;
    const bounds=cad.parts[key].bounds;const cadMm=bounds[4]-bounds[1];
    if(Math.abs(glbMm-cadMm)>1e-4)throw new Error('独立厚度不支持毫米/米转换');
    dimensionChecks.push({node,glbThicknessMm:glbMm,cadThicknessMm:cadMm,errorMm:Math.abs(glbMm-cadMm)});
  }
  const stepChildren=assembly.instances.filter(r=>r.occurrences.length===group.occurrences.length+1&&group.occurrences.every((o,i)=>o===r.occurrences[i]));
  const indices=d.nodes[549].children;
  if(indices.length!==11||stepChildren.length!==11||cad.importedChildren.length!==11)throw new Error('子件数量变化，拒绝盲目对应');
  const used=new Set(),edits=[],mapping=[];
  for(const index of indices) {
    const original=getNodeTransform(d.nodes[index]);
    const expectedPosition=new T.Vector3(...original.translation).sub(origin).multiplyScalar(1000);
    const expectedRotation=new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion(...original.rotation));
    const possible=cad.importedChildren.filter(c=>{
      if(!c.valid||c.solids!==1)return false;
      const m=matrix([c.localMatrix]);
      return position(m).distanceTo(expectedPosition)<.001&&maxError(m.clone().setPosition(0,0,0),expectedRotation)<1e-5;
    });
    const match=one(possible);
    if(used.has(match.object))throw new Error('不同GLB子件对应同一CAD实体');used.add(match.object);
    const local=matrix([match.localMatrix]);
    const stepPart=one(stepChildren.filter(r=>{
      const relative=stepGroupWorld.clone().invert().multiply(matrix(r.worldMatrix));
      return maxError(relative,local)<1e-8;
    }));
    // Names are an independent guard; imported duplicate suffixes are not IDs.
    const tail=d.nodes[index].name.split('/').at(-1).replace(/-\d+$/,'');
    const named=stepPart.name===tail||(tail==='2023英雄标准件-圆头螺栓-M4'&&stepPart.name==='2023英雄标准件-圆头螺栓-M4_25');
    if(!named)throw new Error(`几何匹配但零件名称不同: ${tail} / ${stepPart.name}`);
    const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();local.decompose(p,q,s);
    if(s.toArray().some(v=>Math.abs(v-1)>1e-9))throw new Error('CAD局部变换含缩放');
    const transform={translation:p.multiplyScalar(.001).toArray(),rotation:q.normalize().toArray(),scale:original.scale};
    edits.push({nodeIndex:index,transform});
    const after=sourceYawWorld.clone().multiply(trs(transform));
    const stepGlobal=matrix(stepPart.worldMatrix);stepGlobal.setPosition(position(stepGlobal).multiplyScalar(.001));
    mapping.push({nodeIndex:index,name:d.nodes[index].name,cadName:stepPart.name,cadObject:match.object,
      stepDefinition:stepPart.definition,stepOccurrences:stepPart.occurrences,
      stepWorldMatrixMm:stepPart.worldMatrix,cadLocalMatrixMm:match.localMatrix,
      oldLocalVsCadAfterCommonOffsetMm:expectedPosition.distanceTo(position(local)),
      parserVsImporterMatrixMaxError:maxError(stepGroupWorld.clone().invert().multiply(matrix(stepPart.worldMatrix)),local),
      cleanWorldPositionErrorMm:position(world(index)).distanceTo(position(stepGlobal))*1000,
      alignedWorldPositionErrorMm:position(after).distanceTo(position(stepGlobal))*1000});
  }
  const output=writeGlbTransforms(parsed,edits);validateExport(parsed,output,edits);
  const note='按整车5.STEP的Yaw局部装配恢复子件变换；保留几何、原父组与显示比例。已核对STEP位置，不代表整车或同步带设计机械认证。';
  const patch=await createPatch(parsed,edits,'hero_robot_clean.glb',note,false);
  patch.stepEvidence={filename:'整车5.STEP',sha256:stepHash,scope:'Yaw local placement only',mechanicallyCertified:false};
  const report={sourceGlbSha256:sourceHash,sourceStepSha256:stepHash,extractedStepSha256:assembly.extractedSha256,reviewedEvidenceSha256:evidenceHash,candidateSha256:await sha256(output),
    scope:'11 direct children of Yaw group 549 only',units:{step:'mm',glb:'m',stepToGlb:.001},
    preservedOriginalParents:true,preservedOriginalScale:true,geometryBufferUnchanged:true,
    unchangedGroup549Transform:true,dimensionChecks,mapping,
    maxParserImporterMatrixError:Math.max(...mapping.map(r=>r.parserVsImporterMatrixMaxError)),
    maxAlignedWorldPositionErrorMm:Math.max(...mapping.map(r=>r.alignedWorldPositionErrorMm)),
    exactWorldDifferenceReason:'Unedited GLB ancestor translations were rounded during original export; CAD-local placements restored exactly, original scale retained.',
    cadMetrics:cad.metrics,matchedMountingHoles:cad.matchedHoleCount,unmatchedBearingHoles:cad.unmatchedHoleCount,
    limitations:cad.limitations,verifiedAgainstCAD:false,stepPlacementValidated:true,mechanicallyCertified:false};
  if(report.maxAlignedWorldPositionErrorMm>.001||report.maxParserImporterMatrixError>1e-8)throw new Error('恢复后放置误差超出本次数值一致性阈值（非制造公差）');
  return {bytes:output,patch,report};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  const input=process.argv[2]||'.tmp/step-alignment';
  const assembly=JSON.parse(readFileSync(`${input}/assembly.json`));
  const cad=JSON.parse(readFileSync(`${input}/cad-audit.json`));
  const sourceStep=process.argv[3]||assembly.source.path;
  if(await sha256(readFileSync(sourceStep))!==stepHash)throw new Error('实际STEP文件哈希不符');
  if(await sha256(readFileSync(`${input}/yaw-reference.step`))!==assembly.extractedSha256)throw new Error('实际提取文件哈希不符');
  const result=await buildStepAlignment(readFileSync('web/models/hero_robot_clean.glb'),assembly,cad);
  mkdirSync('web/models/repairs',{recursive:true});mkdirSync(`${input}`,{recursive:true});
  writeFileSync('web/models/hero_robot_step_aligned.glb',result.bytes);
  writeFileSync('web/models/repairs/yaw-step-aligned.json',JSON.stringify(result.patch,null,2));
  writeFileSync(`${input}/alignment-report.json`,JSON.stringify(result.report,null,2));
  console.log(JSON.stringify({changedNodes:result.report.mapping.map(r=>r.nodeIndex),maxWorldPositionErrorMm:result.report.maxAlignedWorldPositionErrorMm,candidateSha256:result.report.candidateSha256},null,2));
 } catch(error) {
  console.error(`STEP候选生成失败：${error.message}`);
  process.exitCode=1;
 }
}
