#!/usr/bin/env python3
"""
生成 RoboMaster 电控入门课·第二章专用的简化双轮差速教学小车三维模型 (diff_car_teaching.glb)
各功能模块作为独立具名节点，且驱动轮与电机的旋转中心严格对齐局部原点，
确保在 Web 端进行旋转动画与差速仿真时精确绕轮轴自转，绝不发生车身公转。
"""

import sys
from pathlib import Path
from typing import Any

import numpy as np
import trimesh
import trimesh.visual


def set_color(mesh: Any, color: list[int]) -> Any:
    """为三维网格赋予 RGBA 颜色"""
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=color)
    return mesh


def create_diff_car():
    scene = trimesh.Scene()

    # 材质颜色规范 (RGBA, 0-255)
    COLOR_FRAME = [38, 45, 58, 255]         # 碳素/亚克力车架底板
    COLOR_STANDOFF = [205, 175, 85, 255]    # 黄铜支撑柱
    COLOR_TIRE = [22, 22, 24, 255]          # 黑色橡胶防滑轮胎
    COLOR_RIM = [215, 220, 230, 255]        # 铝合金银白轮毂
    COLOR_CASTER = [190, 195, 205, 255]     # 金属万向从动滚珠
    COLOR_CASTER_MOUNT = [65, 70, 80, 255]  # 万向轮固定法兰
    COLOR_MOTOR_BOX = [235, 185, 25, 255]   # 黄色减速齿轮箱
    COLOR_MOTOR_BODY = [165, 170, 180, 255] # 金属电机马达筒
    COLOR_SHAFT = [220, 225, 235, 255]      # 轮轴联轴器
    COLOR_DRIVER_PCB = [185, 30, 40, 255]   # 红色双 H 桥电机驱动板
    COLOR_HEATSINK = [35, 40, 50, 255]      # 黑色铝制散热鳍片
    COLOR_TERMINAL = [30, 155, 55, 255]     # 绿色接线端子排
    COLOR_BATTERY = [25, 85, 195, 255]      # 蓝色动力锂电池组 (2S/3S)
    COLOR_XT30 = [245, 205, 15, 255]        # 动力 XT30 接插件
    COLOR_BUCK_PCB = [20, 120, 70, 255]     # 绿色 DC-DC 降压稳压板
    COLOR_INDUCTOR = [40, 40, 45, 255]      # 屏蔽功率电感
    COLOR_STM32_PCB = [16, 45, 125, 255]    # 经典深蓝 STM32 核心板
    COLOR_CHIP = [12, 12, 15, 255]          # 黑色主控芯片 (MCU)
    COLOR_PIN_HEADER = [215, 185, 45, 255]  # 金色双排排针
    COLOR_WIRE_POWER = [230, 50, 30, 255]   # 红色高压供电正极
    COLOR_WIRE_GND = [18, 18, 22, 255]      # 黑色供电地线
    COLOR_WIRE_5V = [240, 140, 20, 255]     # 橙色 5V 稳压供电线
    COLOR_WIRE_SIGNAL = [0, 210, 230, 255]  # 青色控制信号线 (PWM/DIR)

    # --------------------------------------------------------------------------
    # 1. 车架模块 (Node_Frame)
    # --------------------------------------------------------------------------
    frame_lower = set_color(trimesh.creation.box(extents=[0.16, 0.005, 0.22]), COLOR_FRAME)
    frame_lower.apply_translation([0, 0, 0])

    standoffs = []
    for sx, sz in [(-0.06, 0.06), (0.06, 0.06), (-0.06, -0.06), (0.06, -0.06)]:
        # 圆柱沿 Z 轴生成，绕 X 轴旋转 90 度转到 Y 轴 (垂直方向)
        so = set_color(trimesh.creation.cylinder(radius=0.003, height=0.035, sections=16), COLOR_STANDOFF)
        so.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        so.apply_translation([sx, 0.02, sz])
        standoffs.append(so)

    # 教学开窗上框，避免实心上板遮住电池；不是结构强度设计。
    rails = []
    for x, z, extent in [(-.066, 0, [.008,.004,.16]), (.066,0,[.008,.004,.16]), (0,-.076,[.14,.004,.008]), (0,.076,[.14,.004,.008])]:
        rail = set_color(trimesh.creation.box(extents=extent), COLOR_FRAME)
        rail.apply_translation([x,.038,z])
        rails.append(rail)
    frame_upper = trimesh.util.concatenate(rails)

    frame_mesh = trimesh.util.concatenate([frame_lower, frame_upper] + standoffs)
    scene.add_geometry(frame_mesh, node_name="Node_Frame")

    # --------------------------------------------------------------------------
    # 2. 左右驱动轮 (独立几何在局部原点 (0,0,0)，旋转轴完全沿 X 轴)
    # --------------------------------------------------------------------------
    # 轮子半径 0.035m, 胎宽 0.018m. 圆柱沿 Z 生成，绕 Y 轴旋转 90 度使轴心对齐 X 轴
    def make_wheel_local():
        tire = set_color(trimesh.creation.cylinder(radius=0.035, height=0.018, sections=36), COLOR_TIRE)
        tire.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))

        rim = set_color(trimesh.creation.cylinder(radius=0.022, height=0.019, sections=36), COLOR_RIM)
        rim.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))

        shaft_hub = set_color(trimesh.creation.cylinder(radius=0.006, height=0.024, sections=16), COLOR_SHAFT)
        shaft_hub.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))

        return trimesh.util.concatenate([tire, rim, shaft_hub])

    # 左驱动轮：安装在 X = -0.092m 处
    left_wheel_geom = make_wheel_local()
    trans_left = trimesh.transformations.translation_matrix([-0.092, 0, 0])
    scene.add_geometry(left_wheel_geom, node_name="Node_LeftWheel", transform=trans_left)

    # 右驱动轮：安装在 X = +0.092m 处
    right_wheel_geom = make_wheel_local()
    trans_right = trimesh.transformations.translation_matrix([0.092, 0, 0])
    scene.add_geometry(right_wheel_geom, node_name="Node_RightWheel", transform=trans_right)

    # --------------------------------------------------------------------------
    # 3. 前后辅助万向支撑轮 (Node_Casters)
    # --------------------------------------------------------------------------
    casters = []
    for cz in [0.085, -0.085]:
        mount = set_color(trimesh.creation.box(extents=[0.025, 0.015, 0.025]), COLOR_CASTER_MOUNT)
        mount.apply_translation([0, -0.01, cz])
        ball = set_color(trimesh.creation.icosphere(radius=0.015, subdivisions=2), COLOR_CASTER)
        ball.apply_translation([0, -0.02, cz])
        casters.extend([mount, ball])
    caster_mesh = trimesh.util.concatenate(casters)
    scene.add_geometry(caster_mesh, node_name="Node_Casters")

    # --------------------------------------------------------------------------
    # 4. 左右驱动电机 (轴心对齐 X 轴，直驱轮轴)
    # --------------------------------------------------------------------------
    def make_motor_local(is_left: bool):
        # 减速箱主体
        box_m = set_color(trimesh.creation.box(extents=[0.028, 0.024, 0.040]), COLOR_MOTOR_BOX)
        # 电机马达筒 (沿 Z 轴向后布置)
        cyl_m = set_color(trimesh.creation.cylinder(radius=0.011, height=0.038, sections=24), COLOR_MOTOR_BODY)
        cyl_m.apply_translation([0, 0, -0.038])
        # 输出驱动联轴器 (沿 X 轴向外延伸，直插车轮轴心)
        shaft = set_color(trimesh.creation.cylinder(radius=0.003, height=0.015, sections=16), COLOR_SHAFT)
        shaft.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
        shaft_offset_x = -0.018 if is_left else 0.018
        shaft.apply_translation([shaft_offset_x, 0, 0])
        return trimesh.util.concatenate([box_m, cyl_m, shaft])

    left_motor = make_motor_local(is_left=True)
    trans_lm = trimesh.transformations.translation_matrix([-0.065, 0, 0])
    scene.add_geometry(left_motor, node_name="Node_LeftMotor", transform=trans_lm)

    right_motor = make_motor_local(is_left=False)
    trans_rm = trimesh.transformations.translation_matrix([0.065, 0, 0])
    scene.add_geometry(right_motor, node_name="Node_RightMotor", transform=trans_rm)

    # --------------------------------------------------------------------------
    # 5. 电机驱动器 (Node_MotorDriver, 双 H 桥功率驱动板)
    # --------------------------------------------------------------------------
    driver_pcb = set_color(trimesh.creation.box(extents=[0.052, 0.002, 0.048]), COLOR_DRIVER_PCB)
    driver_heatsink = set_color(trimesh.creation.box(extents=[0.024, 0.018, 0.030]), COLOR_HEATSINK)
    driver_heatsink.apply_translation([0, 0.01, 0])
    # 左右电机输出端子
    term_l = set_color(trimesh.creation.box(extents=[0.012, 0.01, 0.014]), COLOR_TERMINAL)
    term_l.apply_translation([-0.020, 0.006, 0])
    term_r = set_color(trimesh.creation.box(extents=[0.012, 0.01, 0.014]), COLOR_TERMINAL)
    term_r.apply_translation([0.020, 0.006, 0])
    # 动力供电输入端子
    term_pwr = set_color(trimesh.creation.box(extents=[0.018, 0.01, 0.012]), COLOR_TERMINAL)
    term_pwr.apply_translation([0, 0.006, -0.018])
    driver_mesh = trimesh.util.concatenate([driver_pcb, driver_heatsink, term_l, term_r, term_pwr])
    trans_driver = trimesh.transformations.translation_matrix([0, 0.042, -0.035])
    scene.add_geometry(driver_mesh, node_name="Node_MotorDriver", transform=trans_driver)

    # --------------------------------------------------------------------------
    # 6. 电池模块 (Node_Battery)
    # --------------------------------------------------------------------------
    battery_pack = set_color(trimesh.creation.box(extents=[0.048, 0.026, 0.085]), COLOR_BATTERY)
    xt30 = set_color(trimesh.creation.box(extents=[0.008, 0.006, 0.014]), COLOR_XT30)
    xt30.apply_translation([0, 0.012, 0.044])
    battery_mesh = trimesh.util.concatenate([battery_pack, xt30])
    trans_bat = trimesh.transformations.translation_matrix([0, 0.016, 0.045])
    scene.add_geometry(battery_mesh, node_name="Node_Battery", transform=trans_bat)

    # --------------------------------------------------------------------------
    # 7. 稳压模块 (Node_BuckConverter, 电池->稳压->主控，解决电源电压不匹配问题)
    # --------------------------------------------------------------------------
    buck_pcb = set_color(trimesh.creation.box(extents=[0.025, 0.002, 0.035]), COLOR_BUCK_PCB)
    inductor = set_color(trimesh.creation.box(extents=[0.012, 0.008, 0.012]), COLOR_INDUCTOR)
    inductor.apply_translation([0, 0.005, 0])
    pot = set_color(trimesh.creation.box(extents=[0.006, 0.006, 0.006]), COLOR_RIM)
    pot.apply_translation([0, 0.004, 0.010])
    buck_mesh = trimesh.util.concatenate([buck_pcb, inductor, pot])
    trans_buck = trimesh.transformations.translation_matrix([-0.045, 0.042, 0.015])
    scene.add_geometry(buck_mesh, node_name="Node_BuckConverter", transform=trans_buck)

    # --------------------------------------------------------------------------
    # 8. STM32 主控板 (Node_STM32)
    # --------------------------------------------------------------------------
    stm32_pcb = set_color(trimesh.creation.box(extents=[0.055, 0.002, 0.045]), COLOR_STM32_PCB)
    chip = set_color(trimesh.creation.box(extents=[0.014, 0.003, 0.014]), COLOR_CHIP)
    chip.apply_translation([0, 0.0025, 0])
    crystal = set_color(trimesh.creation.cylinder(radius=0.002, height=0.008, sections=12), COLOR_RIM)
    crystal.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    crystal.apply_translation([0.014, 0.003, -0.006])
    pin_left = set_color(trimesh.creation.box(extents=[0.003, 0.008, 0.038]), COLOR_PIN_HEADER)
    pin_left.apply_translation([-0.024, 0.005, 0])
    pin_right = set_color(trimesh.creation.box(extents=[0.003, 0.008, 0.038]), COLOR_PIN_HEADER)
    pin_right.apply_translation([0.024, 0.005, 0])
    usb_port = set_color(trimesh.creation.box(extents=[0.008, 0.004, 0.008]), COLOR_RIM)
    usb_port.apply_translation([0, 0.003, -0.020])
    stm32_mesh = trimesh.util.concatenate([stm32_pcb, chip, crystal, pin_left, pin_right, usb_port])
    trans_stm32 = trimesh.transformations.translation_matrix([0.015, 0.042, 0.038])
    scene.add_geometry(stm32_mesh, node_name="Node_STM32", transform=trans_stm32)

    # --------------------------------------------------------------------------
    # 9. 线路布线系统（端点连接的教学拓扑，并非实际安全接线图）
    # --------------------------------------------------------------------------
    # (a) 动力供电线: 电池 -> 驱动器
    pw_main = set_color(trimesh.creation.cylinder(radius=0.0016, height=0.080, sections=12), COLOR_WIRE_POWER)
    pw_main.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    pw_main.apply_translation([-0.008, 0.035, 0.005])

    gnd_main = set_color(trimesh.creation.cylinder(radius=0.0016, height=0.080, sections=12), COLOR_WIRE_GND)
    gnd_main.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    gnd_main.apply_translation([0.008, 0.035, 0.005])

    # (b) 稳压供电线: 稳压模块 -> STM32 主控 (5V 橙色)
    pw_5v = set_color(trimesh.creation.cylinder(radius=0.0012, height=0.045, sections=12), COLOR_WIRE_5V)
    pw_5v.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    pw_5v.apply_translation([-0.015, 0.045, 0.025])

    # 下方统一重建有明确端点的线路。

    # (c) 控制信号线: STM32 -> 驱动器 (青色排线)
    sig_ctrl = set_color(trimesh.creation.cylinder(radius=0.0012, height=0.070, sections=12), COLOR_WIRE_SIGNAL)
    sig_ctrl.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    sig_ctrl.apply_translation([0.015, 0.046, 0.002])

    # (d) 驱动输出线: 驱动器 -> 左右电机
    sig_lm = set_color(trimesh.creation.cylinder(radius=0.0012, height=0.045, sections=12), COLOR_WIRE_SIGNAL)
    sig_lm.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    sig_lm.apply_translation([-0.042, 0.030, -0.025])

    sig_rm = set_color(trimesh.creation.cylinder(radius=0.0012, height=0.045, sections=12), COLOR_WIRE_SIGNAL)
    sig_rm.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    sig_rm.apply_translation([0.042, 0.030, -0.025])

    def wire(a, b, color):
        points = np.array([a, b], dtype=float)
        return set_color(trimesh.creation.cylinder(radius=0.0015, segment=points, sections=8), color)

    power_harness = trimesh.util.concatenate([
        wire([0,.028,.089], [0,.048,-.053], COLOR_WIRE_POWER),
        wire([0,.028,.089], [-.045,.045,.015], COLOR_WIRE_POWER),
        wire([-.045,.045,.015], [.015,.045,.038], COLOR_WIRE_5V),
        wire([-.020,.048,-.035], [-.065,0,0], COLOR_WIRE_POWER),
        wire([.020,.048,-.035], [.065,0,0], COLOR_WIRE_POWER),
    ])
    scene.add_geometry(power_harness, node_name="Node_PowerWires")
    signal_harness = wire([.015,.050,.038], [0,.050,-.035], COLOR_WIRE_SIGNAL)
    scene.add_geometry(signal_harness, node_name="Node_SignalWires")

    return scene


def main():
    target_path = Path(__file__).resolve().parent.parent / "web/models/diff_car_teaching.glb"
    if len(sys.argv) > 1:
        target_path = Path(sys.argv[1]).resolve()

    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as err:
        print(f"❌ 创建目录失败: {err}", file=sys.stderr)
        sys.exit(1)

    scene = create_diff_car()
    glb_data = scene.export(file_type="glb")
    if not isinstance(glb_data, bytes):
        raise TypeError("GLB 导出器必须返回 bytes")
    try:
        with open(target_path, "wb") as f:
            f.write(glb_data)
        print(f"✓ 成功生成高精度、对齐局部原点的双轮差速教学小车 GLB: {target_path}")
    except OSError as err:
        print(f"❌ 写入文件失败: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
