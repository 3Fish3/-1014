#!/usr/bin/env python3
"""
生成课件手卡专用的 10 张高保真矢量教学图解 (SVG)
100% 离线、矢量高清、配合深色界面，直观展现机械、电路与运动学拓扑。
"""

from pathlib import Path

IMG_DIR = Path("/home/kekeyuyu/projects/hushi_ec_teach/web/assets/images")
IMG_DIR.mkdir(parents=True, exist_ok=True)

DIAGRAMS = {
    "frame.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <rect x="70" y="40" width="260" height="150" rx="16" fill="#1e293b" stroke="#00e5ff" stroke-width="2.5" stroke-dasharray="6,4"/>
  <rect x="90" y="60" width="220" height="110" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <circle cx="110" cy="80" r="6" fill="#f59e0b"/>
  <circle cx="290" cy="80" r="6" fill="#f59e0b"/>
  <circle cx="110" cy="150" r="6" fill="#f59e0b"/>
  <circle cx="290" cy="150" r="6" fill="#f59e0b"/>
  <text x="200" y="110" fill="#38bdf8" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif">车架底板 (机械承载基础)</text>
  <text x="200" y="132" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">固定主控 / 驱动器 / 电池 / 电机</text>
  <text x="200" y="215" fill="#f59e0b" font-size="11" text-anchor="middle" font-family="sans-serif">● 黄色标记点：铜柱立柱安装孔位</text>
</svg>""",

    "wheel.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <!-- 左驱动轮 -->
  <rect x="40" y="50" width="40" height="110" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
  <rect x="48" y="75" width="24" height="60" rx="4" fill="#334155"/>
  <text x="60" y="180" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">左驱动轮</text>
  <!-- 右驱动轮 -->
  <rect x="320" y="50" width="40" height="110" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
  <rect x="328" y="75" width="24" height="60" rx="4" fill="#334155"/>
  <text x="340" y="180" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">右驱动轮</text>
  <!-- 前后万向轮 -->
  <circle cx="200" cy="50" r="22" fill="#334155" stroke="#a855f7" stroke-width="2"/>
  <circle cx="200" cy="50" r="8" fill="#e2e8f0"/>
  <text x="200" y="25" fill="#c084fc" font-size="11" text-anchor="middle" font-family="sans-serif">前万向支撑轮</text>
  <circle cx="200" cy="160" r="22" fill="#334155" stroke="#a855f7" stroke-width="2"/>
  <circle cx="200" cy="160" r="8" fill="#e2e8f0"/>
  <text x="200" y="200" fill="#c084fc" font-size="11" text-anchor="middle" font-family="sans-serif">后万向支撑轮</text>
  <!-- 地面接触提示 -->
  <text x="200" y="225" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">双轮驱动提供前进动力 · 万向轮保持车身三点水平平衡</text>
</svg>""",

    "motor.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <!-- 电机主体 -->
  <rect x="50" y="65" width="120" height="85" rx="6" fill="#334155" stroke="#64748b" stroke-width="2"/>
  <text x="110" y="105" fill="#f8fafc" font-size="13" font-weight="bold" text-anchor="middle" font-family="sans-serif">直流电机马达</text>
  <text x="110" y="125" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">高速低扭矩旋转</text>
  <!-- 联结箭头 -->
  <path d="M 175 107 L 205 107" stroke="#00e5ff" stroke-width="3" marker-end="url(#arrow)"/>
  <!-- 减速箱 -->
  <rect x="215" y="55" width="100" height="105" rx="6" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
  <text x="265" y="102" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle" font-family="sans-serif">减速齿轮箱</text>
  <text x="265" y="122" fill="#fef3c7" font-size="11" text-anchor="middle" font-family="sans-serif">齿轮减速比降速</text>
  <!-- 输出轴 -->
  <rect x="315" y="98" width="45" height="18" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/>
  <text x="337" y="132" fill="#38bdf8" font-size="10" text-anchor="middle" font-family="sans-serif">输出轮轴</text>
  <!-- 说明 -->
  <text x="200" y="200" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">功能：将电能转化为大扭矩机械旋转动力</text>
  <text x="200" y="222" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">直接驱动两侧轮毂，使车辆克服地面摩擦力行进</text>
</svg>""",

    "driver.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <rect x="40" y="35" width="320" height="155" rx="10" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
  <!-- 散热片 -->
  <rect x="150" y="50" width="100" height="60" rx="4" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
  <line x1="170" y1="50" x2="170" y2="110" stroke="#334155" stroke-width="2"/>
  <line x1="190" y1="50" x2="190" y2="110" stroke="#334155" stroke-width="2"/>
  <line x1="210" y1="50" x2="210" y2="110" stroke="#334155" stroke-width="2"/>
  <line x1="230" y1="50" x2="230" y2="110" stroke="#334155" stroke-width="2"/>
  <text x="200" y="85" fill="#f8fafc" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif">H 桥功率开关</text>
  <!-- 端子排 -->
  <rect x="55" y="65" width="60" height="30" fill="#15803d" rx="4"/>
  <text x="85" y="84" fill="#fff" font-size="10" text-anchor="middle" font-family="sans-serif">电机端子 L</text>
  <rect x="285" y="65" width="60" height="30" fill="#15803d" rx="4"/>
  <text x="315" y="84" fill="#fff" font-size="10" text-anchor="middle" font-family="sans-serif">电机端子 R</text>
  <rect x="160" y="140" width="80" height="25" fill="#dc2626" rx="4"/>
  <text x="200" y="157" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle" font-family="sans-serif">动力电源输入 (V+)</text>
  <!-- 核心逻辑 -->
  <text x="200" y="215" fill="#f87171" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">弱电控制信号输入 ➔ 强电大电流功率放大输出</text>
</svg>""",

    "battery.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <!-- 电池主体 -->
  <rect x="40" y="55" width="140" height="85" rx="8" fill="#1d4ed8" stroke="#3b82f6" stroke-width="2"/>
  <text x="110" y="95" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif">动力锂电池包</text>
  <text x="110" y="118" fill="#93c5fd" font-size="11" text-anchor="middle" font-family="sans-serif">7.4V ~ 11.1V 动力源</text>
  <!-- 动力供电分支 -->
  <path d="M 180 80 L 230 50 L 320 50" fill="none" stroke="#ef4444" stroke-width="3"/>
  <text x="330" y="54" fill="#f87171" font-size="11" font-family="sans-serif">➔ 直供驱动器强电端</text>
  <!-- 稳压分支 -->
  <path d="M 180 115 L 210 115" fill="none" stroke="#f59e0b" stroke-width="3"/>
  <rect x="215" y="90" width="95" height="50" rx="6" fill="#047857" stroke="#10b981" stroke-width="1.5"/>
  <text x="262" y="112" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif">DC-DC 稳压</text>
  <text x="262" y="128" fill="#a7f3d0" font-size="10" text-anchor="middle" font-family="sans-serif">高压降至 5V</text>
  <path d="M 310 115 L 340 115" fill="none" stroke="#10b981" stroke-width="3"/>
  <text x="345" y="119" fill="#34d399" font-size="11" font-family="sans-serif">➔ 供给单片机</text>
  <!-- 警示 -->
  <text x="200" y="195" fill="#fbbf24" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">⚠️ 严禁将未稳压的动力电池直接接到 STM32 芯片引脚！</text>
  <text x="200" y="218" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">动力回路与微控制器控制电路必须电压匹配与供电隔离</text>
</svg>""",

    "stm32.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <rect x="60" y="30" width="280" height="150" rx="10" fill="#172554" stroke="#3b82f6" stroke-width="2"/>
  <!-- MCU 芯片 -->
  <rect x="145" y="65" width="110" height="75" rx="6" fill="#0f172a" stroke="#60a5fa" stroke-width="1.5"/>
  <text x="200" y="98" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle" font-family="sans-serif">STM32 MCU</text>
  <text x="200" y="120" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="sans-serif">ARM Cortex-M 核心</text>
  <!-- 排针 -->
  <rect x="75" y="45" width="12" height="120" fill="#eab308" rx="2"/>
  <rect x="313" y="45" width="12" height="120" fill="#eab308" rx="2"/>
  <text x="81" y="180" fill="#fbbf24" font-size="9" text-anchor="middle" font-family="sans-serif">GPIO/PWM</text>
  <text x="319" y="180" fill="#fbbf24" font-size="9" text-anchor="middle" font-family="sans-serif">POWER/CAN</text>
  <text x="200" y="208" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">系统的决策大脑：运行控制算法，下发速度与转向指令</text>
</svg>""",

    "wiring.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <!-- 供电线路图例 -->
  <line x1="50" y1="60" x2="130" y2="60" stroke="#ef4444" stroke-width="4"/>
  <line x1="50" y1="75" x2="130" y2="75" stroke="#1e293b" stroke-width="4"/>
  <text x="145" y="72" fill="#f87171" font-size="12" font-weight="bold" font-family="sans-serif">能量供电路径 (高压动力源 / 大电流)</text>
  <!-- 稳压供电线路图例 -->
  <line x1="50" y1="110" x2="130" y2="110" stroke="#f59e0b" stroke-width="3"/>
  <text x="145" y="114" fill="#fbbf24" font-size="12" font-weight="bold" font-family="sans-serif">稳压 5V / 3.3V 弱电供电路径 (主控决策核心)</text>
  <!-- 信号线路图例 -->
  <line x1="50" y1="150" x2="130" y2="150" stroke="#00e5ff" stroke-width="3" stroke-dasharray="6,3"/>
  <text x="145" y="154" fill="#38bdf8" font-size="12" font-weight="bold" font-family="sans-serif">控制信号路径 (PWM 调速脉冲 / 方向引脚电平)</text>
  <!-- 总结 -->
  <rect x="40" y="185" width="320" height="35" rx="6" fill="#1e293b"/>
  <text x="200" y="207" fill="#e2e8f0" font-size="11" text-anchor="middle" font-family="sans-serif">物理隔离：信息流与电能流各司其职，保证控制稳定</text>
</svg>""",

    "motion.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <!-- 小车简图 -->
  <rect x="150" y="70" width="100" height="110" rx="8" fill="#1e293b" stroke="#00e5ff" stroke-width="2"/>
  <!-- 左轮 -->
  <rect x="130" y="85" width="18" height="60" rx="4" fill="#334155" stroke="#38bdf8" stroke-width="1.5"/>
  <line x1="139" y1="75" x2="139" y2="35" stroke="#38bdf8" stroke-width="3"/>
  <polygon points="139,25 133,38 145,38" fill="#38bdf8"/>
  <text x="110" y="60" fill="#38bdf8" font-size="11" text-anchor="middle" font-family="sans-serif">vL (较慢)</text>
  <!-- 右轮 -->
  <rect x="252" y="85" width="18" height="60" rx="4" fill="#334155" stroke="#f59e0b" stroke-width="1.5"/>
  <line x1="261" y1="75" x2="261" y2="20" stroke="#f59e0b" stroke-width="5"/>
  <polygon points="261,10 254,24 268,24" fill="#f59e0b"/>
  <text x="290" y="50" fill="#f59e0b" font-size="11" text-anchor="middle" font-family="sans-serif">vR (较快)</text>
  <!-- 转向弧线 -->
  <path d="M 200 65 A 60 60 0 0 0 160 30" fill="none" stroke="#ec4899" stroke-width="3" stroke-dasharray="4,3"/>
  <polygon points="152,32 165,26 163,39" fill="#ec4899"/>
  <text x="200" y="215" fill="#f472b6" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">右轮线速度 > 左轮线速度 ➔ 产生向左的偏航力矩与圆弧轨迹</text>
</svg>""",

    "differential.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <text x="200" y="40" fill="#00e5ff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif">无数值纯直觉差速滑块交互</text>
  <!-- 左滑块示意 -->
  <rect x="70" y="70" width="100" height="12" rx="6" fill="#334155"/>
  <circle cx="120" cy="76" r="10" fill="#38bdf8"/>
  <text x="120" y="105" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">左轮滑块：[反转 ⇄ 停止 ⇄ 正转]</text>
  <!-- 右滑块示意 -->
  <rect x="230" y="70" width="100" height="12" rx="6" fill="#334155"/>
  <circle cx="290" cy="76" r="10" fill="#f59e0b"/>
  <text x="280" y="105" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">右轮滑块：[反转 ⇄ 停止 ⇄ 正转]</text>
  <!-- 核心启发 -->
  <rect x="40" y="130" width="320" height="85" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="200" y="155" fill="#fbbf24" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">核心启发问题：为什么改变左右轮速度，小车就会转弯？</text>
  <text x="200" y="178" fill="#e2e8f0" font-size="11" text-anchor="middle" font-family="sans-serif">无需记住角速度公式，亲自拖动滑块观察方向箭头与地面实时轨迹</text>
  <text x="200" y="198" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="sans-serif">一正一反 = 原地自转 · 一快一慢 = 弧线转弯 · 等速同向 = 直线行进</text>
</svg>""",

    "comparison.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#131926" rx="8"/>
  <line x1="200" y1="20" x2="200" y2="220" stroke="#334155" stroke-width="2" stroke-dasharray="4,4"/>
  <!-- 教学小车 -->
  <text x="100" y="35" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle" font-family="sans-serif">简化双轮差速教学小车</text>
  <text x="100" y="65" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">【车架】 亚克力 / 铝合金底板</text>
  <text x="100" y="95" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">【驱动】 直流有刷减速电机</text>
  <text x="100" y="125" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">【轮组】 左右橡胶轮 + 万向轮</text>
  <text x="100" y="155" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">【电调】 双 H 桥功率驱动板</text>
  <text x="100" y="185" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">【主控】 STM32 单板开发板</text>
  <!-- 英雄机器人 -->
  <text x="300" y="35" fill="#f59e0b" font-size="13" font-weight="bold" text-anchor="middle" font-family="sans-serif">RoboMaster 英雄机器人</text>
  <text x="300" y="65" fill="#cbd5e1" font-size="11" text-anchor="middle" font-family="sans-serif">【车架】 航空铝 CNC 镂空 + 装甲板</text>
  <text x="300" y="95" fill="#cbd5e1" font-size="11" text-anchor="middle" font-family="sans-serif">【驱动】 4 颗 DJI M3508 无刷电机</text>
  <text x="300" y="125" fill="#cbd5e1" font-size="11" text-anchor="middle" font-family="sans-serif">【轮组】 4 颗 152mm 麦克纳姆全向轮</text>
  <text x="300" y="155" fill="#cbd5e1" font-size="11" text-anchor="middle" font-family="sans-serif">【电调】 RoboMaster C620 高性能电调</text>
  <text x="300" y="185" fill="#cbd5e1" font-size="11" text-anchor="middle" font-family="sans-serif">【主控】 MC02 A板主控 + CAN 总线广播</text>
  <!-- 共同结论 -->
  <text x="200" y="222" fill="#00e5ff" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif">机械结构虽然不同，但解决【承载、动力、供电、决策】的电控法则完全共通！</text>
</svg>"""
}

for filename, content in DIAGRAMS.items():
    p = IMG_DIR / filename
    p.write_text(content, encoding="utf-8")
    print(f"✓ 生成教学矢量示意图: {p.name}")
