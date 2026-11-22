# 实现仓库向模板回推可复用经验

实现仓库跑循环并写教训；公开模板本身不跑这次克隆。吸取经验的正确路径是：在实现仓库写好 `docs/experience/lessons/`（必要时追加陷阱），编辑成可复用、不含业务数据的条目，再用 `node scripts/promote-experience.mjs` 预览，`--pr` 对着 git `upstream`（`web-replica-template`）开分支并提交 PR。

命令只复制经验库里的新 lesson 和模板还没有的 trap。站点 fixtures、参考图、`apps/`、接口数据不会进入 PR。站点 id 和目标域名在副本里改写成通用写法；含密钥的文件被拒绝。

时机：`clone-loop` 为 `ready_for_review`，或 `failed_with_residuals` 之后已经写好可复用教训。默认不自动开 PR。这一版不回推 oracle / 循环代码，那种改动仍需单独、明确的路径。

`--pr` 只推到名为 `upstream`、且指向公开模板的远程。如果实现仓库的 `origin` 仍指向 `web-replica-template`，命令会拒绝开 PR，避免把私有站点推到公开仓库。站点 id 出现在 lesson 文件名里时，副本会改写成 `trial-site`。
