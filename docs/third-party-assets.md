# 素材与依赖记录

核查日期：2026-10-09。此记录区分“研究参考”与“实际引入”，不代表已完成所有传递依赖的许可审计。

## 游戏视觉资源

| 资源 | 当前实现与来源 |
| --- | --- |
| 棋盘、棋子、合法落点、将军标记 | 项目内 `src/ui/Board.tsx` 的 SVG/HTML 与 `src/styles.css`，未在本轮引入外部图片 |
| 网站图标 | 项目内 `public/favicon.svg` |
| 字体 | CSS 指定系统字体回退，未打包外部字体文件 |
| 开源参考项目 | [调研记录](research/2026-10-09-open-source-reference-review.md)，本轮未复制代码或素材 |

## 直接依赖的已安装元数据

下表来自当前 `node_modules/<package>/package.json` 的 `version` 和 `license` 字段。正式发布时还需保留所分发依赖的许可文本，并核查锁文件中的传递依赖。

| 包 | 版本 | 声明许可 |
| --- | --- | --- |
| react / react-dom | 19.2.6 | MIT |
| @testing-library/react | 16.3.0 | MIT |
| @testing-library/user-event | 14.6.1 | MIT |
| @types/react | 19.2.14 | MIT |
| @types/react-dom | 19.2.3 | MIT |
| @vitejs/plugin-react | 6.0.2 | MIT |
| jsdom | 27.2.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 8.0.13 | MIT |
| vitest | 5.0.1 | MIT |

## 以后引入资源时的记录字段

每次引入填写资源名、项目内路径、原始仓库/页面、固定版本或提交、作者、许可证文件链接、需展示的署名、是否修改及修改说明。素材的许可按具体文件核对，不以仓库整体标签代替。
