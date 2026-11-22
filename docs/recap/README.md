# 每日复盘

一天结束时，用完整日志和当天提交写一篇短复盘，并只清理明确标记过的残留。

```bash
node scripts/recap-daily.mjs
node scripts/recap-daily.mjs --date 2026-11-22 --force
node scripts/recap-daily.mjs --apply-clean
```

日期是 UTC。默认写到 `docs/recap/YYYY-MM-DD.md`。文件已经存在时，不加 `--force` 就不会覆盖。

## 日志怎么算完整

脚本读取 `temp/clone-loop/` 下面的每个 JSON。

- `complete: true` 的报告进入「完整的 parity 日志」。克隆循环只有在测量和视觉比较都跑完时才把总报告标成完整；某一相自己的 JSON 也会带这个字段。
- 没有这个字段、值为 false、或 JSON 损坏的文件，只出现在「未纳入复盘的日志」。不要用它们判断站点已经对齐。

`temp/` 被 gitignore。复盘提交的是 `docs/recap/` 里的结论，不是某一轮的截图 diff。

## 清理范围

`--apply-clean` 只删除 `findRot` 报出来的文件：

- 第一行包含 `@replica-rotten`
- 文件名以 `.bak`、`.orig` 结尾，或包含 `.obsolete.`
- `temp/` 里的文件

它不会因为一个源文件「好像没人引用」就删掉它。复盘正文里先列出候选，确认后再加这个参数。

## 这篇目录本身

每天的复盘是后生成的，不随模板提交。跑 `pnpm test` 里的 recap 自检不会写这个目录。
