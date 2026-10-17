# 电调中心板 2 (RM_ESC_Center_Board2) 官方 STEP 转换与审查交付报告

- **设备名称**：DJI RoboMaster 电调中心板 2 (RM_ESC_Center_Board2)
- **审查日期**：2026-10-16
- **审查作用域**：`.tmp/motor-lab-models/center-board2/`（本地离屏审查，不修改公开课件与正式资产）
- **工具链**：系统FreeCAD（主模型本轮实查版本1.1.3，原代理0.21未核实） + 共享转换工具 `_tools/convert_step.py` + 统一审查工具 `_tools/review.mjs` + Playwright + gltf-validator

---

## 一、源文件获取与特征核验

1. **官方源 URL**：`https://rm-static.djicdn.com/tem/17348/RM_ESC_Center_Board2.stp`
2. **本地落盘路径**：`source/RM_ESC_Center_Board2.stp`
3. **文件指纹与大小**：
   - **SHA-256**：`652f318dd2ca9649d69dec1716d8c1bb7f947278e78351d25a0a9b2701673c38`
   - **磁盘字节数**：`3,821,051` 字节 (~3.82 MB)
4. **STEP 协议头信息**：
   - 描述标准：`ISO-10303-21`
   - 装配体代号：`RM_ESC_CENTER_BOARD2_ASM_ASM`
   - 制作日期：`2020-03-27T`
   - 生成系统：`CREO PARAMETRIC BY PTC INC, 2015200`
   - 作者信息：`camaro.ren`
5. **单位验证**：
   - 文本上下文明确包含 `SI_UNIT(.MILLI.,.METRE.)`，确认 STEP 原生几何基准单位为**毫米 (mm)**。

---

## 二、几何实体与装配层级审查

经 FreeCAD 无界面离屏解析（单层 `flock .tmp/motor-lab-models/_tools/convert.lock` 保护）：

1. **对象层级与实体筛选**：
   - FreeCAD 导入总对象数：`181` 个。
   - 非叶实体对象（`144` 个）：包含 16 个 `App::Part` 装配容器、16 个 `App::Origin`、48 个基准轴（`App::Line`）、48 个基准面（`App::Plane`）、16 个基准点（`App::Point`）。
   - **叶实体对象（`Part::Feature`）**：共 `37` 个。
   - **壳体（Shell）/纯开面审查**：经核验，全文档 37 个 `Part::Feature` 均为**完整闭合实体（Solid）**，`pureShellPartFeatures = 0`，无漏筛开面或残缺几何。
2. **总装配几何闭环验证**：
   - 37 个叶实体总面数：`4,970` 面。
   - 根装配节点 `RM_ESC_CENTER_BOARD2_ASM_ASM` 记录面数：`4,970` 面（差异 0 面）。
   - 37 个叶实体应用全局变换后的组合包络盒：
     - $X \in [-20.500, 20.500]$ mm，跨度 **41.000 mm**
     - $Y \in [-3.000, 11.100]$ mm，跨度 **14.100 mm**
     - $Z \in [-20.500, 28.005]$ mm，跨度 **48.505 mm**
   - 组合包络与根容器包络尺寸在浮点精度内完全一致，无重复父子实体叠加，亦无遗漏部件。

---

## 三、材质分色方案 (Palette Rationale)

遵循“基于工程器件事实、非主观臆造”原则，为 STEP 原生叶实体标签定制精准映射（`work/palette.json`）：

| 标签 (Exact Label) | 对应物理部件 | 调色依据 / 物理材质 | RGBA 取值 |
| :--- | :--- | :--- | :--- |
| `SHELL_UP` | 上保护壳体 | 深色展示配色；具体成分未核（官方产品描述为硅胶外壳，不能断言PC/ABS） | `[0.18, 0.19, 0.22, 1.0]` |
| `SHELL_DOWN` | 底盘基座外壳 | 深色展示配色；不认证底盖材料成分 | `[0.15, 0.16, 0.18, 1.0]` |
| `CENTER_DISTRIBUTION_BOARD` | 核心分电板 PCB | 内部多层高电流阻焊 FR4 PCB（暗绿色） | `[0.15, 0.28, 0.20, 1.0]` |
| `XT60____...UL-21156-1-SOL` | XT60 电源输入母座 | Amass 标准耐高温尼龙黄色胶壳 | `[0.88, 0.72, 0.12, 1.0]` |
| `XT60____...SOLID1` (4个) | XT60 内部金属插针与卡扣 | 镀金铜合金触点 / 弹性卡件 | `[0.85, 0.70, 0.25, 1.0]` |
| `XT30UPB-F_SJ` (共7组) | XT30 电调与扩展供电插座 | 6 路电调分电 + 1 路扩展供电黄色母座胶壳 | `[0.88, 0.72, 0.12, 1.0]` |
| `MR30PB-F__` (共14组) | MR30 触针与接线端子 | 镀金导电接触针脚 | `[0.85, 0.70, 0.25, 1.0]` |
| `SM02B-GHS-TB` (共6组) | 侧边 2-pin JST GH 插座 | 6 路 CAN/控制信号卧式接口（自然象牙白塑胶） | `[0.88, 0.89, 0.90, 1.0]` |
| `BM04B-GHS-TBT` | 顶部 4-pin JST GH 插座 | 4-pin CAN外形，象牙白展示配色；含N/A脚，不得当5V供电口 | `[0.88, 0.89, 0.90, 1.0]` |
| `BM02B-GHS-TBT` | 2-pin JST GH 立式插座 | 2-pin接口外形（象牙白）；具体CAN定义按手册，非已确认监测/供电端口 | `[0.88, 0.89, 0.90, 1.0]` |
| `default` | 未知默认回退 | 中性技术审查蓝灰色 | `[0.42, 0.48, 0.57, 1.0]` |

---

## 四、模型输出与转换产物

使用只读统一转换工具 `.tmp/motor-lab-models/_tools/convert_step.py`，经串行锁 `convert.lock` 执行转换。转换坐标映射：单位 mm 转米（$\times 0.001$），空间映射 $(x,y,z) \to (x, z, -y)$，全模型以包络中心居中对齐，Y 轴朝上。

### 1. 高精度存档版 (`output/high.glb`)
- **挠度参数 (Deflection)**：`0.035 mm`
- **磁盘文件体积**：`12,039,488` 字节 (~12.0 MB)
- **网格节点 (Meshes)**：`37` 个（保持叶实体一对一结构）
- **三角面数 (Triangles)**：`362,700` 面
- **顶点数 (Vertices)**：`297,716`
- **输出 SHA-256**：`0c9e2f4d766ccfb1564805b298ca25fc1edc78114712e7c4474ee33c10c631f7`

### 2. Web 渲染候选版 (`output/web.glb`)
- **挠度参数 (Deflection)**：`0.12 mm`
- **磁盘文件体积**：`10,637,312` 字节 (~10.6 MB)
- **网格节点 (Meshes)**：`37` 个
- **三角面数 (Triangles)**：`318,002` 面
- **顶点数 (Vertices)**：`261,906`
- **输出 SHA-256**：`a0195cbbd73017d05051a4fb21d9da17acbd8612ce7592d28650eaf4ff34dddd`

---

## 五、质量验证与目视审查

### 1. 规范验证 (gltf-validator)
调用项目官方 `gltf-validator` 引擎对 `high.glb` 与 `web.glb` 执行全量字节级二进制验证：
- **high.glb**：`0` 个 Error，`0` 个 Warning。
- **web.glb**：`0` 个 Error，`0` 个 Warning。
- 详细报告留存于 `review/gltf-validation.json`。

### 2. 离屏 WebGL 渲染与运行时验证 (`_tools/review.mjs`)
通过 Playwright 驱动 Chrome 进行离屏 WebGL 真实环境渲染，无启动常驻端口服务：
- 渲染引擎：Three.js + SwiftShader软渲染（通用review脚本未设置ACESFilmicToneMapping，不声称该模式）。
- **运行时包络跨度**：$[0.041000, 0.048505, 0.014100]$ 米，与源 STEP 真实物理尺寸精确吻合。
- **活动网格计数**：37 个 Mesh，渲染控制台错误数：0。
- 运行结果留存于 `review/browser.json`。

### 3. 多视角目视截图检验
- **全局正面俯视视角 (`review/overall.png`)**：上保护壳体轮廓清晰，四角安装凸耳孔位及暗绿色 PCB 衬底边缘完整，顶部 XT60 防呆插座与固定卡扣无几何穿插或面法线反转。
- **底部配电与插座视角 (`review/back.png`)**：底部 7 组 XT30 电调供电接口与内嵌镀金导电触针排列规整（左 3、右 3、底横置 1），底部 4-pin JST GH 通讯接口定位精准。
- **侧边控制接口近景 (`review/interface.png`)**：侧边 6 组 2-pin JST GH 卧式连接器卡扣与插槽结构完备，各接口引脚几何完整保留，无缝隙脱位。

---

## 六、缺口说明与工程边界提示 (Gaps & Constraints)

1. **无实物解体测量**：本产物仅基于 DJI 官方公开 STEP 进行精确三角化离散与材质赋色审查，不得作为反向制造或公差级认证凭据。
2. **离散网格精度**：Tessellation 弦长挠度（0.035mm / 0.12mm）属于离散近似算法，非绝对无损解析曲面。
3. **内存边界提示**：磁盘文件大小（10.6MB / 12.0MB）不代表 WebGL 运行时 GPU 显存占用，实际显存取决于顶点属性缓冲区与贴图分配。
4. **管脚信号映射**：本模型如实保留 37 处机械与电气连接结构，但具体电气引脚定义（如 CAN 接口 N/A 引脚定义）需严格依据说明书电气文档，不可由 3D 外观擅自推断直通性。
