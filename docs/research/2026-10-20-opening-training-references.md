# 开局跟练：开源资料与设计取舍

调研日期：2026-10-20。

## 本轮采用的方向

现有棋盘主题、失子显示、收藏与复盘试走已经覆盖一部分早期调研建议。本轮优先把开局示范发展为亲手跟练：四条短路线，分别练习红方和黑方，逐步了解双方出子。

这是一种教学路线复现练习。真实规则引擎负责合法性检查；指定着法负责本次课程目标，两者分别反馈。课程之外的合法走法不因此被判为坏棋，也不把固定示例应手称为引擎最佳应对。

## 一手参考

| 资料 | 核对到的内容与借鉴点 | 声明的许可 |
| --- | --- | --- |
| [PyChess 源码](https://github.com/pychess/pychess-variants)、[官方功能页](https://www.pychess.org/features) | 学习、研究、战术题和棋谱工具的不同入口，参考学习与分析功能的组织 | 仓库 AGPL-3.0 |
| [ElephantChess](https://github.com/benckx/elephantchess) | 对弈、战术练习、带注释和变化的分析棋盘；参考练习与正式对局分开 | 应用默认 GPL-3.0，README 另列部分库 LGPL-3.0 |
| [j32ryc/xiangqi](https://github.com/j32ryc/xiangqi) | README 描述木色棋盘、触摸与显示辅助，复核此前视觉方向 | 仓库标记 MIT；本轮独立许可页读取失败 |
| [XiangQi Wizard Light](https://github.com/xqbase/xqwlight) | 简明象棋搜索算法，保留为未来算法研究资料 | 仓库 GPL-2.0 |
| [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)、[Pikafish](https://github.com/official-pikafish/Pikafish) | 后续强引擎与分析候选；需要另行验证构建、资源、许可和移动端表现 | 各仓库 GPL-3.0 |

上述功能依据官方项目资料核对，未运行这些外部应用来测量棋力或设备性能。许可证须按具体文件与集成方式复核，不能把应用和独立库的不同许可混为一谈。

Gitee 检索发现 [JavaScript 教程候选](https://gitee.com/taadis/write-a-chinesechess-program) 和 [WPF 源码候选](https://gitee.com/cygsd/Chess)，但正文访问超时，许可未核实，不作为本次实现依据。Codeberg 检索受 robots 限制，未列出未经阅读的仓库。

## 原创内容与边界

- 本轮参考交互组织，不引入上述项目的源码、棋谱库、课程文字、图片或引擎权重。
- 短路线延续、逐着说明和提示由本项目原创；每着须从标准初始局面经本项目规则引擎真实重放。
- 完成记录只描述该组短路线的本轮表现，不等同于掌握某种开局。
- 多步战术需要另行验证防守分支与多解；强引擎需要单独评估。二者不混入本轮跟练。

原有资料见 [早期调研与路线](2026-10-09-open-source-reference-review.md)，依赖与资源记录见 [第三方资产说明](../third-party-assets.md)。
