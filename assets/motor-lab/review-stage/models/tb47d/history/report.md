# TB47D 电池本地 STEP 静态模型候选 — 阶段报告

状态: **转换与校验完成；截图目视复核被会话模型能力阻断（已如实记录）**

## 来源核验

- 原件（绝对只读，未改动）：`/home/kekeyuyu/projects/SERS/官方零件/RoboMaster官方零件/TB47d电池/TB47d(1).STEP`
- 695,780 字节；SHA-256 `3fd17c9b74e478af02b3c909e6a90b9a93ace0f6d03b27cc142f235b24a6545c`（与授权给定一致）
- 文件头：STEP AP214（AUTOMOTIVE_DESIGN）、SolidWorks 2016、产品名 TB47d——仅证明文件身份；目录命名不认证原厂授权；许可 unknown，仅本地私有审查，不分发。

## FreeCAD 实测几何（非推断）

单文件枚举见 `work/inspect.json`、`work/features_final.json`：

- **1 个 Part::Feature**（label `TB47d`），307 面 / 1 solid / 1 shell，`isValid()=true`，体积 402.66 cm³
- 全局包络 101 × 43 × 139 mm；无 App::Link、无父聚合重复
- 面型普查：Plane 171、Cylinder 128、Cone 4、Sphere 4
- 特征证据（截面切片）：
  - 主体平台 x −36.5..36.5、y ±20、z 0..~119.5（与电池架腔体适配尺度相符）
  - z≈119.5..139 加宽至全尺寸 101×43
  - **端面触点簇实际存在**：x=−56 与 x=43.5 截面各 10 线，z 121..136、y ±12
  - 顶面 z=138 有 25 线细节（按键/LED/触点样）；底部 z=2 有 2 线（凹槽/脚垫样）
- 针序、极性、按键/LED 语义：几何元数据不存在，**UNVERIFIED，未虚构**

## 产物（共享转换工具只读调用，单层 flock，未超时）

| 文件 | deflection | 字节 | SHA-256 | 三角形 | validator |
| --- | --- | --- | --- | --- | --- |
| `output/web.glb` | 0.12 mm | 702,764 | `c7c4a1d5…c81e0e69` | 20,634 | PASS 0E/0W/1I（未用默认材质，工具固有） |
| `output/high.glb` | 0.035 mm | 706,364 | `2be874e2…14160f730a` | 20,734 | PASS 0E/0W/1I（同上） |

- 完整哈希：web `c7c4a1d5b381fe8d7a1e3c47a7cfb6912b314771c9bd62a4c08c5a3fc81e0e69`；high `2be874e285b0568445236930d17577e3d5087fac4da871de43c5ec14160f730a`
- validator 详情：`review/validator-web.json`、`review/validator-high.json`
- 单位与轴向：mm→m，(x,y,z)→(x,z,−y)，居中，Y-up（转换器 sidecar JSON 记录）
- 层级说明：工具扁平化输出；源本身单实体单 mesh，无层级丢失，未宣称完整层级保存

## 配色决策

源为**单一未分件实体**，无部件标签可供 palette 键控；`.tmp/tb47d-research` 仅 PDF/文本、无本地照片。黑壳/银触点配色属展示推定且无键可挂，按约束**保持工具中性材质**并在此明示；未照套 C 板面空间规则。

## 截图证据与目视状态

- 已生成：`review/overall.png`、`review/back.png`、`review/interface.png`（1200×900，27–39 KB）+ `review/browser.json`
- 浏览器渲染成功：bbox [0.101, 0.139, 0.043]，1 mesh，0 JS 错误
- **目视复核 BLOCKED**：本会话模型非多模态，read 图片被内容过滤（管线本身正常）。截图已落盘，需多模态模型或人工复核后才能闭环。

## SIM 假设与边界

- 24V 仅为供电链教学 SIM 假设；原厂额定（DJI 官方 22.2V / AI2019 手册 22.8V 矛盾，见 `../tb47d/report.md`）未改写；不给上电建议
- 未做电池架装配调整、硬件接线、电极认证
- 未动已运行私有预览服务；无 Git 写入、无依赖安装、无网络访问

## 约束遵守

仅写 `tb47d-local/{source,work,output,review}`；SERS 原件零改动（哈希前后一致）；共享工具只读；work/ 内临时解析文件已清理（features.json 中间态已删，保留 inspect.json / features_final.json）。

## 未完成与下一步

1. 截图目视复核（多模态模型或人工）— 恢复动作：直接 read 上述 3 张 PNG
2. 针序/极性认证：需实物或权威文档，模型侧无来源
3. 与电池架（`../battery-rack/`）装配预览属后续任务，本任务未动
