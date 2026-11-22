# example 的陷阱核对

核对日期：2026-11-22。

读过 `docs/experience/traps.md` 和 `docs/experience/lessons/`。当前陷阱库有 active 条目，example 是模板骨架，不涉及目标站媒体、动画或拦截层：

- `trap-0001` next/image 格式协商：example 只用本地 `mark.svg`，没有 next/image，不适用。
- `trap-0002` 截图落在 CSS 过渡中间：example 的参考图仍按稳定的 `screenshots/README.md` 流程生成，不在本占位页使用外部动画。
- `trap-0003` 共享顶栏轮播相位：example 没有轮播顶栏，不适用。
- `trap-0004` 年龄层或其他拦截遮罩：example 没有拦截层，不适用。
- `trap-0005` 全页截图把滚动条算进宽度：占位参考图按档案视口生成，不适用。
- `trap-0006` 视口外控件无法点击：example 没有移到视口外的交互控件，不适用。
- `trap-0007` 感知通过不等于精确像素 1:1：循环仍记录精确残差；不要把感知通过写成像素差为 0。
- `trap-0008` 双 DOM / 视口专用组件标记：example 没有桌面和手机两套 DOM，不适用。
- `trap-0009` 把 targetSelector 用在克隆 DOM 上：example 的区块选择器只服务本页骨架，不适用。

真正开始克隆一个站点时，把每一个 active 陷阱的 id 写进新的 `traps-checked.md`，并写明它在这个站点上会不会碰到。
