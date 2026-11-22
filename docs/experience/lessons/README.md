# 教训

每一次克隆在 strict 路由达到 1:1、循环退出 0 之后，留一篇笔记。没有失败也要留，并写明没有新陷阱。不要为了让目录看起来丰富而编故事。

## 生成草稿

```bash
node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>
```

文件名是 `YYYY-MM-DD-<slug>.md`。slug 只用小写字母、数字和单个连字符。已存在的文件不会被覆盖。

## 写的时候

- `发生了什么` 只写这一轮测量报告里出现过的失败，或写没有新的失败。
- 有可以复用的失败时，把笔记里的 yaml 原样追加到 `docs/experience/traps.md` 的 `## Active traps` 下面，保持 `status: active`。
- 没有新陷阱时删掉空 yaml，避免门禁把空 id 当成 active。
- `source_lesson` 指回这篇笔记。
- 可以删的临时代码：把文件第一行改成包含 `@replica-rotten`，或把文件名改成含 `.obsolete.`。不要在这里粘贴密钥或目标站的私有响应。

## 现在还没有笔记

陷阱库因此也是空的。第一篇笔记应该来自下一个真实克隆，而不是来自 example 占位站。

写好并改成可复用、不含业务数据的条目之后，用实现仓库里的命令提回公开模板，不要把站点 fixtures 或参考图一并推上去：

```bash
node scripts/promote-experience.mjs
node scripts/promote-experience.mjs --pr
```
