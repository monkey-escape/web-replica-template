# 目标站区块与计算样式抓取

日期：2026-11-22。操作步骤以 `docs/oracle.md` 和 `docs/playbook.md` 为准。这里只记为什么要单独做这一步。

上一轮已经把 Oracle 循环、可维护性门禁和克隆侧样式对比接上了。缺的是：计算样式 fixtures 必须来自线上目标站，而不是克隆自己。否则 `clone-loop` 只能跟自己比，无法指出「这个区块相对目标差在哪一条 CSS」。

约定：

- `--from-target` 只打开公开页，只用 GET。年龄门可以关掉。不登录，不请求 `/api/` 或 `/requisition`，不向目标站提交或写入。
- 目标证据写入 `fixtures/sites/<site-id>/styles/`，并把 `targetSelector` / `boxes` 合并进 `sections.json`。克隆上的 `data-component` 选择器要保留，因为测量阶段读的是克隆 DOM，不是目标 DOM。
- `--from-clone` 只作为克隆侧对照，写到 `temp/clone-loop/`，不得覆盖目标 fixtures。
- 目标站通常没有 `data-component` 钩子，所以抓取要用地标、标题或 `sections.json` 里的 `heading` / `targetText` / `targetSelector` 去对齐区块。对不上的记入 `missing`，不要编造选择器。

这条路径落地后，再考虑用 DeepSeek Harness 跑复刻或指导人工循环。Headless `dsh` 若仍无法启动，不要假装已经跑过完整克隆。
