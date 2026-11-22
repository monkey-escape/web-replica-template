# 组件

只记录骨架里真实存在的块。新站点应换成目标站的组件清单，不要沿用这些名字。

| data-component  | 出现在         | 职责                         |
| --------------- | -------------- | ---------------------------- |
| site-header     | `/`、`/about/` | 站点名和主导航               |
| hero            | `/`            | 标题、说明和 API 按钮        |
| api-status      | `/`            | 显示 `/api/health` 的结果    |
| template-notice | `/about/`      | adapt 路由上被显式接受的差异 |
| site-footer     | `/`、`/about/` | 页脚                         |

样式只使用 `analysis/tokens.json` 里的颜色、字体和 12px 圆角。
