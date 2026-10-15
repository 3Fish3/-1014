import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../web/vendor/three/three.module.js';
import {parseGlb,writeGlbTransforms} from '../web/js/model-editor/glb-transform-writer.js';
import {validateExport} from '../web/js/model-editor/validation.js';
import {checkedTransform,applyTransform} from '../web/js/model-editor/model-loader.js';

const bytes=readFileSync('web/models/hero_robot_clean.glb');

test('原始课程模型SHA256固定且不被编辑器修改',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'f2eefd1ee718e8c0bebd7490968d5b62b4f99a6b640e57905bb3ef940c374baf');
});
test('真实整车变换导出保持非目标结构与所有二进制chunk',()=>{
 const parsed=parseGlb(bytes),before=JSON.stringify(parsed.document);
 const edits=[{nodeIndex:1,transform:{translation:[1,2,3],rotation:[0,0,0,1],scale:[1,1,1]}}];
 const out=writeGlbTransforms(parsed,edits);
 const target=validateExport(parsed,out,edits);
 assert.equal(target.document.nodes.length,574);
 assert.equal(JSON.stringify(parsed.document),before);
 assert.deepEqual(target.document.nodes[2],parsed.document.nodes[2]);
});
test('世界轴编辑拒绝不可逆/非等比父变换；等比父链下保留局部变换',()=>{
 const parent=new THREE.Object3D(),child=new THREE.Object3D();parent.add(child);
 const transform={translation:[.2,.3,.4],rotation:[0,0,0,1],scale:[1,1,1]};
 applyTransform(child,transform);
 assert.deepEqual(checkedTransform(child,[1,1,1]),transform);
 parent.scale.set(1,2,1);parent.updateMatrixWorld(true);
 assert.throws(()=>checkedTransform(child,[1,1,1]),/非均匀/);
 parent.scale.set(-1,1,1);parent.updateMatrixWorld(true);
 assert.throws(()=>checkedTransform(child,[1,1,1]),/镜像反射/);
 parent.scale.set(0,0,0);parent.updateMatrixWorld(true);
 assert.throws(()=>checkedTransform(child,[1,1,1]),/不可逆/);
});
