import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStepAlignment} from '../scripts/generate_step_alignment.mjs';
import {parseGlb,getNodeTransform} from '../web/js/model-editor/glb-transform-writer.js';
import {validatePatch,sha256} from '../web/js/model-editor/repair-patch.js';
const bytes=readFileSync('web/models/hero_robot_clean.glb');
const assembly=JSON.parse(readFileSync('docs/model-editor/step-alignment/assembly-reference.json'));
const cad=JSON.parse(readFileSync('docs/model-editor/step-alignment/cad-audit.json'));
const changed=Array.from({length:11},(_,i)=>i+550);
const build=(a=assembly,c=cad)=>buildStepAlignment(bytes,a,c);

test('STEP局部恢复仅修改11个子件，549和所有其他JSON保持原样，BIN逐字节一致',async()=>{
 const result=await build(),source=parseGlb(bytes),target=parseGlb(result.bytes);
 assert.deepEqual(result.report.mapping.map(r=>r.nodeIndex),changed);
 const expected=structuredClone(source.document);
 for(const i of changed)expected.nodes[i]=target.document.nodes[i];
 assert.deepEqual(target.document,expected);
 assert.deepEqual(target.document.nodes[549],source.document.nodes[549]);
 const chunks=parsed=>parsed.chunks.filter(c=>c.type!==0x4e4f534a).map(c=>({type:c.type,data:Buffer.from(c.data)}));
 assert.deepEqual(chunks(source),chunks(target));
 for(const i of changed)assert.deepEqual(getNodeTransform(target.document.nodes[i]).scale,getNodeTransform(source.document.nodes[i]).scale);
 assert.deepEqual((await validatePatch(source,result.patch)).map(r=>r.nodeIndex),changed);
 assert.equal(result.patch.stepEvidence.sha256,assembly.source.sha256);
 assert.ok(result.patch.edits.every(e=>e.verifiedAgainstCAD===false));
});
test('独立Importer与STEP变换一致，候选保留旧父组舍入误差并可重复重建',async()=>{
 const result=await build();
 assert.ok(result.report.maxParserImporterMatrixError<1e-8);
 assert.ok(result.report.maxAlignedWorldPositionErrorMm<.001);
 assert.ok(result.report.maxAlignedWorldPositionErrorMm>0);
 assert.ok(result.report.mapping.every(m=>m.cleanWorldPositionErrorMm>1000));
 assert.equal(await sha256(result.bytes),await sha256(readFileSync('web/models/hero_robot_step_aligned.glb')));
 assert.equal(result.report.stepPlacementValidated,true);assert.equal(result.report.mechanicallyCertified,false);
});
test('STEP和原GLB及局部提取文件哈希严格绑定',async()=>{
 const damaged=Buffer.from(bytes);damaged[damaged.length-1]^=1;
 await assert.rejects(buildStepAlignment(damaged,assembly,cad),/GLB源哈希/);
 const a=structuredClone(assembly);a.source.sha256='0'.repeat(64);
 await assert.rejects(build(a),/STEP源哈希/);
 const c=structuredClone(cad);c.inputSha256='0'.repeat(64);
 await assert.rejects(build(assembly,c),/提取哈希不一致/);
});
test('单位或局部几何尺寸不匹配时不生成候选',async()=>{
 const c=structuredClone(cad);c.units='m';await assert.rejects(build(assembly,c),/CAD导入证据/);
 c.units='mm';c.parts.plate.bounds[4]+=1;await assert.rejects(build(assembly,c),/证据内容变化/);
});
test('实体无效、重复对应和名称冲突均拒绝，不能只按外观映射',async()=>{
 const bad=structuredClone(cad);bad.importedChildren[0].valid=false;
 await assert.rejects(build(assembly,bad),/证据内容变化/);
 const duplicate=structuredClone(cad);duplicate.importedChildren[1]=structuredClone(duplicate.importedChildren[0]);
 await assert.rejects(build(assembly,duplicate),/证据内容变化/);
 const a=structuredClone(assembly);a.instances.find(r=>r.name==='从动齿轮  2M45齿').name='错误零件';
 await assert.rejects(build(a),/证据内容变化/);
});
test('原CAD局部矩阵错位不能偷偷用包围盒或旧补偿接受',async()=>{
 const c=structuredClone(cad);c.importedChildren[0].localMatrix[3]+=2;
 await assert.rejects(build(assembly,c),/证据内容变化/);
 const a=structuredClone(assembly);a.instances.find(r=>r.name==='从动齿轮  2M45齿').worldMatrix[0][3]+=1;
 await assert.rejects(build(a),/证据内容变化/);
});
test('协同篡改两份矩阵且保留自报哈希也必须拒绝；计时/RSS变化不影响重建',async()=>{
 const a=structuredClone(assembly),c=structuredClone(cad);
 const part=c.importedChildren.find(p=>p.name==='从动齿轮  2M45齿');
 part.localMatrix[3]+=.0001;
 a.instances.find(r=>r.name==='从动齿轮  2M45齿').worldMatrix[0][3]+=.0001;
 assert.equal(a.source.sha256,assembly.source.sha256);assert.equal(c.inputSha256,cad.inputSha256);
 await assert.rejects(build(a,c),/证据内容变化/);
 const timing=structuredClone(cad);timing.seconds+=1;timing.peakRssKiB+=100;
 assert.equal((await build(assembly,timing)).report.reviewedEvidenceSha256,(await build()).report.reviewedEvidenceSha256);
});
test('CAD报告保留同步带轴向偏差和未匹配孔，不把局部吻合说成全机械认证',()=>{
 assert.ok(Math.abs(cad.metrics.pulleyAxisDistanceMm-115)<1e-8);
 assert.ok(Math.abs(cad.metrics.axialEnvelopeCenterOffsetMm-3)<1e-8);
 assert.equal(cad.matchedHoleCount,6);assert.equal(cad.unmatchedHoleCount,6);
 assert.equal(cad.intersections.length,9);assert.ok(cad.intersections.every(r=>r.bothValidSolids));
 assert.ok(cad.intersections.every(r=>Math.abs(r.commonVolumeMm3)<1e-8));
});
