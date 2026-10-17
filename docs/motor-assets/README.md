# 电机机械模型盘点

## 结论

**有电机三维几何，但本次仓库检查未发现独立电机单件 STEP/STL/GLB 文件。**

- 英雄冻结模型内：**8 个按 CAD 型号命名的电机本体节点 = 7 个 M3508（底盘 4、摩擦轮部件 3，镜向 #454 已含在这 3 个中）+ 1 个 DM-J4310 V1.1**。另有 6 个摩擦轮关联件、1 个托架命名待核件，总计 15 个名称匹配网格节点。
- 双轮教学车内：**有 2 个简化电机几何**，`Node_LeftMotor`、`Node_RightMotor`（各 172 三角面）；还有 `Node_MotorDriver` 驱动板（不是电机本体）。生成依据为 `scripts/generate_diff_car.py:133–137`，不是实物精确 CAD。
- `motor_materials/` 为官方 PDF 与索引，没有独立 CAD 附件。官方尺寸图与三维 CAD 文件不是同一种资产。

此前“教学车无电机网格”是脚本漏搜英文 `Motor` 导致的错误，已撤回；此前“8 个 M3508 + 1 个达妙/9 个本体”是重复计算镜向件导致的计数错误，已统一为 7+1。

盘点基线：`main @ f83ef00`，工作区未提交。CAD 名称只说明模型来源命名，不能认证实车在役器件或内部构造。

## 两套模型的可复核清单

| 模型 | 角色分类 | 报告 |
|---|---|---|
| `hero_robot_step_aligned.glb` | 本体8、待核1、关联6，共15 | [JSON](motor-node-map.json)、[网格清单](电机网格清单.md) |
| `diff_car_teaching.glb` | 简化电机本体2、驱动板命名待分类1，共3 | [JSON](teaching-motor-node-map.json)、[网格清单](teaching-motor-node-map.md) |

| 英雄模型部件 | 节点 | 三角面/节点 | 局部包围盒（源单位×1000） |
|---|---|---|---|
| 底盘 M3508 ×4 | #142/#155/#171/#254 | 各17620 | 42.0×42.0×98.4 |
| 摩擦轮 M3508 ×3（含镜向） | #431/#438/#454 | 1540/1540/1528 | 41.9×42.0×42.9 |
| DM-J4310 V1.1 ×1 | #566 | 2766 | 56.7×46.0×56.9 |

#564 名为“托4310电机2-1”，局部薄板外形更接近托架，不计电机本体。完整命名和父链见 JSON。

## 方法与限制

脚本 [motor_model_inventory.py](../../scripts/motor_model_inventory.py) **整文件读取并计算哈希，仅解析 glTF JSON，不解码 BIN 几何，不写回模型**。不能声称完全未读取 BIN 字节。依据网格 POSITION accessor 的 min/max 与节点父链变换得到包围盒；世界 AABB 是变换后的局部包围盒外包络，不是解码顶点后计算的精确外形尺寸。

- 英雄模型冻结 SHA-256：`cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af`。
- 教学车 SHA-256：`bf561d777edffc595cffcc40b500aa0a646b56145471129e91ae6b410a5f82e7`。
- 英文/中文名称匹配不是穷尽几何识别，未匹配不能证明没有电机；`MotorDriver` 命中也不能当作本体。教学两电机分类有生成脚本佐证。
- 列主序父子矩阵组合已修正并重新生成报告；旧世界包围盒数字不再作为事实。局部包围盒与既有 `docs/hero-tour/node-map.json` 不同基准的数据不能直接比较，尤其 #438/#454 的差异未做顶点级收敛，不覆盖历史文件。
- 本体节点未提供可独立选取的转子/绕组/齿轮分层；本轮不能交付电机内部拆解演示。单网格本身不能证明内部完全无几何。
- 数值乘1000只是展示尺度，不作为毫米尺寸或整车装配认证。官方 M3508 外形图可提供尺寸参照，但本轮未做几何与尺寸链认证。

## 复核命令

在仓库根目录运行；只读源模型，会重生成对应 JSON 和 Markdown 清单：

```bash
.venv/bin/python scripts/motor_model_inventory.py
.venv/bin/python scripts/motor_model_inventory.py web/models/diff_car_teaching.glb --out docs/motor-assets/teaching-motor-node-map.json
.venv/bin/python tests/test_motor_model_inventory.py
```

教学报告使用独立路径，不会覆盖英雄报告。

## 后续可选路线（未执行）

仅观察外形，可先用现有整车查看器隔离对应节点；教学车已有简化电机示意。若要独立单件模型，可另行确认从源 STEP 导出、从整车派生新 GLB，或取得官方/标准件 CAD。任何新增资产都需注明来源与核验边界，不覆盖冻结模型。本轮未联网下载、未导出单件、未提交或推送。
