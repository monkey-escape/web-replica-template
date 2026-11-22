# 陷阱库

新站点动手之前先读完这一页，以及 `docs/experience/lessons/` 里的每一篇。把核对结果写进 `fixtures/sites/<site-id>/traps-checked.md`。克隆循环会检查这份记录。

这里开始是空的。不要从别的产品或私有仓库迁入陷阱。只有这个仓库里真实发生过、并且写进了教训笔记的问题才加进来。

## 怎么用

1. 收集所有 `status: active` 的条目。`retired` 的留着，但不要当成当前检查项。
2. 看 `surfaces` 是否和这个站点的布局、动效、字体、表单、多语言、吸顶、轮播或登录墙重叠。
3. 在 `traps-checked.md` 里写每个 id，以及这个站点打算怎么避开。
4. 一个都没有时，写上 `active-traps: none`。不要删除这一页的说明。

## 条目格式

id 递增，四位数字。下一次可用的 id 由循环在 `--write-lesson` 时根据本文件现有 id 算出。

```yaml
id: trap-NNNN
status: active
surfaces: []
symptom:
cause:
avoid:
first_seen: YYYY-MM-DD
source_lesson: docs/experience/lessons/YYYY-MM-DD-<slug>.md
```

真实条目只追加在文末的 Active traps 下面。上面的格式示例不会被门禁当成一条 active 陷阱。

`status` 只使用 `active` 或 `retired`。过时的条目改成 `retired`，不要删掉。

## Active traps

当前没有。
