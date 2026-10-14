# 弈象独立开源准备

更新：2026-10-14。项目正在完成独立源码脱敏与发布验证；是否已经发布，以实际仓库和发布报告为准。

## 许可证决定

2026-10-14 项目所有者确认采用 [MIT License](../LICENSE)，版权署名为“弈象项目贡献者”，不填写真实姓名。依赖与资源仍按各自许可分发；研究参考不改变其许可证。

## 发布前的具体工作

- [x] 决定独立仓库名称、版权主体和许可证：`zwl522225/xiangqi-game`，公开，MIT，署名“弈象项目贡献者”。
- [ ] 以游戏目录为仓库根：包含源码、测试、公共资源、文档、`package.json` 与 `package-lock.json`。
- [ ] 核对 [资源与依赖记录](third-party-assets.md)，保留实际分发依赖的许可；引入第三方棋子或棋图时逐文件记录来源。
- [ ] README 更新实际已交付功能、规则边界、桌面和平板操作、进度仅存当前设备的说明及真实截图。
- [ ] 从干净检出执行 `npm ci`、`npm test`、`npm run typecheck`、`npm run build`，确认不依赖本机缓存或工作区外文件。
- [ ] 增加与这些命令一致的 GitHub Actions，并建立棋局/教学问题的报告入口。
- [ ] 排除 `node_modules`、构建输出、本机缓存和预览脚本；部署配置按实际公开演示地址整理。
- [ ] 在用户指定的 GitHub 仓库发布，独立决定演示网站的公开范围。

贡献流程已有 [CONTRIBUTING.md](../CONTRIBUTING.md)。GitHub 的[社区资料说明](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)可用于后续完善问题模板等仓库文件。

## 脱敏快照与发布方式

公开源码从已提交的游戏目录导出独立快照，排除工作区内其他项目、未跟踪文件、Git 元数据、部署配置、环境文件、本机缓存、预览脚本及构建产物。交付的源码 ZIP 不含旧提交历史；因此开发仓库中原有作者姓名和邮箱不随包分发。

导出前检查常见密钥、邮箱、个人设备路径和私有部署标识；检查命中时仅报告文件和类别，不输出命中内容。源码包提供相对路径、文件大小和 SHA-256 校验清单，安装与构建验证从 ZIP 解压副本执行。

在新的公开仓库提交时，只为该仓库配置公开署名与隐私邮箱，不更改电脑上的全局 Git 身份。旧历史不能通过修改新提交邮箱得到脱敏，应使用独立快照建立新历史。GitHub 的[提交邮箱说明](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)提供单仓库配置方式。

游戏本身将棋局、学习进度和笔记保存在当前浏览器；复制棋谱由用户点击后写入剪贴板。此源码检查不构成对浏览器、托管平台或所有依赖的完整安全审计。公开 GitHub 账号名、仓库名和选定的版权署名属于发布时主动公开的信息。
