# 产品说明：Harness 插件 + 确定性 oracle 循环（人类可维护）

日期：2026-11-22  
状态：implemented（2026-11-22：oracle 循环、可维护性门禁、组件级渐进门禁与经验回推已写入模板）  
范围：公开模板 `web-replica-template`。这是产品本身，不是某一站的一次性导出。

## 1. 性质

这是一个 **DeepSeek Harness 插件** 加上一套 **确定性的 oracle 循环**。

- 模型（agent）的职责是写代码：在本模板的 `apps/web` 与 `apps/api` 里实现可维护的复刻。
- 脚本的职责是眼睛和手：采集、测量、打分、归咎、门禁、写报告。模型不能与脚本争论，也不能自行宣布完成。
- 像素分数是必要的，但不是充分的。一张 99% 相似的截图，如果源码是不可维护的一锅汤，这一轮就是失败。

它不是「截一张图、倒出一整页 HTML/CSS」的 one-shot 生成器。

## 2. 目的

给定一个目标 URL，在本模板里驱动一个可维护的 Vite+ / Hono 复刻，直到：

- 所有 strict 路由在规定视口上达到 1:1，并且通过可维护性门禁，状态为 `ready_for_review`；或
- 运行以 `failed_with_residuals` 结束，并留下可核对的残差清单和证据。

不允许第三种口头完成：「看起来差不多了」「模型说已经对齐」。没有脚本给出的状态，就不算结束。

## 3. 技术栈（不变）

- 前端：Vite+，页面在 `apps/web`。
- API：Hono。开发时 Node 入口提供本地能力；Cloudflare 只保留根目录 `wrangler.jsonc` 里已经声明的那一个 Worker。
- 包管理：只用 pnpm。
- 静态资源：开发和生产使用同一公开地址 `/media/<site-id>/<key>`。开发从 `fixtures/sites/<site-id>/assets/` 读文件，生产再把同一前缀换到 R2。仓库里不放 Cloudflare 账号 id 或密钥。
- 不要把模板改成 UnoCSS，也不要改成 React 输出栈。等 1:1 完成后再评估样式方案。

## 4. 人类可维护（硬要求）

产物必须让人能继续改，而不是只能再让模型生成一次。下面几条要写进循环，并由脚本强制执行：

1. **分段、可读的源码**。按区块（section）拆 HTML 与样式，禁止把整站或整页倒进一个巨大的生成文件。
2. **共享 token 与布局**。颜色、字体、间距、圆角来自 `fixtures/sites/<site-id>/analysis/tokens.json` 和共享样式，不要在各页复制一堆看不懂的魔术数值。
3. **运行时地址走 `/media`**。图片、字体、视频必须是 `/media/<site-id>/<key>`。禁止在运行时热链到目标站或其他远程字体/图床。
4. **代码语言**。标识符和模板自己的句子用英文；可见文案跟随目标站；注释只用中文写非显然的「为什么」；项目里的 Markdown 用中文。
5. **文档分层**。`AGENTS.md` 保持短。长篇决策写在 `.agents/notes/`。操作步骤写在 `docs/playbook.md`。
6. **像素不足够**。视觉分必须过，可维护性也必须过。两者同时成立，才能进入 `ready_for_review`。

建议的检测阈值（脚本可调，但默认按这个判失败）：

- 单个 HTML 或 CSS 文件超过 1200 行，或超过 80 KB，视为未拆分。
- CSS 平均行长超过 240 字，视为压缩/生成汤。
- `apps/web` 里出现指向 http(s) 的图片、字体、视频或 `@import` 样式（`/media`、`data:`、`mailto:`、`tel:`、`sms:` 除外），视为热链。
- 若该站点已有 `tokens.json` 里的颜色值，而 `apps/web` 的样式里一个都没用上，视为没有共享 token。

## 5. 从哪些项目借模式（不整库搬迁）

只借方法，不把别人的仓库搬进本模板。下列项目均以 MIT 说明；若以后要引用代码，需再核对当时的许可证，并保留原作者版权声明。本模板不复制它们的实现，尤其不采用 Perfect-Web-Clone 的 Vite+React 输出栈。

| 项目 | 要借的模式 |
| --- | --- |
| [ericshang98/Perfect-Web-Clone](https://github.com/ericshang98/Perfect-Web-Clone) | DeepSeek Harness 插件；确定性 oracle（他们叫 pwc）；完成态是 `ready_for_review` 或 `failed_with_residuals`，不是模型口头通过 |
| [Mahanaicoach/ai-site-cloner](https://github.com/Mahanaicoach/ai-site-cloner) | 采集计算样式；按区块做像素质量检查，而不是只看整页 |
| [HarKro753/claude-copy](https://github.com/HarKro753/claude-copy) | 先采集 DOM 与计算样式；修的是上游原因（结构、token、布局），不是去改截图 |
| [jongko54/webEmbedding](https://github.com/jongko54/webEmbedding) | 资源本地化后自检；运行时不再依赖目标站 |
| [Marvin0212/ui-agent-loop](https://github.com/Marvin0212/ui-agent-loop) | 把失败归到具体元素/区块，形成可执行的下一刀 |

## 6. 核心能力

### 6.1 采集（Capture）

用 Playwright 打开目标站的公开页面（可关闭年龄层等公开门闩；不登录，不抓需要鉴权的接口）。每个视口采集：

- 整页截图，写入 `fixtures/sites/<site-id>/baselines/<route>.<viewport>.png`（分析阶段才能写，修复循环禁止覆盖）。
- DOM 结构（地标、标题、`data-component`、交互）。
- 区块选择器和几何框，写入 `fixtures/sites/<site-id>/sections.json`。
- 关键计算样式，写入 `fixtures/sites/<site-id>/styles/`。
- 公开图片、字体、视频，按 manifest 落到 `assets/`，运行时改成 `/media/<site-id>/<key>`。

视口：**桌面宽度 1440 和手机宽度 390 是必须的**（ShopSite 实践）。平板（如 768）可选，不能取代前两个。截图时要避免滚动条把宽度撑破视口。

### 6.2 计划（Plan）

分析阶段就要把页面切成区块，并给每条路由标 `strict` 或 `adapt`（见 `docs/adapt.md`）。区块是循环的修复单位，也是人以后要改的单位。不要等整页红了再临时切一刀。

### 6.3 实现（Implement）

只在本模板里实现：`apps/web`、`apps/api`、`packages/shared`。不要另起一套生成目录，不要从别的产品仓库拷业务代码。实现按区块进行，共用 token 和布局。

### 6.4 Oracle（裁定）

脚本输出，模型不得改写判定：

- 区块像素分（必要时整页分作为兜底）。
- 结构差异：地标、标题、组件、交互的缺失/多余/顺序。
- 计算样式差异：针对已采集的属性子集（例如 display、字体、颜色、间距）。
- 元素/区块归咎：把像素差和结构差指到具体 `section` 或选择器。
- 可维护性检查：见第 4 节。未通过则整轮不能 `ready_for_review`。

### 6.5 循环（Loop）

每一轮：

1. 跑门禁、测量、视觉/区块打分、样式对比、可维护性。
2. 写出报告，并明确 **下一刀只修当前最差的一个失败区块**（strict 优先于 adapt；可维护性失败优先于「再磨像素」如果源码已经不可读）。
3. 已经通过的路由和区块不要顺手重做。
4. 禁止在修复循环里重拍参考图、放宽 `strictMaxDiffRatio`、把失败的 strict 改成 adapt、或给 strict 加 `accepted`。

停止条件只有两个：

- 全部 strict 对齐，且可维护性通过，状态 `ready_for_review`（退出码 0）；或
- 操作者用 `--conclude` 结束本轮，状态 `failed_with_residuals`（退出码 4），报告里必须有残差清单和证据路径。

其它退出码仍表示「还没到终态」：门禁或某相未跑完为 1；strict 未 1:1 为 2；只剩 adapt 失败为 3。模型不能把 2 或 3 说成完成。

### 6.6 交互回放（Replay）

菜单、表单、展开等交互按档案回放（点击、输入、断言页面文本）。克隆里只打到本地 mock / 本地 API。禁止向目标站写数据，也不要把真实表单提交到线上。

### 6.7 经验库与复盘

循环绿了之后写教训。只有真实失败才追加到 `docs/experience/traps.md`。当天用 `node scripts/recap-daily.mjs` 复盘。清理只通过 `--apply-clean`。

### 6.8 诚实的完成态

| 状态 | 含义 | 退出码 |
| --- | --- | --- |
| `incomplete` | 门禁未过，或某一相没有跑完 | 1 |
| `failed` | 仍有 strict 路由或区块未 1:1，或可维护性未过且尚未 conclude | 2 |
| `adapt_failed` | strict 与可维护性已过，只剩 adapt 差异 | 3 |
| `failed_with_residuals` | 明确收工，残差和证据已写入报告 | 4 |
| `ready_for_review` | 脚本裁定可提交人工查看；这仍不是「模型说完成」 | 0 |

`ready_for_review` 的前提：档案门禁通过、strict 结构与像素通过、可维护性通过、没有未允许的热链。它邀请人审查，不保证产品已经对外发布。

## 7. 给插件与脚本的约束

- Harness 的 skills 只引导模型去跑仓库里的脚本和文档，不在 skill 里另写一套方法，也不允许模型用自我描述代替报告。
- 循环报告写在 `temp/clone-loop/<site-id>/report.json`（以及分相文件）。`temp/` 不提交。
- 代码标识符用英文。本说明是产品决策，所以用中文。

## 8. 本轮落地范围

先把公开模板里的循环和插件改成按这份说明工作：区块打分、可执行归咎、可维护性门禁、残差报告、完成态、skills 禁止自我认证。用 `pnpm test` 和脚本 `--self-test` 守住行为。不必在同一轮把某个真实站点做到完美 1:1。
