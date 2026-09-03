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

常改的几处都在 `index.jsx` 顶部:

| 配置 | 作用 |
| --- | --- |
| `POSITION` | 显示在屏幕哪个位置,常用写法见注释 |
| `ROTATE_MS` | 多久换一个词(毫秒),同时控制刷新周期 |
| `NOTEBOOK_NAME` | 生词本栏目名,固定读法(CSV)不一样,靠这个标记区分 |
| `DEFAULT_CATEGORY` | 启动时默认显示哪个栏目(按名字匹配) |

类目本身不用配置了 —— 和 `index.html` 一样,自动从 Apps Script 的
`?action=categories` / `?action=words&category=...` 读取,Google Sheets 里
新建一个 tab 就会自动出现在栏目列表里。

## 和主项目的耦合

`index.jsx` 复制了 `index.html` 里的这几样东西,**改了那边要记得同步这边**:

- `parseCsv` / `parseCsvToWords` 解析函数(现在只有生词本用得到,类目已经是 JSON)
- `NOTEBOOK_CSV_FIELDS`(10 列)的列顺序
- `APPS_SCRIPT_URL`(即 `NOTEBOOK_WRITE_URL`)

类目词条现在走 JSON,字段名已经对好,不再有列顺序错位的问题。生词本还是 CSV,
表格给生词本加列或调列序时,网页会正常、widget 会静默错位,这是唯一还需要留意的重复。

## 行为

- 每次刷新先用 curl 拉 `?action=categories` 拿到当前所有类目名(缓存在
  `/tmp/vocab-widget-cache-categories.json`),再逐个类目拉词条(按类目名哈希
  缓存成 `/tmp/vocab-widget-cache-cat-<hash>.json`),生词本单独走 CSV 缓存在
  `/tmp/vocab-widget-cache-notebook.csv`。都是最多每 `CACHE_MINUTES` 分钟重拉一次,
  切换栏目是纯内存操作,不发请求。
- curl 失败时先写 `.tmp` 再 `mv`,断网会保留旧数据而不是清空。
- 选中栏目按名字记,不按下标 —— 类目列表在刷新之间增减/重排时不会错位到别的栏目。
- 只读。不走 POST,不会改动生词本。
- 点标签页切换栏目需要 Übersicht 偏好设置里勾上 "Enable interaction"(全局开关)。
