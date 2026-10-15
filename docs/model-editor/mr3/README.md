# MR-3：英雄模型校核与第10步双模型对照

基线：`feat/model-assembly-editor` / `37d6ecc`。实现分支：`feat/hero-assembly-finalize`。

## 验收结论分开判定

| 维度 | 结论 | 不能据此推导的事项 |
| --- | --- | --- |
| 机械正确性 | 几何证据支持重复平移补偿；仍是“推定修复，待机械核验” | 没有原CAD/实物依据，不认证真实装配、公差、传动形式或整车无碰撞 |
| 文件完整性 | 原样、候选哈希保持基线值；目标补丁仅修改549；三份GLB均为Validator 0错误、0警告 | 文件合规不能证明机械正确 |
| 视觉与交互 | 1920×1080、1366×768双观察区、实际高亮与完整软件回归通过 | SwiftShader不能代表课堂物理GPU流畅度 |
| 课堂GPU | 未测试，单列为部署验收项 | 不以无头帧率、JS堆大小代替GPU/显存和整机性能认证 |

**不建议晋升为已认证正式教学资产。** 可继续作为带明显状态标记的推定候选使用。默认仍加载原样模型，任何正式切换都需用户另外确认。

## 资产与变换边界

本轮没有改动三份既有模型或补丁，也未创建新的“正式”模型：

- `web/models/hero_robot_clean.glb`：源文件。
- `web/models/hero_robot_inferred.glb`：上一阶段推定候选。
- `web/models/repairs/yaw-offset-inferred.json`：哈希绑定、未机械核验补丁。
- 唯一相对源模型的节点变化：`#549 Yaw轴装配体2.1改`，translation 为 `[-1.280010819, -1.367624966, -1.386149849]`。
- 源SHA-256：`f2eefd1ee718e8c0bebd7490968d5b62b4f99a6b640e57905bb3ef940c374baf`。
- 候选SHA-256：`d85a76bd7a2835362efc5839d71e837dfc34fb9b7470d22fd2e03bc7d95337ff`。

JSON其他节点、几何、材质、层级均保留，BIN逐字节一致；`verifiedAgainstCAD` 仍为 `false`。页面外层归一化、显示高亮与观察相机都不写入文件。

## 几何证据与未解决风险

完整数据：[几何校核.json](./几何校核.json)。数值以源GLB坐标单位表示，不把导出精度当成制造精度。

| 项目 | 原样 | 候选 |
| --- | --- | --- |
| 552轴承轴线相对543轴线XZ偏差 | `[1.28001082, 1.38614988]` | 约`[1e-9, 3.1e-8]` |
| 轴方向平行误差 `1-abs(dot)` | 0 | 0；仅平行不能证明同轴，因此同时检查XZ |
| 552底面与547顶面高度差 | `1.36762493` | `-3.6212e-8`，在网格接触分类epsilon内 |
| 驱动/从动命名件中心距XZ | `1.80395` | 约`0.114999971` |
| 两命名传动件Y区间重叠 | 负值，明显错位 | 约`0.007999989`；不等于正确啮合 |

4个可辨识圆孔边界以拟合圆和既有螺栓轴位置比对，最近轴距离最大约`3.50e-5`。这是简化网格支持证据，不能当成完整孔系、公差、螺纹或紧固认证。

### 主要零件穿插检查范围

采用真实世界矩阵。候选的549变换已经生效，不能再对子件额外减同一次offset。

检查10对：`552/547`、`553/547`、`559/547`、`551/563`、`550/552`、`551/552`、`555/551`、`556/551`、`553/559`、`552/566`。

先做带epsilon的AABB初筛，再完整遍历初筛相交零件的全部三角形对；没有抽样或提前截止。只有例证列表限8条，总计数不限。共面接触、边接触、严格面片交叉分开分类。

- 候选中4对存在表面接触分类，其余6对AABB分离；这些指定对未检出严格面片交叉。
- JSON中的`contacts`是三角形对计数，不是实体接触点个数。
- epsilon=`1e-6`用于浮点及简化面片接触分类，不代表制造公差。
- 没有表面交线不能排除完全包含；未进行封闭实体布尔体积分析。
- 没有做整车全对碰撞扫描，其他零件、螺纹、隐藏内部结构不在覆盖范围。
- 两个45齿命名件并未直接接触；可能缺少其他传动件，不能凭名称断言齿轮啮合，也未补造皮带。

## 第10步展示

入口：

- 原样默认：`http://127.0.0.1:8080/ui-v2.html?step=10`
- 显式候选：`http://127.0.0.1:8080/ui-v2.html?step=10&assembly=inferred`

一个WebGLRenderer，左右各自拥有相机、OrbitControls和自身几何拟合范围。模型用场景layers隔离，灯光与网格共用；退出第10步恢复原场景层、主控制器和完整viewport。

“原样/候选”下拉仅影响当前页面及URL，不改变默认资源。每次切换成功才替换旧模型；迟到回包按请求序号丢弃，失败保留旧模型与对应标签。切换英雄资产不重置教学车的平移视角。

原样默认“主体取景”只在计算相机范围时排除549，**没有隐藏或删除该组**。选择“完整资产”可查看包括偏置件的全部几何。候选始终按全部可见几何取景。

功能对照实际克隆并改变匹配部件的显示材质，结束或切换步骤时恢复并释放克隆：

- 车架、轮组、电机：两侧可识别区域均高亮。
- 供电、控制：仅高亮教学车对应功能件；英雄侧无可靠位置依据，保持“未确认”。

CAD原名来自GLTFParser节点索引；多primitive Mesh继承其真实CAD节点名称，只匹配末段，不把名称路径中的“底盘”误当成所有部件的分类。

对照工具移入左侧演示区独立行，1366×768不再压住右侧卡片。离开第10步时观察层与资产工具真正隐藏；右侧内容可正常纵向滚动。

## 截图与前后对照

均为真实浏览器截图，软件渲染：

- 原样主体：`media/original-subject-1920.png`、`media/original-subject-1366.png`。
- 原样完整（包含偏置组）：`media/original-complete-1920.png`、`media/original-complete-1366.png`。
- 候选整车：`media/candidate-1920.png`、`media/candidate-1366.png`。
- 五类实际高亮：`media/highlight-{frame,wheel,motor,power,control}-{1920,1366}.png`。
- 高DPI补充：`media/candidate-dpr2-1366.png`，CSS像素截图。
- 原悬空组近景：`media/floating-before.png`。
- 同一相机看原接口前后：`media/interface-before.png`、`media/interface-after.png`。该近景聚焦接口，因此其他整车部位可能出画；整车拟合结论依据上面的完整整车截图。

## 可重复验证

先启动 `bash scripts/run_server.sh`。浏览器脚本默认写`.tmp/ci/`，不覆盖本交付证据。

```bash
npm test
node scripts/validate_models.mjs
node scripts/hero_assembly_audit.mjs
node scripts/model_repair_check.mjs
node scripts/inferred_assembly_check.mjs
node scripts/hero_comparison_check.mjs
node scripts/hero_assembly_evidence.mjs
OUTPUT_DIR=.tmp/ci/v1 node scripts/browser_check.mjs http://127.0.0.1:8080
OUTPUT_DIR=.tmp/ci/v2-p0 node scripts/ui_v2_check.mjs http://127.0.0.1:8080
OUTPUT_DIR=.tmp/ci/v2-p1 node scripts/ui_v2_p1_check.mjs http://127.0.0.1:8080
```

本地：42项单元测试通过；3份模型Validator 0错误、0警告；原编辑器、候选、MR-3浏览器验证及V1/P0/P1回归通过。相关记录：[双观察区验收.json](./双观察区验收.json)、[近景对照.json](./近景对照.json)、`docs/gltf-validation.json`。

独立相机拖拽保持另一侧严格不变；资产切换的相机位置比较仅容忍`1e-12`浮点舍入，同时严格保留先前平移目标，不能把重新取景当成误差。另测DPR=2、注入503、迟到成功/失败、步骤往返和`pagehide.persisted`资源保留分支。后者是合成事件分支验收，不是对所有浏览器实际bfcache行为的认证。

Actions增加几何审计、MR-3浏览器验证和近景生成，仍须所有检查成功才打包。云端结果以对应提交的[Actions记录](https://github.com/3Fish3/-1014/actions)为准，不用此前提交的绿勾代替。

## 课堂物理GPU验收（尚未执行）

| 待记录项 | 当前值 |
| --- | --- |
| 教室主机、GPU、驱动、浏览器版本 | 未采集 |
| 实际投影分辨率/DPR | 未采集 |
| 原样/候选双区连续旋转与五类高亮，帧间隔与卡顿 | 未测 |
| 首次加载峰值、浏览器总内存及GPU显存 | 未测 |
| 连续10分钟切换及退出重入稳定性 | 未测 |

这些项目不以SwiftShader的通过结果替代；没有实际课堂硬件数据前不承诺目标帧率或显存上限。
