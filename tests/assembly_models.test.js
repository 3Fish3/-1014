import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {ASSEMBLY_MODELS,assemblyKind} from '../web/js/assembly-models.js';

test('默认STEP、原样和旧推定三态精确映射，未知参数不回落原样',()=>{
 assert.deepEqual(Object.keys(ASSEMBLY_MODELS).sort(),['inferred','original','step']);
 for(const value of [null,undefined,'','unknown','toString','__proto__'])assert.equal(assemblyKind(value),'step');
 for(const value of ['step','original','inferred'])assert.equal(assemblyKind(value),value);
 assert.equal(ASSEMBLY_MODELS.step.url,'./models/hero_robot_step_aligned.glb');
 assert.equal(ASSEMBLY_MODELS.original.url,'./models/hero_robot_clean.glb');
 assert.equal(ASSEMBLY_MODELS.inferred.url,'./models/hero_robot_inferred.glb');
 for(const model of Object.values(ASSEMBLY_MODELS))assert.ok(existsSync(`web/${model.url}`));
});
test('默认页面与课堂提供STEP入口，不改V1或工作台的原始源模型',()=>{
 const html=readFileSync('web/ui-v2.html','utf8');
 for(const value of ['step','original','inferred'])assert.match(html,new RegExp(`<option value="${value}"`));
 assert.match(readFileSync('web/viewer_full.html','utf8'),/STEP对齐版/);
 assert.match(readFileSync('web/js/model-editor/main.js','utf8'),/hero_robot_clean\.glb/);
 const models=readFileSync('scripts/validate_models.mjs','utf8');assert.match(models,/hero_robot_step_aligned/);
});
