import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINKS,
  REDUCTION_RATIO,
  createState,
  connect,
  disconnect,
  autoConnect,
  reset,
  diagnose,
  step,
  encodeC620,
  parseProgram
} from '../web/js/motor-lab/sim.js';

test('LINKS 合同与减速比常量', () => {
  assert.equal(LINKS.length, 7);
  assert.deepEqual([...LINKS], [
    'supply-center',
    'center-controller',
    'center-esc',
    'controller-can',
    'esc-can',
    'esc-phases',
    'esc-data'
  ]);
  // 减速比 3591 / 187
  assert.equal(REDUCTION_RATIO, 3591 / 187);
});

test('createState 返回初始状态且可JSON序列化', () => {
  const s = createState();
  assert.deepEqual(s, {
    connections: [],
    power: false,
    running: false,
    targetRpm: 0,
    rotorRpm: 0,
    angle: 0,
    motorId: 1,
    commandId: 1,
    fault: 'none',
    elapsed: 0
  });

  const json = JSON.stringify(s);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, s);
});

test('connect / disconnect 拓扑增删与非法防护', () => {
  const s = createState();

  // 合法连接
  const r1 = connect(s, 'supply-center');
  assert.equal(r1.ok, true);
  assert.equal(r1.reason, '');
  assert.deepEqual(s.connections, ['supply-center']);

  // 重复连接
  const r2 = connect(s, 'supply-center');
  assert.equal(r2.ok, false);
  assert.ok(r2.reason.length > 0);
  assert.equal(s.connections.length, 1);

  // 非法连接标识
  const r3 = connect(s, 'unknown-wire');
  assert.equal(r3.ok, false);
  assert.ok(r3.reason.includes('非法'));
  assert.equal(s.connections.length, 1);

  // 正常断开
  const r4 = disconnect(s, 'supply-center');
  assert.equal(r4.ok, true);
  assert.equal(s.connections.length, 0);

  // 重复断开
  const r5 = disconnect(s, 'supply-center');
  assert.equal(r5.ok, false);
});

test('autoConnect 与手动连接状态等价且幂等', () => {
  const sAuto = createState();
  autoConnect(sAuto);
  assert.equal(sAuto.connections.length, 7);

  const sManual = createState();
  for (const link of LINKS) {
    const res = connect(sManual, link);
    assert.equal(res.ok, true);
  }
  assert.deepEqual(sAuto.connections, sManual.connections);

  // 再次 autoConnect 保持幂等
  autoConnect(sAuto);
  assert.equal(sAuto.connections.length, 7);
});

test('reset 恢复原对象引用与初态', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;
  s.targetRpm = 1500;
  s.rotorRpm = 1200;
  s.angle = 12.5;
  s.motorId = 3;
  s.commandId = 3;
  s.fault = 'can';
  s.elapsed = 5.2;

  const returned = reset(s);
  assert.equal(returned, s); // 必须是原对象指针
  assert.deepEqual(s, createState());
});

test('diagnose 覆盖缺线、断电、ID不匹配与故障阻塞', () => {
  const s = createState();

  // 初态：断电且缺少全部 7 条线
  const initIssues = diagnose(s);
  assert.ok(initIssues.some(msg => msg.includes('电源未开启')));
  assert.equal(initIssues.filter(msg => msg.includes('线路未连接')).length, 7);

  // 补齐连接但未上电
  autoConnect(s);
  const powerOffIssues = diagnose(s);
  assert.equal(powerOffIssues.length, 1);
  assert.ok(powerOffIssues[0].includes('电源未开启'));

  // 上电且无故障，诊断通过
  s.power = true;
  assert.deepEqual(diagnose(s), []);

  // 逐线断开测试
  for (const link of LINKS) {
    disconnect(s, link);
    const issues = diagnose(s);
    assert.ok(issues.some(msg => msg.includes(link)));
    connect(s, link);
  }
  assert.deepEqual(diagnose(s), []);

  // ID 不匹配与合法性 (1..8 整数) 诊断
  // 1) 两者不同但合法 -> 报不匹配
  s.motorId = 1;
  s.commandId = 2;
  const idMismatch = diagnose(s);
  assert.ok(idMismatch.some(msg => msg.includes('ID不匹配')));

  // 2) 两者相同但非法 -> 必须报非法且阻塞
  const invalidCases = [
    [0, 0],
    [9, 9],
    [-1, -1],
    [1.5, 1.5],
    ['1', '1'],
    [NaN, NaN],
    [null, null],
    [undefined, undefined]
  ];
  for (const [mId, cId] of invalidCases) {
    s.motorId = mId;
    s.commandId = cId;
    const issues = diagnose(s);
    assert.ok(issues.length > 0, `ID (${mId}, ${cId}) 应产生阻塞`);
    assert.ok(issues.some(msg => msg.includes('ID非法')));
  }

  // 3) 合法 ID 1 与 ID 8 均无阻塞
  s.motorId = 1;
  s.commandId = 1;
  assert.deepEqual(diagnose(s), []);

  s.motorId = 8;
  s.commandId = 8;
  assert.deepEqual(diagnose(s), []);

  // fault 枚举阻塞
  for (const faultType of ['can', 'power', 'data', 'phases']) {
    s.fault = faultType;
    const fIssues = diagnose(s);
    assert.ok(fIssues.some(msg => msg.includes('硬件故障')));
  }
  s.fault = 'none';
  assert.deepEqual(diagnose(s), []);
});

test('step 正常一阶平滑运转与转速/角度更新', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;
  s.targetRpm = 1000;

  // 单帧更新
  step(s, 0.02);
  assert.ok(s.rotorRpm > 0 && s.rotorRpm < 1000);
  assert.ok(s.angle > 0);
  assert.equal(s.elapsed, 0.02);

  // 持续运转逼近目标
  for (let i = 0; i < 60; i++) {
    step(s, 0.02);
  }
  assert.ok(Math.abs(s.rotorRpm - 1000) < 1.0);
  assert.ok(s.angle > 0);
});

test('step 目标RPM裁剪到 ±3000', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;

  // 正向超限
  s.targetRpm = 5000;
  for (let i = 0; i < 100; i++) step(s, 0.05);
  assert.ok(s.rotorRpm <= 3000.01);
  assert.ok(Math.abs(s.rotorRpm - 3000) < 0.1);

  // 负向超限
  s.targetRpm = -4500;
  for (let i = 0; i < 150; i++) step(s, 0.05);
  assert.ok(s.rotorRpm >= -3000.01);
  assert.ok(Math.abs(s.rotorRpm - (-3000)) < 0.1);
});

test('step 断线/断电/故障/stop 时平滑渐减至 0', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;
  s.targetRpm = 2000;

  // 先加速至稳态
  for (let i = 0; i < 80; i++) step(s, 0.02);
  assert.ok(s.rotorRpm > 1950);

  // 1. 停止电机 -> 渐减
  s.running = false;
  step(s, 0.05);
  assert.ok(s.rotorRpm < 1950);
  for (let i = 0; i < 150; i++) step(s, 0.05);
  assert.equal(s.rotorRpm, 0);

  // 2. 重新启动后拔掉 CAN 线 -> 渐减
  s.running = true;
  for (let i = 0; i < 80; i++) step(s, 0.02);
  assert.ok(s.rotorRpm > 1950);
  disconnect(s, 'esc-can');
  for (let i = 0; i < 150; i++) step(s, 0.05);
  assert.equal(s.rotorRpm, 0);

  // 3. 重新连线、注入故障 -> 渐减
  connect(s, 'esc-can');
  for (let i = 0; i < 80; i++) step(s, 0.02);
  assert.ok(s.rotorRpm > 1950);
  s.fault = 'power';
  for (let i = 0; i < 150; i++) step(s, 0.05);
  assert.equal(s.rotorRpm, 0);
});

test('step dt 时间裁剪与有限数值安全防线', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;
  s.targetRpm = 1000;

  // dt < 0 裁剪为 0，状态不变
  step(s, -0.5);
  assert.equal(s.elapsed, 0);
  assert.equal(s.rotorRpm, 0);
  assert.equal(s.angle, 0);

  // dt > 0.1 裁剪为 0.1
  step(s, 0.8);
  assert.equal(s.elapsed, 0.1);

  // dt 为 NaN / 非数字
  step(s, NaN);
  assert.equal(s.elapsed, 0.1);
  step(s, 'invalid');
  assert.equal(s.elapsed, 0.1);

  // 异常注入非有限值时自动恢复有限
  s.rotorRpm = Infinity;
  s.angle = NaN;
  s.elapsed = -Infinity;
  step(s, 0.01);
  assert.ok(Number.isFinite(s.rotorRpm));
  assert.ok(Number.isFinite(s.angle));
  assert.ok(Number.isFinite(s.elapsed));
});

test('encodeC620 分组、槽位、补码与边界抛错', () => {
  // ID 1: 0x200 槽位 0
  const f1 = encodeC620(1000, 1);
  assert.equal(f1.id, 0x200);
  assert.deepEqual(f1.data, [0x03, 0xE8, 0, 0, 0, 0, 0, 0]);

  // ID 2: 0x200 槽位 1, 负数补码 -1000 -> 0xFC18
  const f2 = encodeC620(-1000, 2);
  assert.equal(f2.id, 0x200);
  assert.deepEqual(f2.data, [0, 0, 0xFC, 0x18, 0, 0, 0, 0]);

  // ID 4: 0x200 槽位 3, 0
  const f4 = encodeC620(0, 4);
  assert.equal(f4.id, 0x200);
  assert.deepEqual(f4.data, [0, 0, 0, 0, 0, 0, 0, 0]);

  // ID 5: 0x1FF 槽位 0, 16384 -> 0x4000
  const f5 = encodeC620(16384, 5);
  assert.equal(f5.id, 0x1FF);
  assert.deepEqual(f5.data, [0x40, 0x00, 0, 0, 0, 0, 0, 0]);

  // ID 8: 0x1FF 槽位 3, -16384 -> 0xC000
  const f8 = encodeC620(-16384, 8);
  assert.equal(f8.id, 0x1FF);
  assert.deepEqual(f8.data, [0, 0, 0, 0, 0, 0, 0xC0, 0x00]);

  // 默认 id = 1
  const fDef = encodeC620(500);
  assert.equal(fDef.id, 0x200);
  assert.equal(fDef.data[0], 0x01);
  assert.equal(fDef.data[1], 0xF4);

  // 非法 ID 抛出 RangeError
  assert.throws(() => encodeC620(100, 0), RangeError);
  assert.throws(() => encodeC620(100, 9), RangeError);
  assert.throws(() => encodeC620(100, 1.5), RangeError);

  // 非法 raw 抛出 RangeError
  assert.throws(() => encodeC620(16385, 1), RangeError);
  assert.throws(() => encodeC620(-16385, 1), RangeError);
  assert.throws(() => encodeC620(100.5, 1), RangeError);
});

test('parseProgram 正常指令语法与解析', () => {
  // 单命令
  const r1 = parseProgram('start_motor(1);');
  assert.deepEqual(r1, { ok: true, targetRpm: 0, running: true, error: '' });

  // 组合命令与带符号整数
  const prog2 = `
    set_target_rpm(1, 1500);
    start_motor(1);
  `;
  const r2 = parseProgram(prog2);
  assert.deepEqual(r2, { ok: true, targetRpm: 1500, running: true, error: '' });

  // 负转速与停止
  const prog3 = `
    set_target_rpm(1, -2000);
    start_motor(1);
    stop_motor(1);
  `;
  const r3 = parseProgram(prog3);
  assert.deepEqual(r3, { ok: true, targetRpm: -2000, running: false, error: '' });

  // 单行紧凑语句
  const r4 = parseProgram('set_target_rpm(1, 800); start_motor(1);');
  assert.deepEqual(r4, { ok: true, targetRpm: 800, running: true, error: '' });
});

test('parseProgram 严格白名单与注入/越界防护', () => {
  // 必须以分号结尾
  const rNoSemi = parseProgram('set_target_rpm(1, 1000)');
  assert.equal(rNoSemi.ok, false);
  assert.ok(rNoSemi.error.includes('分号'));

  // 仅支持 ID 1
  const rId2 = parseProgram('set_target_rpm(2, 1000);');
  assert.equal(rId2.ok, false);
  assert.ok(rId2.error.includes('1'));

  const rStart2 = parseProgram('start_motor(2);');
  assert.equal(rStart2.ok, false);

  const rStop3 = parseProgram('stop_motor(3);');
  assert.equal(rStop3.ok, false);

  // RPM 超过 ±3000
  const rOver = parseProgram('set_target_rpm(1, 3001);');
  assert.equal(rOver.ok, false);
  assert.ok(rOver.error.includes('3000'));

  const rUnder = parseProgram('set_target_rpm(1, -3001);');
  assert.equal(rUnder.ok, false);
  assert.ok(rUnder.error.includes('3000'));

  // 浮点数拒绝
  const rFloat = parseProgram('set_target_rpm(1, 100.5);');
  assert.equal(rFloat.ok, false);

  // 代码注入与危险调用拒绝
  assert.equal(parseProgram('eval("1+1");').ok, false);
  assert.equal(parseProgram('Function("return 1")();').ok, false);
  assert.equal(parseProgram('console.log(1);').ok, false);
  assert.equal(parseProgram('let a = 1;').ok, false);
  assert.equal(parseProgram('set_target_rpm(1, 1000); evil();').ok, false);

  // 空指令与非字符串
  assert.equal(parseProgram('').ok, false);
  assert.equal(parseProgram('   ').ok, false);
  assert.equal(parseProgram(';;;').ok, false);
  assert.equal(parseProgram(null).ok, false);
  assert.equal(parseProgram(123).ok, false);

  // 超过最大长度 / 最大行数边界
  // 正好 50 行 -> 允许
  const lines50 = Array(49).fill('').concat(['start_motor(1);']).join('\n');
  assert.equal(lines50.split('\n').length, 50);
  assert.equal(parseProgram(lines50).ok, true);

  // 51 行 -> 拒绝
  const lines51 = Array(50).fill('').concat(['start_motor(1);']).join('\n');
  assert.equal(lines51.split('\n').length, 51);
  assert.equal(parseProgram(lines51).ok, false);

  // 正好 2000 字符 -> 允许
  const baseCmd = 'start_motor(1);';
  const spaces = ' '.repeat(2000 - baseCmd.length);
  const prog2000 = spaces + baseCmd;
  assert.equal(prog2000.length, 2000);
  assert.equal(parseProgram(prog2000).ok, true);

  // 2001 字符 -> 拒绝
  const prog2001 = prog2000 + ' ';
  assert.equal(prog2001.length, 2001);
  assert.equal(parseProgram(prog2001).ok, false);
});

test('step 受ID合法性严格阻断与合法1/8驱动验证', () => {
  const s = createState();
  autoConnect(s);
  s.power = true;
  s.running = true;
  s.targetRpm = 1000;

  // 相同非法 ID (例如同为 0 或 9 或 '1') 阻断步进
  for (const badId of [0, 9, NaN, '1', 2.5]) {
    s.motorId = badId;
    s.commandId = badId;
    s.rotorRpm = 0;
    step(s, 0.05);
    assert.equal(s.rotorRpm, 0, `非法ID ${badId} 不应启动`);
  }

  // 合法 ID 1 可正常运行
  s.motorId = 1;
  s.commandId = 1;
  for (let i = 0; i < 60; i++) step(s, 0.02);
  assert.ok(s.rotorRpm > 900);

  // 合法 ID 8 可正常运行
  s.rotorRpm = 0;
  s.motorId = 8;
  s.commandId = 8;
  for (let i = 0; i < 60; i++) step(s, 0.02);
  assert.ok(s.rotorRpm > 900);
});
