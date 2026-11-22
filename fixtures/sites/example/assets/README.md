# example 静态资源

运行时只通过 `/media/example/<key>` 读取本目录。对象键是相对路径，例如 `mark.svg` 对应 `/media/example/mark.svg`。

example 不是外部网站，所以这里只有模板自己的占位图，没有从别的站点下载的文件。真实克隆要在分析阶段把目标站的公开图片、字体和视频按 `manifest.json` 拉进来，并改页面里的地址。不要在运行时热链到目标站。

下载命令：

```bash
node scripts/capture-assets.mjs --site example
```
