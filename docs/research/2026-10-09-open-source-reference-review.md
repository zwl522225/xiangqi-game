# 弈象：开源项目参考与优化路线

调研日期：2026-10-09。针对当前 React / TypeScript 网页版弈象，优先考虑新手教学、平板操作和后续独立开源。

核查依据为项目官方 README、许可证及可访问的演示页面。以下功能属于项目自述；本轮没有逐个运行第三方项目验证棋力、性能或全部规则。许可证记录是选型依据，实际引入时需核对具体文件和版本。

## 1. 值得保留的六个参考

| 项目与来源 | 已核查的内容 | 对弈象的用途 | 复用范围与许可 |
| --- | --- | --- | --- |
| [j32ryc/xiangqi](https://github.com/j32ryc/xiangqi) · [README](https://github.com/j32ryc/xiangqi/blob/main/README.md) · [界面截图](https://github.com/j32ryc/xiangqi/blob/main/docs/preview.jpg) | 木纹棋盘、棋子投影、落子反馈、翻转棋盘、被吃子列表、四档 AI、触屏操作 | 借鉴传统棋盘的层次，以及棋盘附近的少量常用操作 | [MIT](https://github.com/j32ryc/xiangqi/blob/main/LICENSE)；若以后复制代码，须保留版权与许可文本。本轮采用设计启发 |
| [benckx/elephantchess](https://github.com/benckx/elephantchess) · [在线页面](https://elephantchess.io/) | 对弈、电脑、战术题、棋局库、分析分区；棋子样式、坐标、对比度、声音等设置 | 模式入口按玩家目的命名；将显示选项放入设置；以后扩展复盘与战术题 | [README 许可说明](https://github.com/benckx/elephantchess/blob/main/README.md)：应用 GPL-3.0，部分库 LGPL-3.0；引入时按模块核对 |
| [lucaferranti/xiangqiground](https://github.com/lucaferranti/xiangqiground) | 独立棋盘 UI：点选、拖动、触屏、尺寸适配、末着/将军/合法落点、箭头；不包含象棋规则 | 借鉴交互状态与教学标注方式。现有 Board 已支持键盘、点选与合法落点，适合继续扩展 | [GPL-3.0-or-later 声明](https://github.com/lucaferranti/xiangqiground#license)；暂作为交互参考，不新增依赖 |
| [hartwork/xiangqi-setup](https://github.com/hartwork/xiangqi-setup) | 从棋谱或 FEN 生成 SVG 棋图；棋盘、棋子主题可独立组合；支持箭头和注释 | 教学插图、导出棋图、未来的简洁教学主题 | [README 的逐主题许可表](https://github.com/hartwork/xiangqi-setup/blob/master/README.md)：包含 CC0、署名、相同方式共享及非商用资源，不能统一按 CC0 处理 |
| [brianhliou/mistboard](https://github.com/brianhliou/mistboard) | 链接邀请房间、可免账号对弈、战术题、课程、赛后回放与导出；规则、棋盘、服务端、网页分层 | 后续好友房与复盘架构参考；服务端持有正式棋局状态 | [AGPL-3.0-or-later](https://github.com/brianhliou/mistboard#license)；本轮借鉴产品和架构思路 |
| [official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish) | UCI 中国象棋引擎，需另配 GUI | 以后增加进阶分析与强棋力对手时评估引擎适配 | [GPL-3.0](https://github.com/official-pikafish/Pikafish/blob/master/Copying.txt)；需单独验证部署方式、设备负载和许可安排 |

没有按星数或 README 中的“大师”等名称推断棋力。也没有发现可直接证明适合弈象的、许可清楚的完整新手课程题库；教学题继续自行编写并通过现有规则引擎验证。

## 2. UI 风格取舍

下表是基于参考资料与现有产品的设计判断。

| 方向 | 适合的体验 | 弈象取舍 |
| --- | --- | --- |
| 传统木纹 + 宣纸卡片 + 墨绿导航 | 棋盘辨识度高，与当前风格一致 | **推荐主风格**。减少任务卡的装饰，突出当前目标、阶段和反馈 |
| 简洁浅色棋盘 + 清晰线条 | 规则教学、注释、低对比度环境 | 建议后续作为“教学清晰模式”；先用已有 SVG/CSS 实现原创建议稿 |
| 深色竞技大厅 + 多模式导航 | 熟练玩家、联网、比赛 | 后续联网阶段评估；当前不增加大厅、排行榜入口的负担 |

### 当前教学版本的落点

- 桌面以一张可操作棋盘为中心，任务和章节目录在右侧。规则示例继续并排显示，避免右侧棋盘落到右下方。
- 教学阶段直接显示“看示范 → 自己练 → 换题挑战”。演示与练习分阶段复用棋盘，让新手不用判断哪张棋盘能操作。
- 提示分层展开，成功反馈解释实际着法；“已练习”和“已掌握”分别显示，见过答案的原题重做不授掌握。
- 第八章提供“带提示下第一盘”和“自己下第一盘”。实战结束显示终局原因、着数、回看与复习入口。
- 平板横屏有足够宽度时并排，竖屏按任务、棋盘、操作、反馈排列；按钮与选择题能触摸和键盘操作。

这些内容属于已批准的新手教学第二阶段。开源参考帮助整理界面层次，课程判定仍使用弈象的真实棋局状态。

### 后续棋盘显示改进

建议按“翻转视角 → 被吃子列表 → 坐标开关 → 清晰教学主题”的顺序推进。视角翻转只改变显示，记谱和内部坐标保持一致；显示设置不改变合法着法。每项需要验证执黑、回看、键盘及触屏，避免用旋转整张棋盘导致棋字倒置。

## 3. 游戏模式路线

| 顺序 | 模式或改进 | 玩家收益 | 依赖与验收 |
| --- | --- | --- | --- |
| 当前阶段 | 新手课堂、带教练首盘、独立首盘 | 从看懂走法到真正下完一盘 | 完成演示/练习/陌生变式；刷新不丢进度；提示历史不被重试清除 |
| 下一阶段 | AI 难度预设、按主题练残局、错题再练 | 自己选择练习强度，集中练将军、应将、配合 | 难度明确说明搜索限制，不承诺未经测量的等级分；题目合法且多解按目标判定 |
| 下一阶段 | 棋局导入导出、摆棋研究、带注释复盘 | 收藏棋局，自己尝试不同路线 | 明确定义支持格式；导入校验；研究分支与正式对局记录分开 |
| 联网阶段 | 好友邀请房、双方时钟、重连与复盘 | 平板或电脑与朋友远程下棋 | 新增服务端；服务端校验着法与行棋方；验证重复提交、重连和超时 |
| 更后阶段 | 进阶引擎分析、揭棋等独立变体 | 熟练后的研究与趣味玩法 | 引擎与资源许可已确定；变体独立规则和教学，标准象棋课堂仍用标准规则 |

不要将第三方项目的“三次重复自动判和”等简化规则直接迁入。弈象现有边界是重复局面提示，复杂长将、长捉等棋例依照赛事规则另行裁决。产品规则说明见 [README](../../README.md#规则来源与边界)。

## 4. 为独立 GitHub 仓库准备

建议发布 `xiangqi-game/` 游戏目录，保持 `src/`、`tests/`、`public/`、`docs/`、锁文件和运行说明完整。不要把整个工作区里的其他项目一起发布。

已整理 [贡献指南](../../CONTRIBUTING.md) 和 [资源与依赖记录](../third-party-assets.md)。实际开源前按 [开源准备](../open-source-preparation.md) 完成许可证选择、可复现安装及发布验证。

弈象的许可证由项目所有者决定。参考项目“公开可查看”并不代表任意代码和素材可直接复制；GitHub 官方说明了[许可证的作用与放置位置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。本轮没有从上述六个项目复制代码、图片、音效或题库。
