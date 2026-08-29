# Übersicht 桌面 widget

桌面常驻的日语单词滚动卡片,读的是和 `index.html` 同一个 Google Sheet。

## 安装

这个目录是**源文件**;Übersicht 那边是一个指回来的软链接:

```sh
ln -s ~/Documents/Projects/vocab-cards/ubersicht-widget \
      ~/Library/Application\ Support/Übersicht/widgets/vocab-widget
```

改这里的 `index.jsx`,菜单栏 → Refresh All Widgets 就生效,不用来回拷贝。
(Übersicht 用 `fs.stat` 扫描 widgets 目录,会跟随软链接。但 FSEvents 不一定
监听得到软链目录里的改动,所以改完最好手动 Refresh 一次,别指望自动重载。)

## 配置

常改的三处都在 `index.jsx` 顶部:

| 配置 | 作用 |
| --- | --- |
| `POSITION` | 显示在屏幕哪个位置,常用写法见注释 |
| `ROTATE_MS` | 多久换一个词(毫秒),同时控制刷新周期 |
| `CATEGORIES` | 有哪些栏目;`DEFAULT_CATEGORY` 定启动时显示哪个 |

## 和主项目的耦合

`index.jsx` 复制了 `index.html` 里的这几样东西,**改了那边要记得同步这边**:

- `parseCsv` / `parseCsvToWords` 解析函数
- `CATEGORY_CSV_FIELDS`(8 列)和 `NOTEBOOK_CSV_FIELDS`(10 列)的列顺序
- 各栏目的 gid

表格加列或调列序时,网页会正常、widget 会静默错位(比如释义栏串成日期),
所以这是最需要留意的一处重复。

## 行为

- 所有栏目在一次 shell command 里用 curl 全部拉下来,缓存在
  `/tmp/vocab-widget-cache-<gid>.csv`,最多每 `CACHE_MINUTES` 分钟重拉一次。
  切换栏目是纯内存操作,不发请求。
- curl 失败时先写 `.tmp` 再 `mv`,断网会保留旧数据而不是清空。
- 只读。不走 `NOTEBOOK_WRITE_URL`,不会改动生词本。
- 点标签页切换栏目需要 Übersicht 偏好设置里勾上 "Enable interaction"(全局开关)。
