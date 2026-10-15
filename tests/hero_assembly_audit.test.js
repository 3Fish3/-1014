import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../web/vendor/three/three.module.js';
import {parseGlb} from '../web/js/model-editor/glb-transform-writer.js';
import {checkAabbIntersection,classifyTriangleIntersection,auditMeshInterpenetration,auditAssembly,geometryReader} from '../scripts/hero_assembly_audit.mjs';
import {sourceFile,candidateFile} from '../scripts/generate_assembly_candidate.mjs';
const tri=points=>points.map(p=>new T.Vector3(...p));
const a=tri([[0,0,0],[2,0,0],[0,2,0]]),b=tri([[.5,.2,-1],[.5,1.2,1],[.5,1.2,-1]]);
const mesh=triangles=>{const vertices=triangles.flat();return {vertices,triangles:triangles.map((_,i)=>[i*3,i*3+1,i*3+2]),bounds:new T.Box3().setFromPoints(vertices)};};

test('穿插检测区分真正交叉、边接触、共面接触和平面内分离',()=>{
 assert.equal(classifyTriangleIntersection(a,b),'proper-surface-crossing');
 assert.equal(classifyTriangleIntersection(a,tri([[.5,.2,0],[.5,1.2,0],[.5,.8,1]])),'edge-contact');
 assert.equal(classifyTriangleIntersection(a,tri([[.2,.2,0],[.4,.2,0],[.2,.4,0]])),'coplanar-contact');
 assert.equal(classifyTriangleIntersection(a,tri([[1.4,1.4,0],[3,1.4,0],[1.4,3,0]])),'separated');
 assert.equal(classifyTriangleIntersection(a,tri([[0,0,1],[2,0,1],[0,2,1]])),'separated');
 assert.equal(classifyTriangleIntersection(a,tri([[0,0,0],[0,0,0],[0,0,0]])),'degenerate');
});
test('AABB初筛不是穿模结论，真正表面相交才标记需复核',()=>{
 const left=mesh([a]),crossing=mesh([b]),apart=mesh([b.map(p=>p.clone().addScalar(10))]);
 assert.equal(checkAabbIntersection(left.bounds,apart.bounds),false);
 assert.equal(auditMeshInterpenetration(left,apart).status,'aabb-separated');
 const hit=auditMeshInterpenetration(left,crossing);
 assert.equal(hit.status,'surface-crossing-review-required');assert.equal(hit.properCrossings,1);
});
test('遍历包含第100项以后的三角形，不以静默抽样宣称无穿插',()=>{
 const triangles=Array.from({length:120},(_,i)=>a.map(p=>p.clone().add(new T.Vector3(10+i*3,0,0))));triangles.push(a);
 const result=auditMeshInterpenetration(mesh(triangles),mesh([b]));
 assert.equal(result.trianglePairsVisited,121);assert.equal(result.properCrossings,1);
 assert.equal(result.examples[0].triangles[0],120);
});
test('完全包含且无表面交线时返回unknown，不能声称接触或碰撞安全',()=>{
 const cube=size=>{const geometry=new T.BoxGeometry(size,size,size),p=geometry.attributes.position;const vertices=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i));const triangles=[];for(let i=0;i<geometry.index.count;i+=3)triangles.push([0,1,2].map(j=>geometry.index.getX(i+j)));geometry.dispose();return {vertices,triangles,bounds:new T.Box3().setFromPoints(vertices)};};
 const result=auditMeshInterpenetration(cube(2),cube(.4));
 assert.equal(result.status,'aabb-overlap-unknown-containment');assert.equal(result.properCrossings,0);assert.equal(result.contacts,0);
});
test('候选读取真实世界矩阵，不重复减549已包含的平移',()=>{
 const reader=geometryReader(parseGlb(readFileSync(candidateFile)));
 const bearing=reader.geometry(552).bounds,plate=reader.geometry(547).bounds;
 assert.ok(Math.abs(bearing.min.y-plate.max.y)<1e-6);
 assert.ok(Math.abs(bearing.min.y-1.36722493)<1e-6);
});
test('真实资产审计有限覆盖10对、全部计数、不修改未经认证状态',async()=>{
 const report=await auditAssembly(readFileSync(sourceFile),readFileSync(candidateFile));
 assert.equal(report.verifiedAgainstCAD,false);assert.equal(report.coverage.triangleSampling,false);
 assert.equal(report.candidatePairs.length,10);assert.ok(Math.abs(report.after.contactGap)<1e-6);
 assert.ok(Math.hypot(...report.after.bearingAxisOffsetXZ)<1e-6);assert.ok(report.after.axisParallelError<1e-12);
 assert.ok(Math.abs(report.after.driveDrivenAxisDistanceXZ-.115)<1e-6);
 for(const pair of report.candidatePairs)if(pair.aabbIntersected)assert.equal(pair.trianglePairsVisited,pair.totalTrianglePairs);
 assert.ok(report.candidatePairs.find(p=>p.pair[0]===552&&p.pair[1]===547).contacts>0);
});
