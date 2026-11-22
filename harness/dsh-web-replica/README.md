# dsh-web-replica

DeepSeek Harness 组合包。安装后，profile 的 preset 名单里多一项 **1:1 website replica**（id `web-replica`）。只有这一项 preset，不要再拆成一堆模式。

布局跟官方发布说明一致（Harness `0.2.3-alpha.1` / `d98f5d6`）：`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，插件入口是 `index.js`。preset 行使用已安装的 `@deepseek-ai/dsh-agent-preset`，不在这个仓库里复制或 fork Harness。

方法只有一套，源在本仓库的 `AGENTS.md`、`docs/playbook.md` 和 `docs/oracle.md`。preset 的 persona 只写硬约束和阶段顺序，skills 给出对应命令，都不另写一套 playbook。bash / fs / web 仍然保留，用来调用本仓库脚本；同时在该 preset 下挂官方工具 API（`ctx.tools.register(defineTool(...))`，模块 `dsh-web-replica/tools`）把同一批脚本包成 first-class 工具：

- `replica_check_gates` → `scripts/check-gates.mjs`
- `replica_capture_sections` → `scripts/capture-sections.mjs`
- `replica_capture_api` → `scripts/capture-api.mjs`
- `replica_compare_target` → `scripts/compare-target.mjs`（`accept` 只在明确选择时调用，不会从 clone-loop 触发）
- `replica_clone_loop` → `scripts/clone-loop.mjs`（拒绝 `--capture-reference` / `--update-baseline` / `--accept`）

这些工具的 peer 是运行中的 Harness 提供的 `@deepseek-ai/dsh-tools@>=0.2.3-alpha.1 <0.3.0`，不要把该包装进本模板的 lockfile。工具和脚本的安全规则相同：只读公开页，不登录，不写 `/requisition`，不在修复循环里重拍参考图。

阶段顺序：分析（含共用组件、API mock、媒体和样式抓取）→ 先实现共用组件 → 再拼页面 → `clone-loop` 按组件级渐进门禁只修 `report.next`（模型先读 `brief`）→ 教训 / 复盘。目标站改版走 `compare-target`，再 `--accept`，再测差值。

安装和选用见仓库根 `README.md`。不要安装 Cursor 市场里的无关 Harness CI 插件（8006）。
