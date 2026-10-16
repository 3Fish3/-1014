# Handoff — 第一章英雄机器人结构导览与当前交付状态

- **生成时间**：2026-10-15（2026-10-16 文档审查后更新）
- **最近一次状态核验**：2026-10-16 12:59:56 UTC（本地 `main` @ `a41ee8b`；远端 `origin/main` @ `a41ee8b`，一致）
- **项目路径**：`/home/kekeyuyu/projects/hushi_ec_teach`
- **交付主分支**：`main` @ `a41ee8b`（远端仅存此一个分支）
- **文档审查修复落地状态**：**已完成**——修复提交 `a41ee8b` 基于基线 `f6110b0`，已快进合入 `main` 并推送到 `origin/main`，云端 CI 全绿。**接手 agent 无需重复合并或推送**（详见第 3 节）。

---

## 1. 核心目标与背景 (Goal & Background)

为刚加入 RoboMaster 电控组的新人开发一套由讲师手动控制的 Web 三维结构导览课件（第一章），基于已冻结的英雄机器人 STEP 对齐模型（`hero_robot_step_aligned.glb`），按“开场 → 整车 → 云台 → 底盘 → 发射机构 → 电机过渡”的顺序帮助新人建立机械与电控认知的整体框架，并承接第二章差速教学小车的仿真与代码逻辑。

---

## 2. 核心成果与已完成事项 (What's Been Done)

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
   - `npm test`：12 个测试文件、67 项测试全绿通过（包含四份 GLB 与两份补丁 SHA-256 冻结防护）。
   - Python 运动学与模型测试：4 项通过。
   - 自动化无头浏览器验收：`scripts/hero_tour_check.mjs` 在 1920×1080 与 1366×768 下生成 12 张完整截图及 `hero-tour-report.json`（归档保存为 `docs/hero-tour/browser-report.json`）。
   - 产出完整验收说明：`docs/hero-tour/验收报告.md`。

4. **版本控制与全量交付**：
   - 提交 `b71f584` 完成导览代码并推送至 `origin/feat/ch01-hero-tour`。
   - 提交 `a8747b6` 归档鱼鱼讲解思路、第二章使用报告与脚本手册初版。
   - 提交 `cb8193a` 统一模型口径与验收事实、扩充全套 25 个脚本手册并写入任务收尾规范。
   - 提交 `f6110b0` 合并进 `main` 分支并推送到远端 `origin/main`，GitHub Actions 流水线（Run `#38845036849`）全绿成功。

---

## 3. 当前交付状态（核验快照，非实时状态）

> **核验时间：2026-10-16 12:59:56 UTC**。以下全部为当时的实测结果，不得当作长期实时状态；接手前请重新执行对应命令核验。

### Git 与远端（`git rev-parse main origin/main`、`git ls-remote --heads origin`）
- 本地 `main` = 远端 `origin/main` = `a41ee8b65d010ee19e70035c0a7887e1613c812b`（一致）。
- 远端仅存 `refs/heads/main`，所有 `feat/*` 阶段分支均不存在。
- 工作区：`git status --short --branch` → `## main`，无未跟踪或未提交改动。

### 文档审查修复的落地情况（已结束，勿重放）
- 基线 `f6110b0` → 修复提交 `a41ee8b`（11 文件，+64/−44），先提交在独立分支 `docs/review-fix-main-merge` 上（当时状态为「已提交、未合并、未推送」，**属历史**），随后以 `git merge --ff-only` 快进合入 `main` 并推送到 `origin/main`。
- 该修复分支为已并入的遗留本地引用，已于本次核验后清理；如确需取回，可执行 `git branch docs/review-fix-main-merge a41ee8b`。

### 远端 CI（核验时间同上）
- 当前：`main` @ `a41ee8b` → Run [#38899449275](https://github.com/3Fish3/-1014/actions/runs/38899449275) `completed` / `success`（13 步全过，12:17:08Z → 12:28:29Z）。
- 历史（**不代表当前提交**）：`main` @ `f6110b0` → Run [#38845036849](https://github.com/3Fish3/-1014/actions/runs/38845036849) `success`；`feat/ch01-hero-tour` @ `b71f584` → Run `#38794849779` `success`。

### 本地服务（核验时间同上）
- **在运行**：`127.0.0.1:8080`，PID **388093**（`python3 -m http.server 8080 --bind 127.0.0.1 --directory /home/kekeyuyu/projects/hushi_ec_teach/web`），为当前教学入口。
- **已不存在**：`127.0.0.1:8091` 与 PID 1291477 在本次核验时已消失。该端口属第一章开发期临时目录的辅助服务，从未登记为教学入口；若后续重新需要，用 `bash scripts/run_server.sh 8080` 即可，无需恢复临时目录。

---

## 4. 历史阶段演进快照记录 (Historical Snapshots)

为防止不同阶段的中间状态产生混淆，各提交快照的真实情况归档如下：
- **快照 1（提交 `b71f584`，2026-10-15）**：第一章导览核心代码与 12 场景无头验收完成，当时工作区包含 3 份未跟踪文档（`鱼鱼的讲解思路.md`、`使用报告.md`、`脚本使用说明.md`）。
- **快照 2（提交 `a8747b6`，2026-10-15）**：将上述 3 份文档正式提交归档至 `feat/ch01-hero-tour`，工作区恢复纯净。
- **快照 3（提交 `cb8193a`，2026-10-16）**：Advisor 审查后统一全站模型口径、扩充全套 25 个脚本手册、修正 V1 历史说明并写入任务收尾规范，成功推送至 `origin/feat/ch01-hero-tour`。
- **快照 4（提交 `f6110b0`，2026-10-16）**：主分支合并。本地 `main` 合并 `cb8193a` 并与远端初始占位提交 `f875422` 执行无损合并，成功推送到 `origin/main`。
- **快照 5（2026-10-16 分支治理）**：经鱼鱼确认各阶段测试均已通过，六个 `feat/*` 阶段分支（`v1-validation`、`ui-v2-p0`、`ui-v2-p1`、`model-assembly-editor`、`hero-assembly-finalize`、`ch01-hero-tour`）在 `git branch --merged main` 全量命中、确认均为 `main` 祖先后被删除；远端 `git ls-remote --heads origin` 实测仅剩 `refs/heads/main`。
- **快照 6（2026-10-16 文档审查修复落地）**：基线 `f6110b0`。修复提交 `a41ee8b`（11 文件，+64/−44）先在独立分支 `docs/review-fix-main-merge` 上完成，当时处于「已提交、未合并、未推送」状态；随后以 `git merge --ff-only` 快进合入 `main` 并推送到 `origin/main`，`main` 上 CI Run [#38899449275](https://github.com/3Fish3/-1014/actions/runs/38899449275) 全绿通过。该修复分支为已并入的冗余引用，已清理。

> **历史分支名说明**：上述快照中的 `feat/*` 分支名记录的是当时的开发分支状态，在快照 5 之后均已不存在，仅作历史阶段标记，不可再作为检出目标。

---

## 5. 后续任务与剩余工作 (What's Left)

1. **讲师实地试讲验收**：在目标教室或会议室的实际投影设备上运行 `bash scripts/run_server.sh 8080`，核对字体可读性、高对比度与模型旋转流畅度。
2. **实车硬件信息核实**：针对 CAD 中标注为“待确认”的部件（Pitch 轴动力源、拨弹电机、实车电调/主控板型号），待开箱实测后补齐文档中的实测确认。

*(注：原待办中“提交主工作区文档”已在提交 a8747b6/cb8193a 完成；原“主分支合并决策”已在提交 f6110b0 完成，均已正式核销。)*

---

## 6. 关键设计约束与防踩坑项 (Key Decisions & Gotchas)

- **GLB 严格冻结**：`web/models/hero_robot_step_aligned.glb` 的 SHA-256 必须固定为 `cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af`，不可修改几何和装配。
- **单 WebGL 实例**：系统严格复用单一 `SceneViewer` 渲染器，不允许多实例导致 GPU 崩溃。
- **打开方式**：必须通过本地 HTTP 服务访问（如 `bash scripts/run_server.sh 8080`），严禁使用 `file://` 双击打开 HTML。
