# example

这是模板自带的占位站点，不是任何一个真实网站的抓取结果。

它存在的目的，是让分析门禁、strict / adapt 档案和 parity 脚本有一份可以跑通的输入。新克隆开始时，复制这一份到 `fixtures/sites/<site-id>/`，然后把内容换成你对目标站的分析。不要把别的产品的文案、账号或环境文件带进来。

`baselines/*.png` 是视口 1280×720、deviceScaleFactor 1 的整页参考图，只在分析阶段用 `tests/parity/visual.mjs --capture-reference` 写入。修复循环不许靠重拍参考图来让 strict 路由变绿。
