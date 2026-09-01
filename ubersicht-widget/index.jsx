// 日语单词滚动显示 widget
// 数据来源:kindle-vocards 项目已发布的 Google Sheets CSV
//
// ┌─ 常改的三处配置都在最上面 ─────────────────────────┐
// │ 1. POSITION      —— 显示在屏幕的哪个位置            │
// │ 2. ROTATE_MS     —— 多久换一个词                    │
// │ 3. CATEGORIES    —— 有哪些类目 / 默认显示哪个        │
// └────────────────────────────────────────────────┘

// ==== 1. 位置 ====
// 只改这一段。用 CSS 定位,top/right/bottom/left 四个方向自由组合。
// 常用写法:
//   右下角(当前)     bottom: 40px; right: 24px;
//   左下角            bottom: 40px; left: 24px;
//   右上角            top: 40px; right: 24px;
//   右侧中部          top: 50%; right: 24px; transform: translateY(-50%);
//   左侧中部          top: 50%; left: 24px;  transform: translateY(-50%);
//   屏幕正中          top: 50%; left: 50%; transform: translate(-50%, -50%);
// 数字调大 = 离那条边更远。也可以用百分比,比如 top: 30% 就是偏上一点。
const POSITION = `
  bottom: 40px;
  right: 24px;
`;

// ==== 1.5 整体缩放 ====
// 下面样式里所有尺寸(宽度、内边距、字号、间距)都是按这个倍数算出来的,
// 觉得整体太大或太小就只改这一个数字,比例保持不变。1 = 原始大小。
const SCALE = 1.5;

// 缩放前的基准宽度,实际宽度 = BASE_WIDTH * SCALE
const BASE_WIDTH = 260;

// 把基准像素值乘上 SCALE,保留一位小数够用了
function px(n) {
  return Math.round(n * SCALE * 10) / 10 + "px";
}

// ==== 2. 换词间隔 ====
// 单位毫秒。30000 = 30 秒。这一行同时控制刷新周期和取词,只改这一处。
const ROTATE_MS = 30000;

// ==== 3. 类目 ====
// 加类目 = 在这个数组里加一行(name 随便写,gid 从表格 URL 里抄)。
// 和 vocab-cards/index.html 里 CATEGORY_SOURCES 的 gid 保持一致。
//
// notebook: true 表示这一栏是生词本(gid=0)。生词本的 CSV 比类目多了
// "来源类目""加入时间"两列,所以要用不同的列顺序数组解析,靠这个标记区分。
// 这里只读不写,不会碰到生词本的 +/- 同步。
const CATEGORIES = [
  { name: "特色记忆法则", gid: "80857184" },
  { name: "红薯老师词", gid: "1695379107" },
  { name: "生词本", gid: "0", notebook: true },
];

// 启动时默认显示哪个类目(填上面的 name)。运行时点标签页可以切换。
const DEFAULT_CATEGORY = "特色记忆法则";

// ============ 以下一般不用改 ============

const SHEET_ID = "1Cs3VzifCQzwrglVBGhSxTmLin2gWVFPiTbMawNv1D_0";

// CSV 链接必须是 gviz/tq 格式,不要用 pub?output=csv
function csvUrl(gid) {
  return (
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?tqx=out:csv&gid=" +
    gid
  );
}

// CSV 磁盘缓存:每个类目一个文件,最多每 CACHE_MINUTES 分钟重拉一次,其余时间直接 cat。
// curl 失败时先写 .tmp 再 mv,所以网络断了会保留旧数据而不是清空。
// 定成 10 分钟是迁就生词本:类目词表基本不变,但生词本会随时增删,
// 一小时的滞后太久了。三个表加起来一次约 170KB,10 分钟一次不算重。
const CACHE_PREFIX = "/tmp/vocab-widget-cache-";
const CACHE_MINUTES = 10;

// 所有类目一次性全部拉下来,切换类目时不需要重新请求,点一下就切。
const DELIM = "<<<VOCAB-CAT:";

export const command = CATEGORIES.map(
  (c) => `
CACHE="${CACHE_PREFIX}${c.gid}.csv";
if [ ! -s "$CACHE" ] || [ -n "$(find "$CACHE" -mmin +${CACHE_MINUTES} 2>/dev/null)" ]; then
  curl -sL --max-time 20 "${csvUrl(c.gid)}" -o "$CACHE.tmp" && [ -s "$CACHE.tmp" ] && mv "$CACHE.tmp" "$CACHE";
  rm -f "$CACHE.tmp";
fi;
echo "${DELIM}${c.name}";
cat "$CACHE" 2>/dev/null;
echo;
`
).join("\n");

// 刷新周期 == 换词周期。CSV 不会每次都重新请求,由上面的磁盘缓存挡住。
export const refreshFrequency = ROTATE_MS;

// ==== CSV 解析(照搬 vocab-cards/index.html 的 parseCsv / parseCsvToWords)====

// 类目 CSV 列的固定顺序
const CATEGORY_CSV_FIELDS = [
  "word",
  "kana",
  "pos",
  "mnemonic",
  "meaning_cn",
  "example_jp",
  "example_cn",
  "jlpt_point",
];

// 生词本 CSV 列的固定顺序:前 8 列和类目一致,末尾多了来源类目和加入时间
const NOTEBOOK_CSV_FIELDS = CATEGORY_CSV_FIELDS.concat([
  "source_category",
  "added_at",
]);

function fieldsFor(catName) {
  const c = CATEGORIES.find((x) => x.name === catName);
  return c && c.notebook ? NOTEBOOK_CSV_FIELDS : CATEGORY_CSV_FIELDS;
}

// 极简 CSV 解析器,处理逗号分隔和引号转义
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  var i = 0;
  var len = text.length;
  while (i < len) {
    var c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i += 1;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i += 1;
      } else if (c === "\r") {
        i += 1;
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i += 1;
      } else {
        field += c;
        i += 1;
      }
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

// CSV -> 词条对象数组:按固定列顺序位置映射,不依赖表头文字
function parseCsvToWords(text, fields) {
  var rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r.length === 1 && r[0] === "") {
      continue;
    }
    var obj = {};
    for (var j = 0; j < fields.length; j++) {
      obj[fields[j]] = r[j] !== undefined ? r[j] : "";
    }
    if (!obj.word) {
      continue;
    }
    result.push(obj);
  }
  return result;
}

// 把 command 的输出按分隔行切成 { 类目名: 词条数组 }
function parseAllCategories(text) {
  const byCat = {};
  const parts = String(text || "").split(DELIM);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const nl = p.indexOf("\n");
    if (nl === -1) continue;
    const name = p.slice(0, nl).trim();
    try {
      byCat[name] = parseCsvToWords(p.slice(nl + 1), fieldsFor(name));
    } catch (e) {
      byCat[name] = [];
    }
  }
  return byCat;
}

// 内存缓存:同一份输出文本只解析一次,30 秒一次的刷新不会重复解析。
let cachedText = null;
let cachedByCat = {};

function getByCat(text) {
  if (text === cachedText) return cachedByCat;
  cachedText = text;
  cachedByCat = parseAllCategories(text);
  return cachedByCat;
}

// ==== 状态 ====

const defaultIndex = Math.max(
  0,
  CATEGORIES.findIndex((c) => c.name === DEFAULT_CATEGORY)
);

export const initialState = {
  catIndex: defaultIndex,
  byCat: {},
  error: null,
};

export const updateState = (event, prev) => {
  if (event.type === "UB/COMMAND_RAN") {
    if (event.error) {
      return { ...prev, error: String(event.error) };
    }
    return { ...prev, byCat: getByCat(event.output), error: null };
  }
  if (event.type === "SET_CATEGORY") {
    return { ...prev, catIndex: event.index };
  }
  return prev;
};

// ==== 样式 ====
export const className = `
  ${POSITION}
  width: ${px(BASE_WIDTH)};
  box-sizing: border-box;
  padding: ${px(14)} ${px(18)} ${px(16)};
  background-color: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  border-radius: ${px(12)};
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "PingFang SC", "Helvetica Neue", sans-serif;
  line-height: 1.45;
  word-break: break-word;

  .vw-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: ${px(4)} ${px(10)};
    margin-bottom: ${px(10)};
  }

  .vw-tab {
    font-size: ${px(12)};
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
  }

  .vw-tab-active {
    color: rgba(255, 255, 255, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.6);
  }

  .vw-word {
    font-size: ${px(28)};
    font-weight: 600;
  }

  .vw-kana {
    font-size: ${px(16)};
    color: rgba(255, 255, 255, 0.75);
    margin-top: ${px(2)};
  }

  .vw-meaning {
    font-size: ${px(14)};
    margin-top: ${px(8)};
  }

  .vw-mnemonic {
    font-size: ${px(13)};
    color: rgba(255, 255, 255, 0.65);
    margin-top: ${px(6)};
  }

  .vw-error {
    font-size: ${px(14)};
    color: rgba(255, 255, 255, 0.8);
  }
`;

// ==== 渲染 ====
export const render = (state, dispatch) => {
  const cat = CATEGORIES[state.catIndex] || CATEGORIES[0];
  const byCat = state.byCat || {};
  const words = byCat[cat.name] || [];

  // 拉到了数据但一条没有(比如生词本还没加过词),跟"根本没拉到"是两回事,
  // 分开提示,免得把空生词本误报成加载失败。
  const loaded = Object.prototype.hasOwnProperty.call(byCat, cat.name);

  // 按时间分桶取词,顺序滚动;不依赖组件自身状态,重载后也能接着走。
  const w = words.length
    ? words[Math.floor(Date.now() / ROTATE_MS) % words.length]
    : null;

  return (
    <div>
      {CATEGORIES.length > 1 ? (
        <div className="vw-tabs">
          {CATEGORIES.map((c, i) => (
            <div
              key={c.gid}
              className={"vw-tab" + (i === state.catIndex ? " vw-tab-active" : "")}
              onClick={() => dispatch({ type: "SET_CATEGORY", index: i })}
            >
              {c.name}
            </div>
          ))}
        </div>
      ) : null}

      {w ? (
        <div>
          <div className="vw-word">{w.word}</div>
          {w.kana ? <div className="vw-kana">{w.kana}</div> : null}
          {w.meaning_cn ? <div className="vw-meaning">{w.meaning_cn}</div> : null}
          {w.mnemonic ? <div className="vw-mnemonic">{w.mnemonic}</div> : null}
        </div>
      ) : (
        <div className="vw-error">{loaded ? "这一栏还没有词" : "加载失败"}</div>
      )}
    </div>
  );
};
