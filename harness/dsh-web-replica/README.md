# dsh-web-replica

DeepSeek Harness 组合包。安装后，profile 的 preset 名单里多一项 **1:1 website replica**（id `web-replica`）。

布局跟官方发布说明一致：`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，插件入口是 `index.js`。preset 行使用已安装的 `@deepseek-ai/dsh-agent-preset`，不在这个仓库里复制 Harness。

子插件的工具名单比官方 `standard` preset 短。读文件、跑命令、读仓库 `AGENTS.md`、以及加载 `skills/` 这几项按 `packages/bundle/web-app/presets/standard.patch.yml`（Harness `0.2.3-alpha.1`）的写法挂上。方法本身仍以本仓库的 `docs/playbook.md` 为准。

`skills/` 里四个 skill 只提醒分析、经验库、parity 循环和当日复盘，并指向仓库里的文档与脚本。

安装和选用见仓库根 `README.md`。
