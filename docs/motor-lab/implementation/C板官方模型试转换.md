# C型开发板官方模型试转换

## 目标与状态

用户要求先尝试官方C板真实外形能否生成高细节网页模型，并询问辅助技能。已读取cad技能及mesh导出规则，采用本机既有FreeCAD 1.1.3执行无安装的简单替代流程。没有改实验台粗模或冻结整车GLB。

结论：**官方STEP确有详细外形，已生成本地GLB并用Three.js实际加载、查看正反面。** 包含外壳开口、连接器针脚/插座轮廓、通孔等，不是程序化占位方块。颜色/丝印未恢复；精确端口命名和实物修订匹配未验收，暂不接入主课件。

## 来源与文件

- 官方索引：https://rm-static.djicdn.com/live_json/simple_cms.json
- 源链接：https://rm-static.djicdn.com/tem/35228/mounting_the_board_type_c_asm(202001072134).stp
- 本地：`.tmp/c-board-official/c-board-official.stp`，10,843,660字节。
- SHA-256：`237365773a6114ee14a64a92992df8e462d2b4e9e20b708dd40054d7efd74bae`。
- 许可：未取得具体公开再分发条款。本轮依用户指示本地下载/转换/预览，不将用户指令等同版权人授权，不提交源STEP或GLB到公开仓库。

## 实际检查与转换

1. FreeCAD导入约12秒；剔除坐标轴/基准面和App::Part聚合重复项，保留8个Part::Feature叶实体。各实体有效性检查通过。
2. STEP显式单位毫米；全局包络41.004944×60.327510×16.300000 mm。该数值是本文件外包络，不是制造公差认证或所有硬件版本的尺寸。
3. 面级三角化线偏差参数0.035mm，不做降面；保留8个独立实体网格，转为米，坐标(x,y,z)→(x,z,-y)，整体居中。保留每面边界，使用中性双面审查材质；原厂颜色和丝印不在此次导出范围。
4. `.tmp/c-board-official/c-board-official-review.glb`：22,411,108字节、813,282三角面、8网格。该版本用于细节检查，**尚未轻量化**；文件体积不是运行时内存。
5. 浏览器GLTFLoader加载8网格、无pageerror；主模型实际查看overview.png与underside.png，外壳和接口轮廓及底部安装孔可见。软件渲染不是目标投影设备性能验收。

临时脚本：inspect_step.py、convert_preview.py、review.mjs；数据：inspection.json、conversion.json、source.json；正反面截图同目录。预览HTML依赖本地vendor，自动化通过Playwright私有路由加载，不是已部署网页入口。

## 本地网页配色预览增量

按用户要求，将私有预览页改为石墨外壳/深蓝组件/金属色安装件的展示配色。只在加载后的Three.js材质上着色，源STEP和GLB字节未改，不是原厂材质还原。已实际浏览器加载8网格、0页面错误，并目视`colored-preview.png`。当前部分插座/针脚与PCB同属一个实体，仍共用颜色；尚未进行面级准确分色或丝印恢复。

临时仅回环预览地址本轮为 `http://127.0.0.1:34813/`，由`.tmp/c-board-official/serve_preview.py`提供，重启后需重核服务状态。未接入公开web目录，未提交/推送。

## 白色接口与银色管脚增量

用户随后指定接口塑料白色、内部管脚银色。新增本地`color_faces.py`按CAD面空间位置及窄接触面规则分配展示材质，导出独立`c-board-official-colored.glb`，不覆盖原始灰色GLB/STEP。8个源实体、813282三角面保持；按材质拆为11个浏览器mesh绘制组，22,413,528字节。不是增加机械实体，也不表示接口已获得逐针语义。

预览页现加载该分色派生GLB，保留石墨板壳，USB金属罩采用银色。主模型实际检查全局与接口侧视截图`white-silver.png`/`white-silver-side.png`，浏览器正常加载。当前是几何面规则辅助分色，不是逐零件材质BOM认证；部分细小面仍可能需按用户截图继续微调。此前深蓝整实体配色只作为历史试验。

## 上盖白色文字与标识

按用户要求将官方CAD已有浅刻文字/标识面单独分配白色材质，保留大面积深色上盖；不是新增猜测接口名称或外部贴图。`color_faces.py`对上盖浅刻面使用独立White lid markings材质；原始STEP/灰色GLB不改。浏览器现12个材质绘制mesh，仍8个源实体。主模型已加载并查看`white-markings.png`，RoboMaster标识、CAN/UART/USB等字样形成清晰白黑对照，0页面错误。接口白壳/银色针脚保持。此增量覆盖此前“丝印未恢复”的当前展示状态，原厂材质精确认证仍未进行。

## 已保存版本与下一器件

用户确认配色后，已将当前GLB复制保存到`assets/motor-lab/c-board/c-board-official-white-silver.glb`，配套`asset.json`及README。输出22,414,380字节，SHA256 `7cb3c5132ba26a4cd2c72d9b2e4987783c89049d3a6cce3672e8fbe9b0ddb777`，保存后核哈希一致。不是仅留临时预览；原始源与转换脚本仍留.tmp，禁止误清理。公开许可未知，不提交/推送或加入公开打包。

下一个推荐器件为**电调中心板2**，理由是官方STEP下载项已有证据、且连接供电/C板/C620，是接线平台下一关键几何。官方入口`https://www.robomaster.com/zh-CN/products/components/detail/2495`，STEP `https://rm-static.djicdn.com/tem/17348/RM_ESC_Center_Board2.stp`。本条是下一步建议，**还没有下载/转换或认证该文件内容**；不混旧中心板，也不认证用户实车版本。

## 下一步

- 为网页准备更低面数候选并做接口/孔轮廓对比，不能以粗暴降面丢失辨识特征。
- 对应官方产品照片核模型朝向、命名接口与版本；端口热点绑定真实几何，不猜逐针电气定义。
- 原厂颜色/丝印与几何精度分别处理；不保证已有CAD含每个PCB电子元件。
- 获得适用分发权限后再决定进入web资源目录及替换C板占位模型。

本轮仅新增临时试转换与此进度说明，未提交/推送、无硬件操作。
