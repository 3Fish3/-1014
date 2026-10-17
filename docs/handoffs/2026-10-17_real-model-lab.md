# Motor Lab真实模型接入与自动接线交接

> 阶段核验记录，非持续实时状态；项目唯一当前入口为[当前项目状态](2026-10-16_current-status.md)。

## 走线细化增量（2026-10-17 07:31 UTC记录）

本地`main@13f45c4`，工作区仍有大量原有及本轮未提交文件，未清理、暂存、提交或推送。GLM走线代理超时未落代码，主模型接手实现，不重复启动。

### 已完成

- 源插座网格/已查CAD区域锚定14个功能端点，旋转后法线正确向外。中心板XT60接触轴经原CAD检查，从侧面出线；凹入座沿轴延至壳体出口作功能标记，仍不认证原厂插接面。
- 线身沿法线离开端口，再抬升绕过设备；简化线头对齐法线。修正中心板CAN朝内、C板CAN区域错误与C620壳体包围盒代替插座的问题。
- 电池架颈部就位及中心板/C620翻正已保留；不再分离展示。机身插座恢复可见，源长线仅运行时隐藏。
- 近景隐藏挡住接口的标签；面板折叠时用ResizeObserver适配画布，避免只绘制半幅。

### 实际验证与证据

- `npm test`：86项通过；其中`tests/motor_lab_routing.test.js`新增5项，测试端点/切向、跨障碍、顶面出线、粗筛命中、三角面复核空腔与真实障碍。
- `node tests/motor_lab.real.browser.mjs`：28项通过，0跳过/0页面错误/0外部请求；报告`.tmp/motor-lab-real-check/report.json`，包括自动7链路、逐条拖线、14法线与线身连续、视角、折叠/窄屏、故障恢复和缺件禁用。
- `python3 tests/test_motor_lab_local_server.py`：5项通过。
- 五个改动JS文件LSP探测0诊断，4文件确认clean、1静默服务器未确认；语法和`git diff --check`通过，不把静默当完整LSP验收。
- 已实际查看`.tmp/motor-lab-real-preview/cable-routing-overall.png`、`cable-routing-esc-closeup.png`、`cable-routing-center-closeup.png`。`.tmp/motor-lab-real-preview/socket-axis-source.json`为原CAD轴线记录。
- 检测采用包围盒粗筛＋可见三角面偏移线段采样，接头接触区豁免；不能当作连续碰撞、原厂弯曲半径或逐针安全认证。只读钩子分开返回`cableBoundsCandidates`与`cableIntersections`。

### 恢复与剩余

本地服务仍以`.tmp/motor-lab-real-preview/server.json`为入口快照（本轮37921），接手需重新核验，不能清理模型相关.tmp。核心修改：`web/js/motor-lab/{real-models,app,cable-routing}.js`、两个测试文件及执行计划。原STEP/GLB和SIM协议未改，未操作硬件。

剩余：电池架输出口身份、线端精确料号/键位/逐针及真实配合面；示意线不允许直接照抄上电。原型期81/26测试结果见下方历史快照，不能替代本轮86/28。

## 历史基线与工作区快照（以下为06:05阶段记录）

核验时间：2026-10-17 06:05 UTC起的本轮最终验收；main@13f45c4，工作区有大量既有未提交文档/模型/脚本，未清理或提交。README、agent.md、旧文档等修改不是本轮新增，不要覆盖。状态与PID/URL都是快照，接手重新核验。

## 目标与本轮结果

用户授权持续派子代理完成电池/线材并将真实模型替换进独立Motor Lab，自动接线、手动插拔、自由视角；后续模型指定CPA/glm-5.3-flash。前端GLM超时且未写实现，主模型直接实现；服务/测试代理初稿由主模型补齐验证。当前没有待等结果才能运行的实现任务。

**已完成真实外形＋功能级虚拟接线实验台**：6源模型加载、单一SIM、自动7链路、逐条手动拖线、错误拒绝/断线/ID/故障恢复/代码控制/暂停单步/旋转平移缩放/手机布局。不是原厂完整线束或真实配合面验收。M3508静态轴不作假旋转，界面数据为SIM；24V为用户确认教学假设。

## 本轮关键文件

- `web/js/motor-lab/real-models.js`：六模型源加载、共同20倍显示尺度、真实主体包络定位、少量实际mesh端点与明确未核功能标记；电池/架分离摆放。原长线/远端头运行时隐藏，源不变。
- `web/js/motor-lab/app.js`：删除旧方块设备生成器，异步加载gate、只读getSceneStatus、真实数据驱动fit/聚焦、简化线头＋柔性线、自由相机、按需渲染及实时SIM状态栏。
- `web/motor-lab.html`：真实源外形及功能线端边界、TB47D说明、额外电池/分电聚焦按钮。
- `scripts/run_motor_lab_local.py`：Python标准库、127.0.0.1专用服务；web静态＋固定模型白名单，不暴露整个.tmp/SERS，不复制未知许可模型进公开web。
- `tests/motor_lab.real.browser.mjs`：测试自启自停专用服务、实际投影端点，不硬编码旧相机；`tests/motor_lab.browser.mjs`为兼容入口。
- `tests/test_motor_lab_local_server.py`：5项回环/路径/目录/HEAD/模型白名单测试。
- `docs/motor-lab/implementation/真实模型本地运行说明.md`与`真实模型与自动接线执行计划.md`：当前运行/验收/缺口。

源模型保持各原路径，服务白名单见运行说明。TB47D深灰派生`.tmp/motor-lab-power-chain/assembly-step/output/battery.glb`的BIN与源一致，主模型已实际校验0错0警告；原SERS STEP哈希`3fd17c9b74e478af02b3c909e6a90b9a93ace0f6d03b27cc142f235b24a6545c`未变。英雄冻结GLB仍`cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af`。

## 最终实际验证

- `npm test`：81项通过。
- `node tests/motor_lab.real.browser.mjs`：26项通过，0跳过/0pageerror/0外部请求；覆盖六真实源、初始六主体包围盒/14端点、自动链路与七条逐一拖线、相机三种操作实际改变、故障/反转/注入拒绝、窄屏、缺件ready=false和禁用运行，含实时状态栏更新。
- `python3 tests/test_motor_lab_local_server.py`：5项通过。
- `node --check`/Python编译与`git diff --check`通过；LSP探测6文件0诊断，5确认clean、1静默服务器未确认，不冒称全部LSP确认。
- 主模型查看`.tmp/motor-lab-real-check/real-models-loaded.png`以及`.tmp/motor-lab-real-preview/auto-wired-running.png`，可见真实C板丝印/接口、其他主体与互动线。最终运行截图已重截，状态栏显示目标1200RPM、SIM转子约1195RPM；与动态计算一致，不是硬件采样。
- 均是软件/无头验证，不等于教室投影设备性能通过。源高面数未压缩，当前采用按需绘制/关闭额外阴影，未删几何。

## 本地入口与恢复

本轮专用预览服务为`http://127.0.0.1:37921/`（脚本日志`.tmp/motor-lab-real-preview/server.log`，PID文件`server.pid`，需重新核验）。URL根即实验台。旧8080普通静态服务不含受限模型白名单，直接用它打开新版会明报模型缺失，这是预期，不要以恢复粗模绕过。

若服务已停：`python3 scripts/run_motor_lab_local.py --port 0`，按首行JSON给出的实际URL访问。此命令仅回环，模型目前仍依赖相关.tmp，请不要清理。不要停止其他会话已有服务。

## 尚未完成（不是本轮假通过）

1. 真实线端准确料号/配合面/逐针映射；目前彩色端点与简化插头明确是功能示意，不给实物施工许可。
2. 电池与架机械就位与电源实际极性/保护；当前分开显示，24V仅SIM。
3. M3508独立轴网格/枢轴与准确转动动画；不能转整机冒充轴。
4. 稳定长期资产目录、逐件公开分发许可及部署包装；当前不公开未知许可源。
5. 主课件入口新增与目标设备性能；独立页已有回原课件链接，但原课件未新增入口。

下一步优先按真实接口补线端、逐点替换示意锚，不重新转换已验过的全部器件。无Git提交推送、硬件操作、付费模型购买；任何发布/硬件范围需要新授权。
