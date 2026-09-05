// 共享核心逻辑:左右两个 widget 的 index.jsx 都从这里 require,
// 唯一的区别是各自传入不同的 POSITION,其余配置/逻辑完全一致。
// 改这里的任何东西(类目解析、生词本 CSV 字段、缓存策略……)两边会同时生效,
// 不用再像以前那样手动同步两份文件。
//
// 数据来源:kindle-vocards 项目同一个 Apps Script API(类目/词条)+ Google Sheets CSV(生词本)

export function createVocabWidget(POSITION) {
  // ==== 整体缩放 ====
  // 下面样式里所有尺寸(宽度、内边距、字号、间距)都是按这个倍数算出来的,
  // 觉得整体太大或太小就只改这一个数字,比例保持不变。1 = 原始大小。
  const SCALE = 1.5;

  // 缩放前的基准宽度,实际宽度 = BASE_WIDTH * SCALE
  const BASE_WIDTH = 260;

  // 把基准像素值乘上 SCALE,保留一位小数够用了
  function px(n) {
    return Math.round(n * SCALE * 10) / 10 + "px";
  }

  // ==== 换词间隔 ====
  // 单位毫秒。30000 = 30 秒。这一行同时控制刷新周期和取词,只改这一处。
  const ROTATE_MS = 30000;

  // ==== 类目 ====
  // 类目和 index.html 一样,自动从 Apps Script 的 ?action=categories 读取,
  // Google Sheets 里新建一个 tab 就会自动出现,不用改这个文件。
  // 这里只需要配置生词本栏目名(固定读法不一样,靠这个标记区分)和启动时默认显示哪个栏目。
  const NOTEBOOK_NAME = "生词本";
  const DEFAULT_CATEGORY = "特色记忆法则";

  // ============ 以下一般不用改 ============

  // 和 index.html 里的 NOTEBOOK_WRITE_URL 保持一致
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyGL9tXO1WBigSsMkplydjTG77r2s3VvmXL0hntnFnObSPhC-G7I57rw3Fo-uA9zOblrg/exec";

  // 生词本走 CSV(和 index.html 的 NOTEBOOK_READ_CSV_URL 一致),必须是 gviz/tq 格式,不要用 pub?output=csv
  const SHEET_ID = "1Cs3VzifCQzwrglVBGhSxTmLin2gWVFPiTbMawNv1D_0";
  const NOTEBOOK_CSV_URL =
    "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&gid=0";

  // 磁盘缓存:类目列表、每个类目的词条、生词本 CSV 各一份,最多每 CACHE_MINUTES 分钟重拉一次。
  // 左右两个 widget 用同一份缓存(同一个 CACHE_PREFIX),数据一样,没必要各拉一份。
  // curl 失败时先写 .tmp 再 mv,所以网络断了会保留旧数据而不是清空。
  // 定成 10 分钟是迁就生词本:类目词表基本不变,但生词本会随时增删,一小时的滞后太久了。
  const CACHE_PREFIX = "/tmp/vocab-widget-cache-";
  const CACHE_MINUTES = 10;

  const DELIM = "<<<VOCAB-CAT:";

  // 类目名可能含中文/特殊字符,不直接拿来当文件名,用 shasum 哈希出一个安全的缓存文件名。
  // 类目列表本身是一次性全部拉下来、动态循环取词,shell 脚本里没法用 JS 的 CATEGORIES.map 了,
  // 改成一段完整脚本:先拉类目列表,用 grep/sed 摘出双引号里的名字(第一个是 "categories" 键本身要跳过),
  // 再逐个类目拉词条,和生词本 CSV 一起用同一个 DELIM 分隔输出。
  const command = `
CATS_CACHE="${CACHE_PREFIX}categories.json";
if [ ! -s "$CATS_CACHE" ] || [ -n "$(find "$CATS_CACHE" -mmin +${CACHE_MINUTES} 2>/dev/null)" ]; then
  curl -sL --max-time 20 "${APPS_SCRIPT_URL}?action=categories" -o "$CATS_CACHE.tmp" && [ -s "$CATS_CACHE.tmp" ] && mv "$CATS_CACHE.tmp" "$CATS_CACHE";
  rm -f "$CATS_CACHE.tmp";
fi;
CATS=$(grep -o '"[^"]*"' "$CATS_CACHE" 2>/dev/null | sed -n '2,$p' | sed 's/^"//; s/"$//');
while IFS= read -r cat; do
  [ -z "$cat" ] && continue;
  HASH=$(printf '%s' "$cat" | shasum -a 256 | cut -c1-16);
  CACHE="${CACHE_PREFIX}cat-$HASH.json";
  if [ ! -s "$CACHE" ] || [ -n "$(find "$CACHE" -mmin +${CACHE_MINUTES} 2>/dev/null)" ]; then
    curl -sL --max-time 20 -G --data-urlencode "action=words" --data-urlencode "category=$cat" "${APPS_SCRIPT_URL}" -o "$CACHE.tmp" && [ -s "$CACHE.tmp" ] && mv "$CACHE.tmp" "$CACHE";
    rm -f "$CACHE.tmp";
  fi;
  echo "${DELIM}$cat";
  cat "$CACHE" 2>/dev/null;
  echo;
done <<EOF
$CATS
EOF
NB_CACHE="${CACHE_PREFIX}notebook.csv";
if [ ! -s "$NB_CACHE" ] || [ -n "$(find "$NB_CACHE" -mmin +${CACHE_MINUTES} 2>/dev/null)" ]; then
  curl -sL --max-time 20 "${NOTEBOOK_CSV_URL}" -o "$NB_CACHE.tmp" && [ -s "$NB_CACHE.tmp" ] && mv "$NB_CACHE.tmp" "$NB_CACHE";
  rm -f "$NB_CACHE.tmp";
fi;
echo "${DELIM}${NOTEBOOK_NAME}";
cat "$NB_CACHE" 2>/dev/null;
echo;
`;

  // 刷新周期 == 换词周期。数据不会每次都重新请求,由上面的磁盘缓存挡住。
  const refreshFrequency = ROTATE_MS;

  // ==== 生词本 CSV 解析(照搬 vocab-cards/index.html 的 parseCsv / parseCsvToWords)====
  // 类目词条现在是 JSON(Apps Script 返回,字段名已经对好,不用再按列顺序映射),
  // 只有生词本还是 CSV,所以 CSV 解析器和固定列顺序只留给生词本用。

  const NOTEBOOK_CSV_FIELDS = [
    "word",
    "kana",
    "pos",
    "mnemonic",
    "meaning_cn",
    "example_jp",
    "example_cn",
    "jlpt_point",
    "source_category",
    "added_at",
  ];

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

  // 把 command 的输出按分隔行切成 { 类目名: 词条数组 },同时收集类目出现的顺序(排除生词本)。
  function parseAllCategories(text) {
    const byCat = {};
    const catNames = [];
    const parts = String(text || "").split(DELIM);
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const nl = p.indexOf("\n");
      if (nl === -1) continue;
      const name = p.slice(0, nl).trim();
      const body = p.slice(nl + 1);
      if (name === NOTEBOOK_NAME) {
        try {
          byCat[name] = parseCsvToWords(body, NOTEBOOK_CSV_FIELDS);
        } catch (e) {
          byCat[name] = [];
        }
        continue;
      }
      catNames.push(name);
      try {
        const obj = JSON.parse(body);
        byCat[name] = (obj && obj.words) || [];
      } catch (e) {
        byCat[name] = [];
      }
    }
    return { byCat, catNames };
  }

  // 内存缓存:同一份输出文本只解析一次,30 秒一次的刷新不会重复解析。
  let cachedText = null;
  let cachedParsed = { byCat: {}, catNames: [] };

  function getParsed(text) {
    if (text === cachedText) return cachedParsed;
    cachedText = text;
    cachedParsed = parseAllCategories(text);
    return cachedParsed;
  }

  // ==== 状态 ====
  // 按名字记选中栏目而不是按下标,类目列表长度/顺序在刷新之间可能变化(新增/删除 tab),
  // 下标会错位指到别的栏目,名字不会。

  const initialState = {
    selectedName: DEFAULT_CATEGORY,
    byCat: {},
    catNames: [],
    error: null,
  };

  const updateState = (event, prev) => {
    if (event.type === "UB/COMMAND_RAN") {
      if (event.error) {
        return { ...prev, error: String(event.error) };
      }
      const { byCat, catNames } = getParsed(event.output);
      return { ...prev, byCat, catNames, error: null };
    }
    if (event.type === "SET_CATEGORY") {
      return { ...prev, selectedName: event.name };
    }
    return prev;
  };

  // ==== 样式 ====
  const className = `
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
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      gap: ${px(4)} ${px(10)};
      margin-bottom: ${px(10)};
    }

    .vw-tabs::-webkit-scrollbar {
      display: none;
    }

    .vw-tab {
      font-size: ${px(6)};
      color: rgba(255, 255, 255, 0.45);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
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

    .vw-example {
      font-size: ${px(14 * 0.8)};
      color: rgba(255, 255, 255, 0.7);
      margin-top: ${px(6)};
    }

    .vw-example-cn {
      color: rgba(255, 255, 255, 0.5);
      margin-top: ${px(2)};
    }

    .vw-error {
      font-size: ${px(14)};
      color: rgba(255, 255, 255, 0.8);
    }
  `;

  // ==== 渲染 ====
  const render = (state, dispatch) => {
    const tabs = (state.catNames || []).concat([NOTEBOOK_NAME]);
    const selectedName = tabs.indexOf(state.selectedName) !== -1 ? state.selectedName : tabs[0];
    const byCat = state.byCat || {};
    const words = byCat[selectedName] || [];

    // 拉到了数据但一条没有(比如生词本还没加过词,或类目列表还没拉回来),跟"根本没拉到"是两回事,
    // 分开提示,免得把空生词本/加载中误报成加载失败。
    const loaded = Object.prototype.hasOwnProperty.call(byCat, selectedName);

    // 按时间分桶取词,顺序滚动;不依赖组件自身状态,重载后也能接着走。
    const w = words.length
      ? words[Math.floor(Date.now() / ROTATE_MS) % words.length]
      : null;

    return (
      <div>
        {tabs.length > 1 ? (
          <div className="vw-tabs">
            {tabs.map((name) => {
              const count = Object.prototype.hasOwnProperty.call(byCat, name)
                ? byCat[name].length
                : null;
              return (
                <div
                  key={name}
                  className={"vw-tab" + (name === selectedName ? " vw-tab-active" : "")}
                  onClick={() => dispatch({ type: "SET_CATEGORY", name })}
                >
                  {name}
                  {count !== null ? "（" + count + "）" : ""}
                </div>
              );
            })}
          </div>
        ) : null}

        {w ? (
          <div>
            <div className="vw-word">{w.word}</div>
            {w.kana ? <div className="vw-kana">{w.kana}</div> : null}
            {w.meaning_cn ? <div className="vw-meaning">{w.meaning_cn}</div> : null}
            {w.mnemonic ? <div className="vw-mnemonic">{w.mnemonic}</div> : null}
            {w.example_jp ? <div className="vw-example">{w.example_jp}</div> : null}
            {w.example_cn ? <div className="vw-example vw-example-cn">{w.example_cn}</div> : null}
          </div>
        ) : (
          <div className="vw-error">{loaded ? "这一栏还没有词" : "加载中/加载失败"}</div>
        )}
      </div>
    );
  };

  return { command, refreshFrequency, initialState, updateState, className, render };
}
