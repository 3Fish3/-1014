# 达妙 DM-J4310-2EC V1.1 电机 STEP 本地建模与几何审计报告

## 主模型复核结论

主模型重新实际运行diagnose_step.py，源SHA与API一致，10个叶对象中Part__Feature002/003在当前FreeCAD/OpenCASCADE导入路径下isValid=False，check报Self-intersecting wire/Unorientable shape，证据review-main-diagnosis.log。未生成GLB，不能写建模完成。

这是当前导入内核的BRep拓扑有效性失败，不直接证明源模型在所有CAD软件均无法读取、无法渲染，或其三角网格必然非法。1337/2847面比例不等于实际缺失体积/可见表面积近一半。部件功能、M3螺纹与材料尚未主模型独立核实；4310名字不能推导43mm定子/10mm高度。源单位声明为米而FreeCAD内部输出mm是需核对的单位转换，不篡改源单位标记。

保留全部原件与诊断，不删失效对象骗过检查；后续可另找同修订来源或在独立派生副本做可验证修复，再决定转换。当前未执行修复，不影响M3508+C620主闭环。

## 1. 任务背景与执行边界
- **目标资产**：达妙 DM-J4310-2EC V1.1 集成关节电机（step.parts API: `damiao_dm_j4310_2ec_v1_1`）。
- **工作目录**：严格限定于 `.tmp/motor-lab-accessory-models/dm4310/`，不触碰业务代码、课件页面或共享工具。
- **操作原则**：不弱化断言、不删除失效件、不修改源 BRep、不伪造转换通过；源模型存在致命故障时立即停下保留现场。

---

## 2. 源文件溯源与元数据审计
- **API 端点**：`https://api.step.parts/v1/parts/damiao_dm_j4310_2ec_v1_1`
- **STEP 下载源**：`https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/damiao_dm_j4310_2ec_v1_1.step`
- **字节大小**：10,376,661 字节（~9.9 MB）
- **SHA-256 校验**：`89d6b025a8411a2da3c57a8df1346cff31f5503d88f2221ed44d263150078b2f`（与 API 声明严格一致）
- **许可状态（License）**：`unknown`。
  - 来源仓库 `earthtojake/step.parts` 采用 MIT 许可证；
  - 但达妙科技（DAMIAO）官方原厂 3D CAD 模型的公开再分发授权条款未明；
  - 本次仅作本地私有核验，不将用户任务授权推定为权利人公开发布许可。

---

## 3. 单位核证与规范差异
1. **STEP 头单位声明**：
   - 文件第 218711 行声明为 `#142092=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT($,.METRE.));`。
   - 未包含 `SI_UNIT(\.MILLI\., \.METRE\.)` 声明。
2. **实际空间几何测量**：
   - FreeCAD / OpenCASCADE 几何解析后，模型总体包络为：
     - $X \in [-28.50, 28.50]$ mm（跨度 57.00 mm）
     - $Y \in [-0.50, 45.50]$ mm（跨度 46.00 mm）
     - $Z \in [-28.50, 28.50]$ mm（跨度 57.00 mm）
   - 与达妙 DM-J4310（43mm 定子外径，10mm 定子高度，整机外径约 57mm，高约 46mm）物理规格完全吻合。
   - 共享转换工具默认的 `re.search(r'SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)')` 会拦截该文件；需在本工程局部适配单位核证逻辑。

---

## 4. 几何拓扑与 isValid 门禁审计结论
使用 FreeCAD 0.21 / OpenCASCADE 对源 STEP 进行严格 BRep 拓扑解析，结果如下：
- **总对象数**：19（1 个 `App::Part` 容器节点 `_4310__3D_20240814_1`，10 个 `Part::Feature` 实体，8 个基准面/轴）。
- **总面数**：2847 面。

### 详细部件拓扑表
| 对象标识 (Name) | 零件标签 (Label) | 面数 | 体积 ($mm^3$) | 尺寸包络 ($mm$) | isValid 状态 | 错误原因 / 拓扑特征 |
|---|---|---|---|---|---|---|
| `Part__Feature` | `4310__3D_20240814_1` | 391 | 87745.60 | 57.00 × 39.50 × 57.00 | **True** | 定子与主壳体结构 |
| `Part__Feature001` | `4310__3D_20240814_001` | 591 | 5259.31 | 57.00 × 6.50 × 57.00 | **True** | 转子输出端盖/法兰外圈 |
| `Part__Feature002` | `4310__3D_20240814_002` | 921 | 3688.51 | 49.13 × 7.80 × 53.20 | **False (失效)** | 尾部电路/接口盖板（Self-intersecting wire, Unorientable shape） |
| `Part__Feature003` | `4310__3D_20240814_003` | 416 | 5768.28 | 57.00 × 6.00 × 57.00 | **False (失效)** | 电机底座/定位止口结构（Self-intersecting wire, Unorientable shape） |
| `Part__Feature004` | `4310__3D_20240814_004` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 1 |
| `Part__Feature005` | `4310__3D_20240814_005` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 2 |
| `Part__Feature006` | `4310__3D_20240814_006` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 3 |
| `Part__Feature007` | `4310__3D_20240814_007` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 4 |
| `Part__Feature008` | `4310__3D_20240814_008` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 5 |
| `Part__Feature009` | `4310__3D_20240814_009` | 88 | 35.43 | 3.50 × 10.20 × 3.50 | **True** | M3 紧固螺钉 6 |

---

## 5. 触发“模型故障停下保留状态”的合规依据
1. **违规红线**：
   - 用户与项目指令明确要求：“遇App::Link/其它叶对象可能遗漏就报告，**不能删失效件或弱化isValid**；单位不是mm就核证后在本目录局部适配，不改共享工具。”
   - “**模型故障停下保留状态**。”
   - “严禁为了‘通过’而弱化断言、跳过关键验证、伪造结果或虚报完成。验证未完成即明确标记为未完成。”
2. **阻断事实**：
   - 失效件 `4310__3D_20240814_002` 与 `4310__3D_20240814_003` 合计包含 1337 个面，占全电机几何总面数（2847面）的 **46.96%**。
   - 它们分别构成了电机的尾部电气接口盖板与底部安装法兰。
   - 若粗暴过滤删除失效件，导出的模型将缺失近一半关键结构（直接成为空心截断件）；若弱化 `isValid` 强制三角化，将向教学交付存在自相交破面的非法网格。
   - 因此，严格触发【模型故障停下保留状态】，不生成残缺或伪造的 `web.glb`，保留完整的源文件与诊断现场。

---

## 6. 当前现场产物清单
- `.tmp/motor-lab-accessory-models/dm4310/`
  - `source/damiao_dm_j4310_2ec_v1_1.step` (9.9MB, SHA256 核验通过)
  - `source/api_metadata.json` (step.parts 原厂元数据)
  - `work/inspect_step.py` (FreeCAD 对象与单位探查脚本)
  - `work/diagnose_step.py` (BRep 几何有效性深度诊断脚本)
  - `work/test_import_modes.py` (FreeCAD / Part.read 导入模式验证脚本)
  - `work/inspect_parts.py` (全零件尺寸、体积与面数详尽提取脚本)
  - `work/objects_info.json` (结构化对象清单)
  - `manifest.json` (机器可读交付清单，状态：`halted_source_geometry_fault`)
  - `report.md` (本综合审计报告)
