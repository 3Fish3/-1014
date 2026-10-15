import test from 'node:test';
import assert from 'node:assert/strict';
import { DifferentialKinematics } from '../web/js/kinematics.js';
function run(l,r){const k=new DifferentialKinematics();k.setWheelSpeeds(l,r);for(let i=0;i<120;i++)k.update(1/120);return k;}
test('同速前进与倒退',()=>{const f=run(.5,.5),b=run(-.5,-.5);assert.ok(f.z>0&&b.z<0);assert.ok(Math.abs(f.x)<1e-9);assert.equal(f.yaw,0);});
test('右轮快向左(-X)；左轮快向右(+X)',()=>{const l=run(.2,.6),r=run(.6,.2);assert.ok(l.x<0&&l.yaw<0);assert.ok(r.x>0&&r.yaw>0);});
test('原地转中心不平移',()=>{const k=run(-.5,.5);assert.equal(k.x,0);assert.equal(k.z,0);assert.ok(k.yaw<0);});
test('停止与重置',()=>{const k=run(.5,.6);k.resetPose();assert.equal(k.x,0);assert.equal(k.yaw,0);assert.equal(k.targetLeft,0);assert.equal(k.trajectory.length,0);});
test('暂停步进不改变状态；轨迹有界',()=>{const k=run(.5,.5),x=k.z;k.update(0);assert.equal(k.z,x);for(let i=0;i<20000;i++)k.update(.01);assert.ok(k.trajectory.length<=k.maxTrajectoryPoints);});
test('帧率变化积分近似一致',()=>{const a=new DifferentialKinematics(),b=new DifferentialKinematics();a.setWheelSpeeds(.4,.6);b.setWheelSpeeds(.4,.6);for(let i=0;i<120;i++)a.update(1/120);for(let i=0;i<60;i++)b.update(1/60);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.01);});
