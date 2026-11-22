# example

这是模板自带的占位站点，不是任何一个真实网站的抓取结果。

它存在的目的，是让分析门禁、strict / adapt 档案和 parity 脚本有一份可以跑通的输入。新克隆开始时，复制这一份到 `fixtures/sites/<site-id>/`，然后把内容换成你对目标站的分析。不要把别的产品的文案、账号或环境文件带进来。

`baselines/<route>.desktop.png` 和 `baselines/<route>.mobile.png` 是桌面宽度 1440、手机宽度 390、deviceScaleFactor 1 的整页参考图，只在分析阶段用 `tests/parity/visual.mjs --capture-reference` 写入。修复循环不许靠重拍参考图来让 strict 路由变绿。页面里的标志走 `/media/example/mark.svg`，由本地媒体服务提供。
