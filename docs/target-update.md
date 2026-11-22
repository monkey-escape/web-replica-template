# 目标站更新：先对比，再接受，再测差值

这是按需执行的流程，不是定时监控，也不是把模板仓库当 `upstream` 做 `git fetch`。模板代码更新见 README；目标站改版（新功能、新页面、布局或公开 API 变化）走这里。

修复循环里仍然禁止重拍参考图。把目标站的新快照写进 fixtures / baselines，只允许发生在本节的 `--accept` 分析步骤。

## 怎么跑

```bash
node scripts/compare-target.mjs --site <site-id>
node scripts/compare-target.mjs --site <site-id> --target https://www.example.com --route home
```

脚本会把公开目标站重新抓到 `temp/clone-loop/<site-id>/target-update/staging/`，不覆盖当前 `fixtures/sites/<site-id>/`。然后对比 staging 与现有 fixtures，写出：

- `temp/clone-loop/<site-id>/target-update/report.json`
- `temp/clone-loop/<site-id>/target-update/report.md`

报告带 `status`、`next`、`residuals`，并列出新增 / 删除 / 变更的路由，以及区块与样式、共用组件影响、API mock、资源清单和参考图像素 / 哈希差异。

只读公开页。年龄门可以关掉。不要登录，不要把浏览器导航到 `/requisition` 或其它特权路径，不要向目标站提交表单。复用现有的区块、样式、结构、公开 API、资源和整页截图辅助函数，而不是另做一套抓取。

如果 staging 已经抓过，只想再出报告：

```bash
node scripts/compare-target.mjs --site <site-id> --from-staging
```

## 接受变更

看过报告之后，再显式接受：

```bash
node scripts/compare-target.mjs --site <site-id> --accept
```

这是允许刷新分析档案的步骤：只把 staging 里新增和变更的文件拷进 `fixtures/sites/<site-id>/`（`baselines/`、`styles/`、`api/`、`assets/`、`structure.json`、`sections.json`）。不会自动跑 `--accept`。`clone-loop` 拒绝 `--accept` 和 `--capture-reference`。

被目标站删掉的路由会出现在报告里，但接受时不会删除克隆源码，也不会从 fixtures 里清掉对应条目。要不要删页面，是之后的实现决定。

## 接受之后

1. 先分析差值：新的共用组件、新页面、变更的重复块，写进 `analysis/components.md`。没有共用块时仍要明确记录。
2. 实现顺序不变：先做共用组件，再拼新页面或改动过的页面。在分析完成前不要改 `apps/web`。
3. 然后跑 `node scripts/clone-loop.mjs --site <site-id>`，只修报告里变更或失败的路由。

不要把这次对比当成修复循环里的参考图覆盖。
