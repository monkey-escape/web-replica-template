# 截图记录

分析阶段把目标站的整页截图放在这个目录，文件名与路由名一致。

example 是模板自己的骨架，不是外部网站，所以这里不放从别处复制来的图片。parity 使用的参考图在 `../baselines/`。第一次在本机生成它们：

```bash
pnpm dev:web
node tests/parity/visual.mjs --site example --capture-reference --allow-strict-capture
```

然后去掉 capture 参数再跑一遍，确认比较本身能通过。修复循环里不要再加 `--capture-reference`。
