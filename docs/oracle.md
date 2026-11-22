# Oracle 循环

决策背景见 `.agents/notes/proposed/2026-11-22-oracle-loop-and-maintainability.md`。这里只写怎么跑。

脚本是眼睛和手，模型不能自行宣布完成。像素分是必要的，但不是充分的：源码不可维护，就算截图接近，也算失败。

```bash
pnpm dev:api
pnpm dev:web
node scripts/clone-loop.mjs --site <site-id>
```

报告在 `temp/clone-loop/<site-id>/report.json`。看这三个字段：

- `status`：`ready_for_review`、`failed`、`adapt_failed`、`failed_with_residuals` 或 `incomplete`
- `next`：下一刀只修这一项（通常是最差的一个区块，或一条可维护性失败）
- `residuals`：还没过的证据清单
- `stage` / `brief`：当前停在哪一阶段，以及给模型看的短摘要
- `stuck`：同一条 `next` 是否已熔断
- `exactPixel`：色差阈值为 0 时的精确像素残差，只作证据，不单独挡住 `ready_for_review`

默认 `pixelThreshold` 仍是 `0.1`，用来忽略抗锯齿一类的细微色差。不要为了“更严”把它改成 `0`：那会把满页散点都当成失败，循环会去修不可维护的噪声。若感知比对已通过、但精确像素差异达到 1% 及以上，`brief` 会写出 `exact_residual`，供人审查时判断是不是真的 1:1。

退出码：0 才能进入人工审查；2 表示 strict 或可维护性未过；3 表示只剩 adapt；4 是带着残差收工。收工用：

```bash
node scripts/clone-loop.mjs --site <site-id> --conclude
```

不要在修复循环里重拍参考图，也不要把模型的口头判断写进完成说明。目标站改版后，用 `scripts/compare-target.mjs` 先对比再 `--accept` 刷新档案，见 `docs/target-update.md`。

## 组件级渐进门禁（给 AI 用）

循环按阶段往前走，前一阶段没过就不会把后一阶段当成 `next`，也不会跑更贵的视觉比对：

1. 分析门禁（含本地 Hono `/api/mock` 健康检查，不是 Cloudflare Workers 路由）
2. 可维护性
3. 共用组件骨架（`analysis/components.md` 里的 shared components 必须存在）
4. 页面拼装（地标、顺序、页面专用块）
5. 盒模型与计算样式
6. 视觉残差（像素图只作后证；strict 的视觉残差仍挡住 `ready_for_review`）
7. 交互回放

模型只读 `brief` 和 `next`，残差全文在 `report.json`。只修 `next`。同一条 `next`（同一阶段、路由、视口、选择器、原因）连续失败 4 次会把 `stuck` 设为 true，此时应停止并跑 `node scripts/recap-daily.mjs`，不要反复修同一项。先前已修复又复发的残差会标 `regression`，记在 `temp/clone-loop/<site-id>/memory.json`，并进 residuals，不另建 fixtures 里的缺陷文件。


## 如何抓取目标站计算样式

分析阶段要从线上目标站（不是正在跑的克隆）记录区块几何框和计算样式。只打开公开页，用 GET。年龄门可以关掉。不要登录，不要打开 `/api/` 或 `/requisition`，不要向目标站提交表单或写入数据。

来源优先用档案里的可选字段 `targetBaseUrl`，也可以在命令行传 `--target`：

```bash
node scripts/capture-sections.mjs --site <site-id> --from-target
node scripts/capture-sections.mjs --site <site-id> --from-target --target https://www.example.com --route home
```

文件落点：

- 目标站计算样式和几何框：`fixtures/sites/<site-id>/styles/<route>.<viewport>.json`（`source` 为 `"target"`）
- 目标站 `targetSelector` / `boxes` 会合并进 `fixtures/sites/<site-id>/sections.json`，不会覆盖克隆侧的 `selector`
- 抓取摘要：`temp/clone-loop/<site-id>/target-capture.json`

之后 `clone-loop` 会把克隆上的计算样式跟这些目标 fixtures 对比，并在报告的 `next` / `residuals` 里指出出错的区块（例如 `home@desktop #hero` 的 `style-mismatch`）。

`--from-clone` 只读 `profile.baseUrl` 上的克隆，结果写到 `temp/clone-loop/<site-id>/clone-styles/`，不会覆盖 `fixtures/.../styles/`。

## 视口专属提示

桌面和手机布局经常不是同一套 DOM。不要靠一次标题匹配去绑两个视口。在 `fixtures/sites/<site-id>/sections.json` 里为每个区块声明提示：

- `viewports`：只在这些视口里尝试；没写就两个都试
- `absentViewports`：明确说某个视口没有这块（例如只在手机出现的区块）
- `targetSelectors`：`{ "desktop": "header.hero", "mobile": "section.mhero" }`。某个视口写成 `null` 也表示该视口没有这块
- `targetHeadings` / `targetTexts`：按视口给出标题或可见文案
- 单层的 `targetSelector` / `heading` / `targetText` 仍是所有视口的后备

视口专属 `targetSelectors` 会先于地标、标题搜索和以前抓取留下的通用选择器。这样不会把只在手机出现的区块硬绑到桌面，也不会让标题搜索误打到别的大容器。

同一条也可以拆成 `home.desktop` / `home.mobile` 两份列表；共享列表加上面这些字段即可，不必复制整页。

## 子元素样式探针

区块容器的计算样式经常只是 `16px` 正文，标题字号、字重在子节点上。可选字段 `styleProbes` 会相对**区块根节点**再抓一层：

```json
{
  "id": "hero",
  "selector": "[data-component='hero']",
  "targetSelectors": { "desktop": "header.hero", "mobile": "section.mhero" },
  "styleProbes": [
    { "id": "heading", "selector": "h1" },
    { "id": "kicker", "selector": ".kicker", "viewports": ["desktop"] }
  ]
}
```

也可以写成 `{ "desktop": [...], "mobile": [...] }`。探针选择器是相对该区块根节点的 `querySelector`，不要写页面级绝对路径。结果写在 `fixtures/sites/<site-id>/styles/<route>.<viewport>.json` 对应区块的 `probes` 里。`clone-loop` 会把这些子样式和容器样式一起对比；失败时 `next` / `residuals` 仍指向该区块（例如 `home@desktop #hero`），证据条文会带上探针名和属性（例如 `hero heading font-size`）。

## `--route` 会合并摘要

`--route home` 只会重抓指定路由，但会把新的 `route@viewport` 行合并进已有的 `temp/clone-loop/<site-id>/target-capture.json`，不会丢掉其他路由的上次结果。不带 `--route` 的完整抓取仍会重写整份摘要。
