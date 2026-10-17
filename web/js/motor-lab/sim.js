/**
 * Motor Lab 离线虚拟仿真纯逻辑模块 (sim.js)
 * 严格离线确定性逻辑，纯状态驱动，无任何真实硬件/网络/DOM依赖。
 * 遵循 M3508 + C620 官方协议规范与教学抽象。
 */

/** 7条关键电气与信号拓扑链路 */
export const LINKS = Object.freeze([
  'supply-center',
  'center-controller',
  'center-esc',
  'controller-can',
  'esc-can',
  'esc-phases',
  'esc-data'
]);

/** M3508 官方额定减速比 (约 19.2:1) */
export const REDUCTION_RATIO = 3591 / 187;

/** 线路中文描述映射（用于诊断信息输出） */
export const LINK_DESCRIPTIONS = Object.freeze({
  'supply-center': '主电源到中心板供电线 (supply-center)',
  'center-controller': '中心板到控制器供电线 (center-controller)',
  'center-esc': '中心板到电调供电线 (center-esc)',
  'controller-can': '控制器CAN总线通信线 (controller-can)',
  'esc-can': '电调CAN总线通信线 (esc-can)',
  'esc-phases': '电调到电机三相动力线 (esc-phases)',
  'esc-data': '电调到电机传感器数据线 (esc-data)'
});

/** 硬件模拟故障中文描述 */
export const FAULT_DESCRIPTIONS = Object.freeze({
  none: '正常无故障',
  can: 'CAN总线通信中断故障',
  power: '供电电压跌落/中断故障',
  data: '电机编码器传感器数据线断开故障',
  phases: '电机三相动力线缺相故障'
});

/**
 * 创建全新的可序列化仿真状态对象
 * @returns {Object}
 */
export function createState() {
  return {
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
  };
}

/**
 * 连接指定链路
 * @param {Object} state
 * @param {string} id
 * @returns {{ok: boolean, reason: string}}
 */
export function connect(state, id) {
  if (!state || !Array.isArray(state.connections)) {
    return { ok: false, reason: '状态对象无效' };
  }
  if (!LINKS.includes(id)) {
    return { ok: false, reason: `非法连接标识符: ${id}` };
  }
  if (state.connections.includes(id)) {
    return { ok: false, reason: `该链路已连接: ${id}` };
  }
  state.connections.push(id);
  return { ok: true, reason: '' };
}

/**
 * 断开指定链路
 * @param {Object} state
 * @param {string} id
 * @returns {{ok: boolean, reason: string}}
 */
export function disconnect(state, id) {
  if (!state || !Array.isArray(state.connections)) {
    return { ok: false, reason: '状态对象无效' };
  }
  const idx = state.connections.indexOf(id);
  if (idx !== -1) {
    state.connections.splice(idx, 1);
    return { ok: true, reason: '' };
  }
  return { ok: false, reason: `链路未连接: ${id}` };
}

/**
 * 自动连接全部7条标准线路（调用同一connect接口）
 * @param {Object} state
 */
export function autoConnect(state) {
  if (!state) return;
  for (const id of LINKS) {
    connect(state, id);
  }
}

/**
 * 原对象原地恢复初始状态
 * @param {Object} state
 * @returns {Object} 原状态对象引用
 */
export function reset(state) {
  if (!state || typeof state !== 'object') return createState();
  const fresh = createState();
  for (const key of Object.keys(state)) {
    if (!(key in fresh)) {
      delete state[key];
    }
  }
  Object.assign(state, fresh);
  return state;
}

/**
 * 诊断当前系统运行条件，若存在阻塞则返回中文原因数组
 * @param {Object} state
 * @returns {string[]}
 */
export function diagnose(state) {
  if (!state || typeof state !== 'object') {
    return ['状态对象无效'];
  }
  const issues = [];

  // 1. 检查电源状态
  if (!state.power) {
    issues.push('主电源未开启 (系统处于断电状态)');
  }

  // 2. 检查7条关键拓扑连接
  const connections = Array.isArray(state.connections) ? state.connections : [];
  for (const id of LINKS) {
    if (!connections.includes(id)) {
      issues.push(`线路未连接: 缺少 ${LINK_DESCRIPTIONS[id] || id}`);
    }
  }

  // 3. 检查CAN设备ID与控制指令ID合法性 (必须为 1..8 整数) 及匹配
  const isMotorIdValid = Number.isInteger(state.motorId) && state.motorId >= 1 && state.motorId <= 8;
  const isCommandIdValid = Number.isInteger(state.commandId) && state.commandId >= 1 && state.commandId <= 8;

  if (!isMotorIdValid) {
    issues.push(`CAN硬件ID非法: 电机电调ID必须为1至8之间的整数，当前为: ${state.motorId}`);
  }
  if (!isCommandIdValid) {
    issues.push(`CAN指令ID非法: 控制指令ID必须为1至8之间的整数，当前为: ${state.commandId}`);
  }
  if (state.motorId !== state.commandId) {
    issues.push(`CAN设备ID不匹配: 电调电机硬件ID(${state.motorId})与指令控制ID(${state.commandId})不一致`);
  }

  // 4. 检查硬件模拟故障
  if (state.fault && state.fault !== 'none') {
    issues.push(`存在硬件故障: ${FAULT_DESCRIPTIONS[state.fault] || state.fault}`);
  }

  return issues;
}

/**
 * 确定性物理时间步进更新
 * @param {Object} state
 * @param {number} dt 步进时间 (秒)，强制限制在 [0, 0.1]
 * @returns {Object} state
 */
export function step(state, dt) {
  if (!state || typeof state !== 'object') return state;

  // 1. 时间裁剪与有限性验证
  const clampedDt = (typeof dt === 'number' && Number.isFinite(dt)) ? Math.max(0, Math.min(0.1, dt)) : 0;

  // 2. 确保各数值状态有限
  if (!Number.isFinite(state.rotorRpm)) state.rotorRpm = 0;
  if (!Number.isFinite(state.angle)) state.angle = 0;
  if (!Number.isFinite(state.elapsed)) state.elapsed = 0;

  // 3. 目标RPM范围限制 (±3000 RPM)
  const rawTarget = Number.isFinite(state.targetRpm) ? state.targetRpm : 0;
  const clampedTarget = Math.max(-3000, Math.min(3000, rawTarget));

  // 4. 运行条件判定
  const issues = diagnose(state);
  const isOperating = Boolean(state.running) && issues.length === 0;
  const effectiveTarget = isOperating ? clampedTarget : 0;

  // 5. 电机转子转速一阶响应模型 (教学近似，无真实参数标定)
  // 时间常数 tau 约 0.1s (响应滤波系数 alpha = 1 - exp(-dt * 10))
  const filterAlpha = 1.0 - Math.exp(-clampedDt * 10.0);
  state.rotorRpm += (effectiveTarget - state.rotorRpm) * filterAlpha;

  // 减速至微小残余值时直接归零
  if (effectiveTarget === 0 && Math.abs(state.rotorRpm) < 1e-4) {
    state.rotorRpm = 0;
  }

  // 6. 角度与累计时间积分更新
  // 转子每分钟转数转换为弧度/秒: rotorRpm * 2*pi / 60
  state.elapsed += clampedDt;
  state.angle += (state.rotorRpm * (2 * Math.PI / 60)) * clampedDt;

  // 7. 最终数值有限性防线
  if (!Number.isFinite(state.rotorRpm)) state.rotorRpm = 0;
  if (!Number.isFinite(state.angle)) state.angle = 0;
  if (!Number.isFinite(state.elapsed)) state.elapsed = 0;

  return state;
}

/**
 * 编码 RoboMaster C620 CAN 控制帧
 * 遵循 C620 官方协议：ID 1..4 发送到 0x200，ID 5..8 发送到 0x1FF
 * @param {number} raw 电流控制量 raw [-16384, 16384]
 * @param {number} id 电机电调设备ID [1, 8]，默认为 1
 * @returns {{id: number, data: number[]}}
 */
export function encodeC620(raw, id = 1) {
  if (!Number.isInteger(id) || id < 1 || id > 8) {
    throw new RangeError(`C620 设备ID必须为 1 到 8 之间的整数，收到: ${id}`);
  }
  if (!Number.isInteger(raw) || raw < -16384 || raw > 16384) {
    throw new RangeError(`C620 控制量 raw 必须为 -16384 到 16384 之间的整数，收到: ${raw}`);
  }

  const canId = id <= 4 ? 0x200 : 0x1FF;
  const slot = id <= 4 ? (id - 1) : (id - 5);
  const data = [0, 0, 0, 0, 0, 0, 0, 0];

  // 计算 16 位补码并拆分为高低字节
  const uint16 = (raw < 0 ? raw + 65536 : raw) & 0xFFFF;
  data[slot * 2] = (uint16 >> 8) & 0xFF;
  data[slot * 2 + 1] = uint16 & 0xFF;

  return { id: canId, data };
}

/**
 * 解析教学控制程序脚本（严格语法白名单）
 * 支持语句：
 * - set_target_rpm(1, <signed integer>);
 * - start_motor(1);
 * - stop_motor(1);
 * 任意其他输入、未加分号、非ID1、超限RPM、注入脚本等均严格拒绝。
 * @param {string} text
 * @returns {{ok: boolean, targetRpm: number, running: boolean, error: string}}
 */
export function parseProgram(text) {
  if (typeof text !== 'string') {
    return { ok: false, targetRpm: 0, running: false, error: '程序输入必须为字符串' };
  }
  if (text.length > 2000) {
    return { ok: false, targetRpm: 0, running: false, error: '程序长度超出上限（最多2000字符）' };
  }
  const lines = text.split(/\r?\n/);
  if (lines.length > 50) {
    return { ok: false, targetRpm: 0, running: false, error: '程序行数超出上限（最多50行）' };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, targetRpm: 0, running: false, error: '程序内容为空，至少需要包含一条有效指令' };
  }
  if (!trimmed.endsWith(';')) {
    return { ok: false, targetRpm: 0, running: false, error: '语法错误：每条命令必须以英文分号 (;) 结尾' };
  }

  // 按分号切分语句
  const rawStatements = trimmed.split(';').map(s => s.trim()).filter(s => s.length > 0);
  if (rawStatements.length === 0) {
    return { ok: false, targetRpm: 0, running: false, error: '未包含有效命令' };
  }

  let targetRpm = 0;
  let running = false;
  let commandCount = 0;

  const SET_RPM_REGEX = /^set_target_rpm\(\s*([^,\s]+)\s*,\s*([^,\s]+)\s*\)$/;
  const START_MOTOR_REGEX = /^start_motor\(\s*([^,\s]+)\s*\)$/;
  const STOP_MOTOR_REGEX = /^stop_motor\(\s*([^,\s]+)\s*\)$/;

  for (const rawStmt of rawStatements) {
    // 压缩多余空格与换行
    const stmt = rawStmt.replace(/\s+/g, ' ');

    if (SET_RPM_REGEX.test(stmt)) {
      const match = stmt.match(SET_RPM_REGEX);
      const idStr = match[1];
      const rpmStr = match[2];

      if (idStr !== '1') {
        return { ok: false, targetRpm: 0, running: false, error: `不支持的电机设备ID: "${idStr}"，当前环境仅支持控制电机ID 1` };
      }

      if (!/^[+-]?\d+$/.test(rpmStr)) {
        return { ok: false, targetRpm: 0, running: false, error: `目标RPM必须为整数，收到: "${rpmStr}"` };
      }

      const parsedRpm = Number.parseInt(rpmStr, 10);
      if (!Number.isFinite(parsedRpm) || parsedRpm < -3000 || parsedRpm > 3000) {
        return { ok: false, targetRpm: 0, running: false, error: `目标RPM超出允许范围 [-3000, 3000]，收到: ${parsedRpm}` };
      }

      targetRpm = parsedRpm;
      commandCount++;
    } else if (START_MOTOR_REGEX.test(stmt)) {
      const match = stmt.match(START_MOTOR_REGEX);
      const idStr = match[1];
      if (idStr !== '1') {
        return { ok: false, targetRpm: 0, running: false, error: `不支持的电机设备ID: "${idStr}"，当前环境仅支持控制电机ID 1` };
      }
      running = true;
      commandCount++;
    } else if (STOP_MOTOR_REGEX.test(stmt)) {
      const match = stmt.match(STOP_MOTOR_REGEX);
      const idStr = match[1];
      if (idStr !== '1') {
        return { ok: false, targetRpm: 0, running: false, error: `不支持的电机设备ID: "${idStr}"，当前环境仅支持控制电机ID 1` };
      }
      running = false;
      commandCount++;
    } else {
      return { ok: false, targetRpm: 0, running: false, error: `未知指令或非法语法: "${rawStmt}"` };
    }
  }

  if (commandCount === 0) {
    return { ok: false, targetRpm: 0, running: false, error: '未包含有效命令' };
  }

  return { ok: true, targetRpm, running, error: '' };
}
