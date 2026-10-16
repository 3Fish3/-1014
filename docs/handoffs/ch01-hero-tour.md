# Handoff — 第一章英雄机器人结构导览与当前会话状态

- **生成时间**：2026-10-15
- **项目路径**：`/home/kekeyuyu/projects/hushi_ec_teach`
- **当前分支**：`feat/ch01-hero-tour`
- **最新提交**：`b71f584` (`feat(教学): 新增第一章英雄机器人六场景结构导览`)
- **远端关联**：`origin/feat/ch01-hero-tour` (GitHub Actions CI 通过)

---

## 1. 核心目标与背景 (Goal & Background)

为刚加入 RoboMaster 电控组的新人开发一套由讲师手动控制的 Web 三维结构导览课件（第一章），基于已冻结的英雄机器人 STEP 对齐模型（`hero_robot_step_aligned.glb`），按“开场 → 整车 → 云台 → 底盘 → 发射机构 → 电机过渡”的顺序帮助新人建立机械与电控认知的整体框架，并承接第二章差速教学小车的仿真与代码逻辑。

---

## 2. 当前完成事项 (What's Been Done)

1. **真实 CAD 节点映射与 P0 设计**：
   - 遍历 `hero_robot_step_aligned.glb` 原始 glTF 树，锁定 47 个关键节点及父链。
   - 确认云台根 `#389`、底盘根 `#135`、发射机构联合拨弹盘 `#2` 与云台内发射机构 `#394`。
   - 提取四轮组（`#139`, `#152`, `#166`, `#248`）及四处底盘 M3508 驱动电机（`#142`, `#155`, `#171`, `#254`）。
   - 产出 `docs/hero-tour/node-map.json`、`docs/hero-tour/P0设计与节点映射.md`、`docs/hero-tour/节点清单.md`。

2. **第一章交互式导览页面开发**：
   - 页面入口：`web/hero-tour.html`，样式：`web/css/hero-tour.css`。
   - 业务逻辑：`web/js/hero-tour.js`，配置驱动：`web/js/hero-tour-config.js`。
   - 支持六个场景手动切换、核心模块自动高亮、四轮组与电机逐项隔离、恢复整车、重播。
   - 支持独立 Yaw/Pitch 几何方向箭头展示，不修改 GLB 几何或关节联动。
   - 运镜平滑且支持鼠标拖拽立即打断，场景切换自动清空高亮材质并调用 `dispose()`。
   - 场景 5 底部直达第二章电机与动力教学入口。

3. **测试、验证与自动化验收**：
   - `npm test`：67 项测试全绿通过（包含四份 GLB 与两份补丁 SHA-256 冻结防护）。
   - Python 运动学与模型测试：4 项通过。
   - 自动化无头浏览器验收：`scripts/hero_tour_check.mjs` 在 1920×1080 与 1366×768 下生成 12 张完整截图及 `docs/hero-tour/browser-report.json`。
   - 产出完整验收说明：`docs/hero-tour/验收报告.md`。

4. **版本控制与工作区对齐**：
   - 提交 `b71f584` 推送至 `origin/feat/ch01-hero-tour`。
   - GitHub Actions 流水线（Run `#38794849779`）全绿成功。
   - 临时工作树已清理，主目录 `/home/kekeyuyu/projects/hushi_ec_teach` 已正式切换至 `feat/ch01-hero-tour`。

---

## 3. 当前工作区状态与未提交文件 (Current State & Dirty Files)

主工作区当前停留在 `feat/ch01-hero-tour` 分支，状态健康，包含 3 份未提交文档：
- `docs/鱼鱼的讲解思路.md`（未跟踪）：鱼鱼亲自撰写的培训备忘与讲解思路（需永久保留）。
- `docs/使用报告.md`（未跟踪）：第二章电控教学系统的使用报告与架构说明。
- `docs/脚本使用说明.md`（已修改）：全套 20 个工程脚本的详细使用手册与风险矩阵。

> **后续状态补注（2026-10-15 后续演进）**：
> - 上述 3 份未提交文档已在提交 `a8747b6`（*docs(文档): 归档第一章交接记录、脚本手册与教学使用说明*）中完成提交归档；
> - 随后依据代码实现与 STEP/导览验收事实统一了 README、agent.md、使用报告、全套 25 个脚本手册与验收文档；当前工作区包含本次文档更新及 PDF 派生产物（未暂存、未提交、未推送）。

本地服务后台监听：
- `http://127.0.0.1:8080/hero-tour.html` (PID: 388093)
- `http://127.0.0.1:8091/hero-tour.html` (PID: 1291477)

---

## 4. 后续任务与剩余工作 (What's Left)

1. **讲师实地试讲验收**：在目标教室或会议室的实际投影设备上运行，核对字体可读性与模型旋转流畅度。
2. **提交主工作区文档**：将上述 3 份未提交的文档作为独立的文档提交保存至 Git。
3. **实车硬件信息核实**：针对 CAD 中标注为“待确认”的部件（Pitch 轴动力源、拨弹电机、实车电调/主控板型号），待开箱实测后补齐文档。
4. **主分支合并与全量交付**：依据鱼鱼明确指令，已将全量审查与严格验证的文档、脚本手册与第一章/第二章完整课件体系合并入 `main` 分支并完成远端推送。

---

## 5. 关键设计约束与防踩坑项 (Key Decisions & Gotchas)

- **GLB 严格冻结**：`web/models/hero_robot_step_aligned.glb` 的 SHA-256 必须固定为 `cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af`，不可修改几何和装配。
- **单 WebGL 实例**：系统严格复用单一 `SceneViewer` 渲染器，不允许多实例导致 GPU 崩溃。
- **打开方式**：必须通过本地 HTTP 服务访问（如 `bash scripts/run_server.sh 8080`），严禁使用 `file://` 双击打开 HTML。
