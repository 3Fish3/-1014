import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import validator from 'gltf-validator';
import {buildCandidate,sourceFile,candidateFile,patchFile} from '../scripts/generate_assembly_candidate.mjs';
import {parseGlb} from '../web/js/model-editor/glb-transform-writer.js';
import {validatePatch} from '../web/js/model-editor/repair-patch.js';
import {validateExport} from '../web/js/model-editor/validation.js';

test('推定补偿只改549组平移，所有子件和BIN保持原样，候选可确定性重建',async()=>{
 const original=readFileSync(sourceFile),result=await buildCandidate(original);
 assert.deepEqual(new Uint8Array(readFileSync(candidateFile)),result.bytes);
 assert.deepEqual(JSON.parse(readFileSync(patchFile,'utf8')),result.patch);
 const parsed=parseGlb(original),edits=await validatePatch(parsed,result.patch);
 assert.deepEqual(edits.map(e=>e.nodeIndex),[549]);
 validateExport(parsed,result.bytes,edits);
 const after=parseGlb(result.bytes);
 for(let i=0;i<parsed.document.nodes.length;i++)if(i!==549)assert.deepEqual(after.document.nodes[i],parsed.document.nodes[i]);
 assert.equal(result.patch.edits[0].verifiedAgainstCAD,false);
 assert.deepEqual(result.patch.edits[0].original.translation,[0,0,0]);
 assert.deepEqual(result.patch.edits[0].repaired.translation,[-1.280010819,-1.367624966,-1.386149849]);
 const issues=(await validator.validateBytes(result.bytes)).issues;
 assert.equal(issues.numErrors,0);assert.equal(issues.numWarnings,0);
});
test('推定接口几何支持重复偏移假设，但不凭几何断言机械已认证',async()=>{
 const {evidence}=await buildCandidate(readFileSync(sourceFile));
 assert.ok(Math.abs(evidence.contactGap)<1e-6);
 assert.ok(Math.hypot(...evidence.bearingAxisOffsetXZ)<1e-6);
 assert.equal(evidence.holes.length,4);
 assert.ok(evidence.holes.every(h=>h.nearestBolt.distance<.0001));
 assert.ok(evidence.driveAndDrivenYOverlap>.007);
 assert.equal(evidence.verifiedAgainstCAD,false);
 assert.ok(evidence.limitations.length>=3);
});
test('源文件哈希变化时拒绝生成历史坐标补偿',async()=>{
 const bytes=new Uint8Array(readFileSync(sourceFile));bytes[bytes.length-1]^=1;
 await assert.rejects(()=>buildCandidate(bytes),/哈希变化/);
});
