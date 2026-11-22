# example 分析

这是模板自己的骨架页，用来演示流程。页面文案是英文占位，不是从别的网站抄来的。

## Screenshots

分析阶段先看整页截图，再写结构。参考图放在 `fixtures/sites/example/baselines/`，文件名跟路由名一致：`home.png`、`about.png`。原始记录放在 `analysis/screenshots/`。占位站没有外部截图，参考图由本地骨架生成。

## Structure

- `/` 是 strict。地标、标题、组件和交互必须与 `structure.json` 的 `home` 完全一致，像素差比例必须是 0。
- `/about/` 是 adapt。结构参考里故意不包含 `template-notice`，档案用一条 accepted diff 把它记成允许的额外组件。像素差比例上限是 0.02。

## Components

`site-header`、`hero`、`api-status`、`site-footer` 是首页组件。关于页另外有一个只在 adapt 路由出现的 `template-notice`。

## Interactions

首页按钮 `ping-api` 点击后请求 `/api/health`，状态文本变为 `API ok`。关于页的 `back-home` 只是回到首页的链接，不发请求。

## Tokens

颜色、字体、间距和圆角写在 `analysis/tokens.json`，并在 `apps/web/src/style.css` 的变量里用同一组值。换一个真实站点时，先从这里改，不要在组件里散落魔法数。
