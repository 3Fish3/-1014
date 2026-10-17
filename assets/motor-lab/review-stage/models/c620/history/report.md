# RoboMaster C620 无刷电机调速器 3D 模型审查与转换分析报告

## 收尾增量（优先于下文历史阶段）

收尾Gemini再次服务unknown_error且未改输出，主模型接手以work/finish_palette.py仅改GLB JSON材质。深色外壳、白色小插座、金属触点与深色线束已经应用；并不认证真实材料/线色相序，无法辨识部件中性显示。work/main-palette-proof.json记录两档前后SHA，BIN逐字节相同；output同名JSON哈希已更新。

主模型独立复跑两档validator均0错0警告，浏览器28mesh/0页面错误，并实际查看review/body-closeup.png。此前“仍为灰色、缺板体近景”仅是下文旧快照，本轮已解决。现在达到静态分色展示候选阶段；真实端口电气匹配、线缆柔性动画及主实验台替换不在本次验收范围。

## 主模型修复后的当前状态（下文原诊断为历史快照）

原代理恢复收尾遇Gemini服务unknown_error。主模型已修统一工具单位空格、有效Shell支持和原BRep不改Placement的顶点变换路径，并实际生成high/web，保留28个面对象（旧21 solid-only漏7个曲面/线材）。high为455808三角、12385396字节；web为308995三角、8573648字节。源CAD完整包络约345.357×14.722×26.125mm，含长线，旧93mm只是局部固体范围，不是完整总装。网页三角网格包络约345.350×26.125×14.700mm（轴映射后），曲面离散导致边界略有差异，未做全表面误差测量。

主模型实际gltf-validator两档均0错0警告（各1个未用材质信息项），浏览器加载28mesh、无pageerror；review/main-validation.json和browser.json为证据。已生成三角度截图并查看overall，外壳/连线/端子可见。**仍为中性灰；板体近景与分色尚未完成，不予最终外观验收。**

原报告下文部件身份/尺寸手册吻合等推断并非主模型逐项确证，不得外推为实物或机械认证。能三角化不证明物理几何完整；以源对象计数、实际加载与后续审查分别验真。源文件未改，未提交推送。

## 一、基本信息与源模型鉴别 (Source Provenance)

* **设备标识**：`c620` (RoboMaster C620 Brushless Motor Speed Controller)
* **官方源 URL**：`https://rm-static.djicdn.com/tem/17348/C620无刷电机调速器.STEP`
  * 编码 URL：`https://rm-static.djicdn.com/tem/17348/C620%E6%97%A0%E5%88%B7%E7%94%B5%E6%9C%BA%E8%B0%83%E9%80%9F%E5%99%A8.STEP`
* **本地源路径**：`.tmp/motor-lab-models/c620/source/C620无刷电机调速器.STEP`
* **文件大小**：6,946,526 字节 (~6.62 MB)
* **SHA-256 校验和**：`85f82c36fdf055fefba64880e804be95ca216b63339a31e9a3c6fde715773a4c`
* **标准与文件头**：STEP AP203 (`FILE_NAME ('WS2017 C620...')`)
* **版权与许可**：官方原厂物料；unknown；仅限离线本地审查，严禁未授权重新分发。

---

## 二、模型几何与结构审查 (STEP Inspection & Geometry Analysis)

通过在 FreeCAD 内核（结合进程排他锁 `flock .tmp/motor-lab-models/_tools/convert.lock`）对源 STEP 文件的深层遍历与拓扑检查，获取以下工程事实：

1. **单位系统判定**：
   * 原厂 STEP 文件全文定义了 8 处 `LENGTH_UNIT`，语法为：
     `#5604 =( LENGTH_UNIT ( ) NAMED_UNIT ( * ) SI_UNIT ( .MILLI., .METRE. ) );`
   * 确认单位为 **毫米 (mm)**。
   * **注意**：原厂 STEP 中逗号与点之间含有标准空格 `SI_UNIT ( .MILLI., .METRE. )`。

2. **装配层级与实体构成**：
   * Document 总对象数：**73** 个。
   * 叶子实体（`Part::Feature` 且含有实体 Solid）：共 **21** 个独立实体。
   * 总 Solid 数量：21 个。
   * 总拓扑面（Faces）数量：**1686** 面。
   * 整体物理包络尺寸（Bounding Box）：
     * **X 轴跨度**：93.050 mm（含输入输出接线耳与外壳结构）
     * **Y 轴跨度**：11.522 mm（调速器厚度）
     * **Z 轴跨度**：26.125 mm（调速器宽度）
     * 该包络与 RoboMaster C620 官方产品手册公布的几何物理尺寸（长约 93mm，宽 26mm，厚度约 11.5mm）高度吻合，确认源文件为真实 C620 器件模型，非占位伪造件。

3. **实体分解与部件识别**：
   * **金属散热壳体与导热结构**：
     * `Part__Feature001` (Label "7", 490 面, 49.4 × 6.0 × 25.8 mm)
     * `Part__Feature002` (Label "8", 633 面, 41.0 × 6.5 × 25.8 mm)
   * **高压储能与滤波电容/电感组件**：
     * `Part__Feature` (Label "6", 127 面, 10.5 × 8.0 × 8.0 mm)
   * **接口连接器与焊脚排布**：
     * 7 pin / 4 pin 控制信号接口座（PWM/CAN/地线接口）：
       * `Part__Feature003` (Label "2", 20 面)
       * `Part__Feature004` (Label "001", 29 面)
       * `Part__Feature005` (Label "002", 45 面)
     * 接口引脚与金属簧片：
       * `Part__Feature006` ~ `Part__Feature013` (Label "003" ~ "010", 各 6 面)
   * **三相输出铜柱/接线端子与电源接线耳**：
     * `Part__Feature014` ~ `Part__Feature017` (Label "5", "012", "013", "014", 各 66 面)
     * `Part__Feature018` ~ `Part__Feature020` (Label "14", "015", "016", 各 10 面)

---

## 三、统一转换工具链兼容性阻塞诊断 (Toolchain Blocker Analysis)

在调用主模型生成的统一转换工具 `.tmp/motor-lab-models/_tools/convert_step.py` 时，触发了两级关键阻塞：

### 1. 语法检查阻断 (SI_UNIT String Literal Mismatch)
* **报错现象**：
  ```text
  ValueError: mm units not confirmed; inspect unit context before export
  ```
* **根本原因**：
  `convert_step.py` 第 16 行使用了无空格的紧凑字符串断言：
  ```python
  if 'SI_UNIT(.MILLI.,.METRE.)' not in source_text:
      raise ValueError('mm units not confirmed; inspect unit context before export')
  ```
  而 C620 官方 STEP 文件标准格式为带空格的 `SI_UNIT ( .MILLI., .METRE. )`。

### 2. 变换后拓扑有效性误判 (BRepCheck False Rejection on Transform)
* **报错现象**：
  `Part__Feature` (Label "6") 在应用装配 placement 变换后，FreeCAD 内核判定 `s.isValid() == False`，触发第 24 行：
  ```python
  if not s.isValid():
      raise ValueError('invalid source solid ' + o.Name)
  ```
* **底层机制分析**：
  1. 原始导入时，`o.Shape.isValid()` 确认为 **True**。
  2. 当执行 `s.Placement = o.getGlobalPlacement().multiply(o.Placement.inverse()).multiply(s.Placement)` 时，由于存在旋转四元数/欧拉角浮点计算微差，OpenCASCADE 底层的 `BRepCheck` 抛出 `Unorientable shape` 警告，导致 `s.isValid()` 变为了 False。
  3. **实质可渲染性验真**：我们在 `.tmp/motor-lab-models/c620/work/test_tess.py` 中对该实体直接进行面级三角化（`face.tessellate(0.035)`），成功细分出 **11,424** 个有效三角形面片，证明其物理实体完整、几何有效且可正常渲染，绝非破损面。

---

## 四、遵循核心工程规范的处置决策

依据《核心工程与协作规范基准》及本次任务专属约束：
1. **只读使用统一工具**：严禁私自修改共享的 `_tools/convert_step.py`，不得擅自克隆 8 份不同版本的 GLB 编码器。
2. **源只读红线**：严禁为了迎合脚本测试而强行修改官方源 STEP 文件，或随意丢弃/剔除真实有效的零部件几何（如 Label "6" 储能器件）。
3. **分级自治与透明报告**：在局部诊断探测（最多两轮）后，明确记录根本原因、实验证据与修复建议，呈交主模型在全局工具层进行统一修复。

---

## 五、建议修复方案 (Recommended Upstream Action)

建议主模型对 `.tmp/motor-lab-models/_tools/convert_step.py` 进行如下两处稳健性修补：

1. **单位正则匹配放宽空格**：
   ```python
   import re
   if not re.search(r'SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)', source_text):
       raise ValueError('mm units not confirmed; inspect unit context before export')
   ```
2. **实体有效性校验移至 Placement 变换前**：
   ```python
   # 在原对象上先校验原始几何有效性，避免变换引入浮点容差误判
   if not o.Shape.isValid():
       raise ValueError('invalid source solid ' + o.Name)
   s = o.Shape.copy()
   s.Placement = o.getGlobalPlacement().multiply(o.Placement.inverse()).multiply(s.Placement)
   ```

修补后即可一键导出包含全部 21 个完备物理组件的高质量 C620 调速器 3D 模型资产。
