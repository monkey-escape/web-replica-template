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



id: trap-0001
status: active
surfaces: [media, next-image, parity]
symptom: 布局和图片位置都对，但图片区域有几十到几千个像素差；源文件尺寸也一致。
cause: 用 Node 默认 Accept 抓 next/image 得到 JPEG/PNG，浏览器参考图实际拿到 WebP/AVIF；扩展名和本地 media content-type 也不匹配。
avoid: 用浏览器 Accept 下载优化图，按实际 content-type 保存为 .webp/.avif，并把 srcset/src 一起改成对应本地键；不要只保留原图尺寸。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-next-image-format-and-settled-captures.md

id: trap-0002
status: active
surfaces: [screenshot, animation, parity]
symptom: 本地页面看起来一样，但参考图比较出现按钮变灰、文字整体偏移 1–5px、或 reveal 区块零星像素差；本地秒开时更明显。
cause: 参考图在按钮颜色过渡或 IntersectionObserver reveal 结束前拍摄；本地加载比目标快，截图落在不同动画相位。
avoid: 拉高视口后 await 图片 complete+decode，再等至少 1s；对 reveal 类固定终态；首屏背景色移除 transition，或重拍参考图前先修正抓图辅助。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-next-image-format-and-settled-captures.md

id: trap-0003
status: active
surfaces: [header, animation, mobile, parity]
symptom: 同一套共享顶栏，不同路由或视口的参考图显示了轮播中的不同文案，导致大面积像素差。
cause: 顶栏用 CSS keyframes 轮播两条促销或物流文案；逐页截图时落在不同相位。
avoid: 让共享组件的静态参考态确定下来（按路由固定显示哪一条），或者在抓图辅助里显式暂停或固定动画相位；不要靠加载时间碰运气。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-next-image-format-and-settled-captures.md

id: trap-0004
status: active
surfaces: [screenshot, overlay, parity]
symptom: 整页参考图被半透明或全屏遮罩盖住，结构和视觉比较从一开始就对不上。
cause: 目标站有年龄确认或其他拦截层，拍摄前没有先关掉。
avoid: 分析阶段和拍参考图前先关闭拦截层；不要在遮罩还在时保存基线。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-age-gate-scrollbar-and-offscreen-controls.md

id: trap-0005
status: active
surfaces: [screenshot, viewport, parity]
symptom: 还没比内容就报 size-mismatch，实际图或参考图宽度比档案视口多出十几像素。
cause: Playwright 全页截图把滚动条算进了宽度。
avoid: 拍摄前隐藏滚动条，锁死档案中的桌面和手机宽度，并把视口高度拉到整页再拍。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-age-gate-scrollbar-and-offscreen-controls.md

id: trap-0006
status: active
surfaces: [interactive, overlay, parity]
symptom: 结构里能看到控件，但 Playwright 点击失败，提示 element is outside of the viewport。
cause: 为了避开遮罩或视觉干扰，把可点控件移到了视口外（例如 left: -10000px）。
avoid: 交互检查不要依赖视口外节点；需要点击的控件必须留在可点范围内。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-age-gate-scrollbar-and-offscreen-controls.md

id: trap-0007
status: active
surfaces: [visual, oracle, parity]
symptom: 视觉比较全部通过，报告却被理解成已经逐像素 1:1，或文件哈希明明不同却以为图是同一张。
cause: pixelThreshold 默认 0.1 是感知灵敏度，mismatches 为 0 不等于精确像素一致，也不等于文件哈希相同。
avoid: 同时记录阈值 0 的精确残差；不要靠把阈值收到 0 或 0.03 来当质量门禁。ready_for_review 仍可成立，但 brief 要带 exact_residual，且不要写成「像素差为 0」。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-perceptual-pass-is-not-exact-parity.md

id: trap-0008
status: active
surfaces: [structure, responsive, parity]
symptom: 同一组件在桌面和手机结构测量对不齐，或两个视口互相污染。
cause: 目标站为两个视口准备了两套 DOM，却把同一个 data-component 同时挂在两套节点上。
avoid: 用视口专用属性，在加载时只给当前可见节点挂组件标记。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-next-image-format-and-settled-captures.md

id: trap-0009
status: active
surfaces: [measure, sections, parity]
symptom: 克隆页大量 missing styles，或超长 section 被跳过，尽管页面上对应块是存在的。
cause: sections.json 的 targetSelector 被优先用在克隆 DOM 上；超长 section 被高度过滤器误拒。
avoid: 目标选择器和克隆选择器必须分开；不要用目标站选择器直接查询克隆页。
first_seen: 2026-11-22
source_lesson: docs/experience/lessons/2026-11-22-next-image-format-and-settled-captures.md
