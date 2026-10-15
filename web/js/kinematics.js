/**
 * 双轮差速运动学仿真引擎 (kinematics.js)
 * 纯数学模型，根据左右轮归一化速度实时积分推算车体姿态、轮子自转与地面轨迹。
 */

export class DifferentialKinematics {
  constructor(options = {}) {
    this.wheelBase = options.wheelBase || 0.184;     // 轮距 L (米)
    this.wheelRadius = options.wheelRadius || 0.035; // 轮子有效滚动半径 R (米)
    this.maxSpeed = options.maxSpeed || 0.55;        // 最大线速度 (米/秒)
    this.maxTrajectoryPoints = options.maxTrajectoryPoints || 350;

    // 机器人世界位姿 (右手系：Y 向上，地面在 X-Z 平面，默认车头朝向 +Z 轴)
    this.x = 0;
    this.z = 0;
    this.yaw = 0; // 航向角 (弧度，绕 Y 轴)

    // 左右轮当前的归一化目标速度与平滑实际速度 [-1.0, 1.0]
    this.targetLeft = 0;
    this.targetRight = 0;
    this.actualLeft = 0;
    this.actualRight = 0;

    // 左右轮累计自转角度 (弧度)
    this.wheelRotLeft = 0;
    this.wheelRotRight = 0;

    // 运动历史轨迹点集合 [{x, z}]
    this.trajectory = [];
    this.lastRecordDistSq = 0;
  }

  /** 设置左右轮目标速度 [-1.0, 1.0] */
  setWheelSpeeds(left, right) {
    this.targetLeft = Math.max(-1.0, Math.min(1.0, left));
    this.targetRight = Math.max(-1.0, Math.min(1.0, right));
  }

  /** 重置位姿与轨迹到原点 */
  resetPose() {
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.targetLeft = 0;
    this.targetRight = 0;
    this.actualLeft = 0;
    this.actualRight = 0;
    this.wheelRotLeft = 0;
    this.wheelRotRight = 0;
    this.trajectory = [];
  }

  /** 动力学物理步进更新 (dt 单位秒) */
  update(dt) {
    // 限制单帧最大 dt 防止后台切换标签卡顿时积分爆炸
    const clampedDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;

    // 电机转速一阶低通惯性响应模拟 (模拟真实电机加速曲线)
    const filterAlpha = 1.0 - Math.exp(-clampedDt * 12.0);
    this.actualLeft += (this.targetLeft - this.actualLeft) * filterAlpha;
    this.actualRight += (this.targetRight - this.actualRight) * filterAlpha;
    if (this.targetLeft === 0 && Math.abs(this.actualLeft) < 1e-6) this.actualLeft = 0;
    if (this.targetRight === 0 && Math.abs(this.actualRight) < 1e-6) this.actualRight = 0;

    // 计算两侧轮子的线速度 (m/s)
    const vL = this.actualLeft * this.maxSpeed;
    const vR = this.actualRight * this.maxSpeed;

    // 双轮差速运动学方程 (正解)
    // 车体中心线速度 v = (vR + vL) / 2
    // +Y 正旋转把 +Z 转向 +X；右轮更快时应负 yaw，朝 -X 左偏。
    const linearV = (vR + vL) * 0.5;
    const angularW = (vL - vR) / this.wheelBase;

    // 中点二阶 Runge-Kutta 姿态更新
    const midYaw = this.yaw + (angularW * clampedDt * 0.5);
    // 车头默认沿 +Z 方向，旋转后位移在地面投影：
    // delta_x = v * sin(midYaw) * dt
    // delta_z = v * cos(midYaw) * dt
    this.x += linearV * Math.sin(midYaw) * clampedDt;
    this.z += linearV * Math.cos(midYaw) * clampedDt;
    this.yaw += angularW * clampedDt;

    // 前进对应绕 +X 自转：底部接触点的旋转速度朝 -Z，抵消车体 +Z 平移。
    // 轮子自转增量 delta_phi = (v * dt) / R
    const dPhiL = (vL * clampedDt) / this.wheelRadius;
    const dPhiR = (vR * clampedDt) / this.wheelRadius;
    this.wheelRotLeft += dPhiL;
    this.wheelRotRight += dPhiR;

    // 记录轨迹点 (当发生明显位移时压入历史队列)
    const lastPoint = this.trajectory.at(-1);
    let distSq = 999;
    if (lastPoint) {
      const dx = this.x - lastPoint.x;
      const dz = this.z - lastPoint.z;
      distSq = dx * dx + dz * dz;
    }

    if (distSq > 0.0004) { // 每移动 2 厘米记录一个点
      this.trajectory.push({ x: this.x, z: this.z });
      if (this.trajectory.length > this.maxTrajectoryPoints) {
        this.trajectory.shift();
      }
    }

    return {
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      vL,
      vR,
      linearV,
      angularW,
      wheelRotLeft: this.wheelRotLeft,
      wheelRotRight: this.wheelRotRight,
      actualLeft: this.actualLeft,
      actualRight: this.actualRight,
      trajectory: this.trajectory
    };
  }
}
