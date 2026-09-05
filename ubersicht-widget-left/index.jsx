// 日语单词滚动显示 widget —— 左侧
// widget-core.jsx 是软链接,指回 ../ubersicht-widget/widget-core.jsx,
// 和右侧那个 widget 共用同一份逻辑,不用维护两份。
// 改这个文件之外的行为(类目解析、生词本 CSV 字段、缓存策略……)去改
// ubersicht-widget/widget-core.jsx,左右两边会同时生效。

import { createVocabWidget } from "./widget-core.jsx";

// 只改这一段。用 CSS 定位,top/right/bottom/left 四个方向自由组合。
// 常用写法:
//   左下角(当前,和右侧对称)   bottom: 40px; left: 24px;
//   左上角                      top: 40px; left: 24px;
//   左侧中部                    top: 50%; left: 24px; transform: translateY(-50%);
const POSITION = `
  bottom: 40px;
  left: 24px;
`;

const widget = createVocabWidget(POSITION);

export const command = widget.command;
export const refreshFrequency = widget.refreshFrequency;
export const initialState = widget.initialState;
export const updateState = widget.updateState;
export const className = widget.className;
export const render = widget.render;
