# 器件STEP资源核对

## 范围与证据

按用户要求只核对模型资源，不开展新建模/转换。主模型重新获取RoboMaster官方CMS索引并抽取模型文件条目，通过7897代理以最多3并发逐项HEAD检查；18个候选链接均返回HTTP200。缓存及逐项结果：`.tmp/step-resource-check/official-cms.json`、`step-candidates.json`。HTTP200只说明链接响应，不代替下载后的STEP格式、型号/几何完整性和许可核验。

**本次发现纠正前期调查缺口**：C620、GM6020、M2006、C610、Snail2305实际上均有官方STEP资源条目。旧分支报告“尚未检得”是当时检索不足，不是不存在；后续优先使用本次确证链接，不要再根据旧稿安排从零重建。

## 第一批：接线闭环器件

| 器件 | 状态 | 官方资源/说明 |
|---|---|---|
| C型开发板 | 本地已下载、转换、分色保存 | https://rm-static.djicdn.com/tem/35228/mounting_the_board_type_c_asm(202001072134).stp |
| 中心板2 | 官方STEP链接HTTP200，未下载/开模 | https://rm-static.djicdn.com/tem/17348/RM_ESC_Center_Board2.stp |
| C620 | 官方STEP链接HTTP200，未下载/开模 | https://rm-static.djicdn.com/tem/17348/C620无刷电机调速器.STEP |
| M3508 | 本地`.tmp/m3508-model/m3508.stp`已有；仅核格式头，几何待核。官方另有STEP条目HTTP200 | https://rm-static.djicdn.com/tem/17348/RoboMaster%20M3508直流无刷减速电.stp |
| 实验电源/保护组件 | 未定具体实物型号，无法匹配特定STEP | 不能用裁判系统电源模块直接替代实验电源 |
| XT30/XT60、CAN/7-pin接头、三相端及线束 | 尚未逐件核定系列与STEP | 器件总装含端口外形不代表含独立配对插头或成品线束；后续先核料号再找厂商模型 |

M3508官方英文目录存在同名URL有空格/无空格而标题分别称电机/附件包的情况，不按URL名称判定文件内容，实际下载后再逐项核查。

## 第二批：电机对照

| 器件 | 状态 | 官方资源 |
|---|---|---|
| GM6020 | 官方以ZIP发布STEP，链接HTTP200；压缩包内容尚未读取 | https://rm-static.djicdn.com/tem/17348/RoboMaster%20GM6020%20Brushless%20DC%20Motor.step.zip |
| M2006 P36 | 官方STEP链接HTTP200 | https://rm-static.djicdn.com/tem/17348/RoboMaster%20M2006%20P36.STEP |
| C610 | 官方STEP链接HTTP200 | https://rm-static.djicdn.com/tem/17348/RoboMaster%20C610.STEP |
| Snail2305 | 官方STEP链接HTTP200 | https://rm-static.djicdn.com/tem/17348/snail_2305_brushless_dc_motor.stp |
| C615 | 官方STEP链接HTTP200 | https://rm-static.djicdn.com/tem/17348/c615_brushless_dc_controller_asm.stp |
| DM-J4310-2EC | 已有厂商资料托管仓库3D目录线索，未确认具体STEP文件/修订 | 本轮GitHub tree API返回403；保留待核，不宣称不存在或已有可用STEP |

## 第三批与未选型号

- 旧中心板：官方STEP链接HTTP200，`https://rm-static.djicdn.com/tem/RoboMaster中心板-STEP.STEP`，只作对照，不套中心板2定义。
- M3508附件集线板：官方STEP链接HTTP200，`https://rm-static.djicdn.com/tem/17348/M3508附件包_集线板.STEP`；不自动等同中心板2或完整线材包。
- UART模块：未选定商品型号，不声称特定芯片相同就共享外壳/接口模型。
- 官方PM01电源管理模块另有STEP，但不是实验电源/保护选型已经完成，不增加到当前闭环既定BOM。

## 下一步

先处理中心板2与C620，再复用已存在的M3508源文件，逐件下载/读取单位、层级和端口几何，避免重复从零建模。当前仅核资源可访问；除C板和已由其他任务放入的M3508外，本轮未下载新CAD，公开再分发条款尚未逐件取得，不提交或发布二进制。
