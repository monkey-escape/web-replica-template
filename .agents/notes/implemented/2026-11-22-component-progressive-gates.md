# 组件级渐进门禁

- date: 2026-11-22
- status: implemented
- site: template

## 决定

clone-loop 按组件级渐进门禁调度，报告主要给 AI 用。保留原有裁判字段（`status` / `next` / `residuals` / 可维护性 / `--conclude`），只改阶段顺序和输出压缩。

顺序：分析门禁（含本地 Hono `/api/mock` 健康检查）→ 可维护性 → 共用组件骨架 → 页面拼装 → 盒模型与计算样式 → 视觉残差 → 交互。结构没过不进样式，也不跑整页像素比对。像素图只作后证，但 strict 的视觉残差仍挡住 `ready_for_review`。

模型先读 `brief` 和 `next`，残差全文留在 `report.json`。同一条 `next` 连续失败 4 次将 `stuck` 设为 true，应停止并复盘，而不是按「某 phase 失败 4 次」一刀切。缺陷记忆记在 `temp/clone-loop/<site-id>/memory.json`，复发标 `regression`，并进 residuals，不在 fixtures 里另建 `.parity-memory.json`。健康检查不走 Cloudflare Workers 路由。

这场改动只落在公开模版 `web-replica-template`。正在跑的 peptide 试跑不要中途换脚本。

## 为什么不采用原三阶段施工单

STRUCTURE / LAYOUT_STYLE / INTERACTIVE 的方向对，但把 Cloudflare Workers 路由当第一阶段、另建 fixtures 缺陷库、以及把 pixelmatch 完全改成非阻断，和已定约束冲突。组件级切分能避免共用组件还没齐就甩出整页失败清单。
