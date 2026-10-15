import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

const document=parseDocument(readFileSync('.github/workflows/verify-and-package.yml','utf8'),{uniqueKeys:true});
const workflow=document.toJS();

test('CI YAML与触发范围有效，不使用高权限PR事件',()=>{
  assert.deepEqual(document.errors,[]);
  assert.deepEqual(Object.keys(workflow.on).sort(),['pull_request','push','workflow_dispatch']);
  assert.deepEqual(workflow.permissions,{'contents':'read'});
  for(const job of Object.values(workflow.jobs)){
    assert.equal(job.permissions,undefined);
    assert.equal(job['continue-on-error'],undefined);
    for(const step of job.steps)assert.equal(step['continue-on-error'],undefined);
  }
});

test('CI第三方Actions仅使用核验过的官方固定提交，不保留checkout凭据',()=>{
  const steps=workflow.jobs.verify.steps;
  for(const step of steps.filter(step=>step.uses))assert.match(step.uses,/^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  const checkout=steps.find(step=>step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'],false);
});

test('源码产物只在成功后打包，CI证据隔离且短期保留',()=>{
  const steps=workflow.jobs.verify.steps;
  const bundle=steps.find(step=>step.run?.includes('git archive'));
  assert.ok(bundle);
  assert.equal(bundle.if,undefined); // GitHub默认success()，不能改成always()
  const source=steps.find(step=>step.with?.name?.startsWith('verified-source-'));
  assert.ok(source);
  assert.equal(source.if,undefined);
  assert.equal(source.with['if-no-files-found'],'error');
  const evidence=steps.find(step=>step.with?.name?.startsWith('validation-evidence-'));
  assert.equal(evidence.with.path,'.tmp/ci/');
  for(const step of [source,evidence]){
    assert.equal(step.with['retention-days'],7);
    assert.equal(step.with['include-hidden-files'],true);
    assert.match(step.with.path,/^\.tmp\/(ci|package)\/$/);
  }
  const browser=steps.find(step=>step.run?.includes('scripts/browser_check.mjs'));
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/v1/);
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/v2-p0/);
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/v2-p1/);
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/model-editor/);
  assert.ok(browser.run.includes('scripts/model_repair_check.mjs'));
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/inferred-assembly/);
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/hero-comparison/);
  assert.ok(browser.run.includes('scripts/hero_comparison_check.mjs'));
  assert.match(browser.run,/OUTPUT_DIR=\.tmp\/ci\/robot-viewer/);
  assert.ok(browser.run.includes('scripts/robot_viewer_check.mjs'));
  const models=steps.find(step=>step.run?.includes('scripts/validate_models.mjs'));
  assert.ok(models.run.includes('scripts/hero_assembly_audit.mjs'));
  assert.match(models.run,/OUTPUT_DIR=\.tmp\/ci\/hero-assembly/);
  assert.ok(steps.indexOf(browser)<steps.indexOf(bundle));
  assert.ok(steps.indexOf(models)<steps.indexOf(bundle));
  assert.ok(browser.run.includes('git diff --exit-code'));
});
