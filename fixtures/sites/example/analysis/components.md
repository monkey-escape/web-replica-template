# 组件

先分清共用块和页面专用块。共用组件要实现成可复用单元，再拿它们去拼各条路由。不要先写完整页面再复制页头页脚。

## Shared

这些块出现在不止一条路由上，实现时先做它们：

| data-component | 出现的路由 | 职责 |
| --- | --- | --- |
| `site-header` | `/`、`/about/` | 站点名和主导航 |
| `site-footer` | `/`、`/about/` | 页脚 |

## Page-specific

这些块只属于一条路由，等共用组件就绪后再写：

| data-component | 出现的路由 | 职责 |
| --- | --- | --- |
| `hero` | `/` | 标题、说明和 API 按钮 |
| `api-status` | `/` | 显示 `/api/health` 的结果 |
| `template-notice` | `/about/` | adapt 路由上被显式接受的差异 |

样式只使用 `analysis/tokens.json` 里的颜色、字体和 12px 圆角。
