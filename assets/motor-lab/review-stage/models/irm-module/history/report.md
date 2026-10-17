# Mean Well IRM-60-xx THT 板载模块 STEP 本地建模与几何审查报告

## 1. 任务背景与资产定位

- **目标组件**：Mean Well IRM-60-xx THT 直插式 AC/DC 灌封模块（KiCad 3D 封装源）
- **唯一分工与角色**：作为电机实验台板载电源封装候选（Footprint Candidate），**绝非**已被批准选定的 M3508/C620 实验电源，亦不代表现场市电施工方案或经过电气安全认证的实体。
- **工作区隔离**：本次所有新增与派生产物严格限定在 `.tmp/motor-lab-accessory-models/irm-module/`，未修改任何项目业务代码、文档、共享工具、Git 历史或外部环境。

---

## 2. 原始资产来源与许可链 (Provenance & License)

- **API 索引**：`https://api.step.parts/v1/parts/converter_acdc_meanwell_irm_60_xx_tht`
- **上游源仓库**：KiCad 官方 3D 库 `https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/0bc64e922178140eb6890377646efd45e15011bd/Converter_ACDC.3dshapes/Converter_ACDC_MeanWell_IRM-60-xx_THT.step`
- **下载源 URL**：`https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/converter_acdc_meanwell_irm_60_xx_tht.step`
- **本地落盘文件**：`source/converter_acdc_meanwell_irm_60_xx_tht.step`
- **文件体积**：63,804 字节
- **原始文件 SHA-256**：`679852f7fdc2e50e53d9679137f312dadae9caffc0cebfe9b46be25ca356042d`
- **单位声明**：经正则匹配确认，STEP 头明确声明 `SI_UNIT(.MILLI.,.METRE.)`，为毫米标准件。
- **版权与许可声明**：
  - 许可协议为 `Creative Commons CC-BY-SA 4.0 License with KiCad exception`。
  - 仅作为本地私有离线 CAD/3D 审查与教学实验台几何包络校核，不视为持有人的公开二次分发许可。

---

## 3. 几何拓扑与 BRep 有效性审查 (Inspection)

经 FreeCAD 内核在系统文件锁保护下（`flock -w 90 .tmp/motor-lab-models/_tools/convert.lock`）只读导入解析：

- **文档总对象数**：60 个（含基准面、原点、坐标轴与装配复合节点）
- **包含有效实体面的叶子 Part::Feature**：共 6 个，`isValid` 均为 `True`，无退化面或拓扑错误：
  1. `e50ef681-4cb7-11ee-8265-85d007bab819_part`：模块主塑料壳体，26 面，1 实体，1 壳，尺寸包络约 87.04 × 52.04 × 29.50 mm；
  2. `e50ef682-4cb7-11ee-8265-85d007bab819_part`：Pin 1 / 方位微小指示体，6 面，1 实体，1 壳，尺寸包络约 0.10 × 0.10 × 0.10 mm；
  3. `e50ef683-4cb7-11ee-8265-85d007bab819_part`：THT 直插引脚 1（输入端），4 面，1 实体，高度 3.60 mm；
  4. `e50ef683-4cb7-11ee-8265-85d007bab819_part001`：THT 直插引脚 2（输入端），4 面，1 实体，高度 3.60 mm；
  5. `e50ef683-4cb7-11ee-8265-85d007bab819_part002`：THT 直插引脚 3（输出端），4 面，1 实体，高度 3.60 mm；
  6. `e50ef683-4cb7-11ee-8265-85d007bab819_part003`：THT 直插引脚 4（输出端），4 面，1 实体，高度 3.60 mm。
- **总几何面数**：48 面
- **总外形包络 (mm)**：`87.04 × 52.04 × 33.00` mm（外壳主体高 29.5 mm + 引脚外露长约 3.5 mm）。
- **FreeCAD 几何有效性**：全部 6 个实体 `isValid` 均为 `True`。

---

## 4. GLB 转换与渲染分色 (Conversion & Web Asset)

使用只读工具 `.tmp/motor-lab-models/_tools/convert_step.py` 进行三角化与坐标系转换：
- 坐标变换：STEP 毫米单位转换至米，中心对齐，轴向映射 $(x, y, z) \to (x, z, -y)$。
- 偏置容差：`--deflection 0.12`。
- 分色配置 (`work/palette.json`)：
  - 壳体采用深暗工程塑料配色 `[0.18, 0.18, 0.20, 1.0]`；
  - 标记结构采用中性微灰 `[0.35, 0.35, 0.38, 1.0]`；
  - 4 根引脚严格按照 FreeCAD 导入后的完整 Label 配准金属银锡色 `[0.75, 0.76, 0.78, 1.0]`；
  - 明确声明：所有材质分色仅供几何审查与目视区分，不代表材料化学成份或电气特性。
- **输出产物**：`output/web.glb`
  - 文件体积：1,060,724 字节
  - 文件 SHA-256：`16683d98968972981fa70eec266c3138ddd2cd5f90ad63fc07cad06ea1e6925d`
  - 顶点数：23,082
  - 三角面片数：41,616
  - glTF 验证结果：经项目内 `gltf-validator` 独立检测，**0 错误、0 警告**（仅 1 个默认未引用材质提示）。

---

## 5. 无头浏览器渲染审查与多视角快照 (Visual Verification)

通过 Playwright 无头 Chromium 实例加载 Three.js 场景（无任何外部网络请求），渲染生成的 `output/web.glb`：

1. `review/overall.png`：整体斜俯视图，清晰呈现模块长方体外形与圆角塑料包络；
2. `review/back.png`：背部仰视图，清晰呈现 4 根直插引脚在底部的两组分布；
3. `review/interface.png`：侧向视角，展示引脚向下凸出的物理间隙；
4. `review/body-closeup.png`：主体表面特写；
5. `review/pins-closeup.png`：专门针对引脚接口（`e50ef683` 节点组）生成的近景仰视特写，清楚核验 4 根引脚的截面形态与排布。

所有截图均已由 Agent 通过图片阅读能力完成逐项验真核验。

---

## 6. 严正工程边界声明 (Crucial Engineering Boundaries)

1. **非选定实验电源**：本项目电机实验台目前基准动力来自 24V 直流总线系统，IRM-60-xx 为市电 100-240V AC 输入转板载 DC 的封装几何，仅供未来板载集成或备选供电方案做物理尺寸核验，**严禁**虚构其为现已选定的 M3508 供电装置。
2. **严禁推断内部电气参数**：不虚构其 24V 输出变种、不臆测额定载流能力与纹波指标，严禁根据模型推断内部电路拓扑或芯片型号。
3. **未通过电气与施工认证**：4 根引脚的实际极性（AC/L、AC/N、+V、-V）需严格对照明纬（Mean Well）官方数据手册与实际 PCB 原理图引脚网络核定，本模型仅代表物理引脚几何，不作为现场市电接线与通电施工依据。


## 主模型复核

实际对web.glb运行validator：0错误0警告、1未用材质信息，41616三角；已看pins-closeup图，确有底面针脚但取景不够近，不称细节全部验收。当前只有web版本，high未生成；这是板载封装候选不是主供电。用户已明确主电源TB47D，本模块不加入主闭环BOM。
