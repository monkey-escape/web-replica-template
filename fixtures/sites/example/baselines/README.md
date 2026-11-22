# 参考图

`home.desktop.png`、`home.mobile.png`、`about.desktop.png` 和 `about.mobile.png` 不随模板提交。它们跟操作系统字体有关，应在分析阶段按桌面宽度 1440 和手机宽度 390 在当前机器上生成，并只作为该克隆的目标参考保存。

生成命令写在 `analysis/screenshots/README.md`。没有这两张图时，visual 比较会以 `baseline-missing` 失败，strict 路由不能算通过。
