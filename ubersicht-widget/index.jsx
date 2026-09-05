// 日语单词滚动显示 widget —— 右侧
// 所有逻辑都在 widget-core.jsx(左右两个 widget 共用),这里只配置本实例的位置。
// 改这个文件之外的行为(类目解析、生词本 CSV 字段、缓存策略……)去改 widget-core.jsx,
// 左右两边会同时生效。

import { createVocabWidget } from "./widget-core.jsx";

// 只改这一段。用 CSS 定位,top/right/bottom/left 四个方向自由组合。
// 常用写法:
//   右下角(当前)     bottom: 40px; right: 24px;
//   右上角            top: 40px; right: 24px;
//   右侧中部          top: 50%; right: 24px; transform: translateY(-50%);
const POSITION = `
  bottom: 40px;
  right: 24px;
`;

const widget = createVocabWidget(POSITION);

export const command = widget.command;
export const refreshFrequency = widget.refreshFrequency;
export const initialState = widget.initialState;
export const updateState = widget.updateState;
export const className = widget.className;
export const render = widget.render;
