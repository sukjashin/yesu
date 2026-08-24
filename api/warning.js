const DEFAULT_REG_ID = '4613000000'; // 전남 여수시 행정구역 코드
const EMPTY_WARNING_TEXT = '내용없음';
const WARNING_URL = 'https://apis.data.go.kr/1360000/VilageFcstMsgService/getWthrWrnInfo';
// 날씨누리 특보(종합) 페이지가 화면에 삽입하는 공식 특보 표 HTML 조각입니다.
// https://www.weather.go.kr/w/special-report/overall.do
const KMA_WARNING_HTML_URL = 'https://www.weather.go.kr/w/wnuri-fct2021/weather/warning.do';

function sendJson(res, status, body) {
  if (typeof res.status === 'function') return res.status(status).json(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getQuery(req) {
  if (req.query) return req.query;
  const url = new URL(req.url || '/', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function getEnv(name, fallback = '') {
  const value = process.env[name];
  return value == null ? fallback : String(value).trim();
}

function encodeServiceKey(serviceKey = '') {
  const key = String(serviceKey).trim();
  return key.includes('%') ? key : encodeURIComponent(key);
}

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeHtml(value = '') {
  return decodeXml(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&#44;/g, ',');
}

function normalizeText(value = '') {
  return String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value = '') {
  return normalizeText(decodeHtml(String(value).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}

function pickTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? normalizeText(decodeXml(match[1])) : '';
}

function extractAllTags(block) {
  const item = {};
  const tagPattern = /<([A-Za-z0-9_:-]+)[^>]*>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = tagPattern.exec(block))) {
    const [, tag, raw] = match;
    if (/<[A-Za-z0-9_:-]+[^>]*>/.test(raw)) continue;
    item[tag] = normalizeText(decodeXml(raw));
  }
  return item;
}

function extractItems(xml) {
  const blocks = String(xml).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
  return blocks.map(extractAllTags).filter((item) => Object.keys(item).length > 0);
}

function isNone(value = '') {
  const text = normalizeText(value).replace(/\s/g, '').toLowerCase();
  return !text || ['없음', 'o없음', '○없음', '해당없음', '-', 'null', 'undefined'].includes(text);
}

function isGenericWarningNotice(value = '') {
  const text = normalizeText(value);
  return text.includes('특보 및 예비특보 발표현황은') || text.includes('weather.go.kr') || text.includes('기상청 홈페이지');
}

function shorten(value = '', max = 180) {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isYeosuIncludedArea(text = '') {
  const value = normalizeText(text).replace(/\s/g, '');

  // 날씨누리는 전남 전체가 아닌 경우에도
  // "전라남도(무안군북부)"처럼 광역지자체명을 함께 표시합니다.
  // 따라서 '전라남도' 또는 '제외' 문구로 추론하지 않고,
  // 여수시(별도 특보구역인 거문도·초도 포함)가 명시된 행만 선택합니다.
  return value.includes('여수시') || /\uAC70\uBB38\uB3C4[.·ㆍ]\uCD08\uB3C4/.test(value);
}

function includesTargetArea(item, regId) {
  const joined = Object.values(item).join(' ');
  return isYeosuIncludedArea(joined) || joined.includes(regId) || joined.includes('46130');
}

function makeDisplayText(items = [], regId = DEFAULT_REG_ID) {
  if (!items.length) return EMPTY_WARNING_TEXT;

  const targetItems = items.filter((item) => includesTargetArea(item, regId));
  if (!targetItems.length) return EMPTY_WARNING_TEXT;

  const texts = [];
  for (const item of targetItems) {
    const candidates = [
      item.wrnMsg,
      item.warningMsg,
      item.wn,
      item.wr,
      item.title,
      item.contents,
      item.content,
      item.wfSv1,
      item.t1,
      item.t2
    ];

    for (const value of candidates) {
      if (!isNone(value) && !isGenericWarningNotice(value)) texts.push(value);
    }
  }

  const unique = [...new Set(texts.map(normalizeText).filter(Boolean))];
  return unique.length ? shorten(unique.join(' '), 220) : EMPTY_WARNING_TEXT;
}

async function fetchWarning(query, serviceKey) {
  const regId = query.regId || getEnv('WARNING_REG_ID', DEFAULT_REG_ID);
  const params = new URLSearchParams();
  params.set('pageNo', query.pageNo || getEnv('WARNING_PAGE', '1'));
  params.set('numOfRows', query.numOfRows || getEnv('WARNING_ROWS', '100'));
  params.set('dataType', query.dataType || getEnv('WARNING_DATA_TYPE', 'XML'));
  params.set('regId', regId);

  // serviceKey는 URLSearchParams에 넣으면 %가 다시 %25로 바뀌는 경우가 있어
  // 예보 API와 동일하게 직접 붙입니다.
  const apiRes = await fetch(`${WARNING_URL}?serviceKey=${encodeServiceKey(serviceKey)}&${params.toString()}`);
  const text = await apiRes.text();
  const resultCode = pickTag(text, 'resultCode') || pickTag(text, 'returnAuthMsg');
  const resultMsg = pickTag(text, 'resultMsg') || pickTag(text, 'returnReasonCode');
  const items = extractItems(text);
  const ok = apiRes.ok && (!resultCode || resultCode === '00' || resultCode === '0');

  return { ok, status: apiRes.status, resultCode, resultMsg, items, regId };
}

function extractAnnouncementTime(html = '') {
  const match = String(html).match(/발표시각\s*<\/strong>\s*:\s*([^<]+)/i);
  return match ? stripTags(match[1]) : '';
}

function extractWeatherNuriRows(html = '') {
  const rows = [];
  const rowPattern = /<tr[^>]*data-type="([^"]+)"[^>]*data-level="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(String(html)))) {
    const cells = Array.from(rowMatch[3].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) => stripTags(cell[1]));
    if (cells.length < 5) continue;
    const [kind, level, area, announcedAt, effectiveAt, clearText = ''] = cells;
    if (!kind || !level || !area) continue;
    rows.push({ kind, level, area, announcedAt, effectiveAt, clearText });
  }

  return rows;
}

function makeWeatherNuriDisplayText(rows = []) {
  const targetRows = rows.filter((row) => isYeosuIncludedArea(row.area));
  if (!targetRows.length) return EMPTY_WARNING_TEXT;

  const byWarning = new Map();
  for (const row of targetRows) {
    const key = `${row.kind}${row.level}`;
    if (!byWarning.has(key)) {
      byWarning.set(key, `${row.kind}${row.level} : 여수시`);
    }
  }

  return shorten(Array.from(byWarning.values()).join('  ·  '), 260);
}

async function fetchWeatherNuriWarning() {
  const response = await fetch(KMA_WARNING_HTML_URL);
  const html = await response.text();
  if (!response.ok) throw new Error(`날씨누리 특보 조회 실패(${response.status})`);

  const rows = extractWeatherNuriRows(html);
  const displayText = makeWeatherNuriDisplayText(rows);
  return {
    ok: displayText !== EMPTY_WARNING_TEXT,
    displayText,
    time: extractAnnouncementTime(html),
    rows,
    status: response.status
  };
}

export default async function handler(req, res) {
  const query = getQuery(req);
  const serviceKey = getEnv('KMA_SERVICE_KEY', getEnv('VITE_KMA_SERVICE_KEY'));
  const regId = query.regId || getEnv('WARNING_REG_ID', DEFAULT_REG_ID);

  if (!serviceKey || serviceKey.includes('여기에_공공데이터포털_인증키')) {
    return sendJson(res, 200, {
      ok: false,
      resultCode: 'NO_SERVICE_KEY',
      resultMsg: '공공데이터포털 인증키 없음',
      message: '특보 조회를 하려면 .env의 KMA_SERVICE_KEY에 공공데이터포털 인증키를 입력하세요.',
      displayText: EMPTY_WARNING_TEXT,
      regId,
      items: []
    });
  }

  try {
    const result = await fetchWarning(query, serviceKey);
    if (!result.ok) {
      const fallback = await fetchWeatherNuriWarning();
      return sendJson(res, 200, {
        ok: fallback.ok,
        resultCode: result.resultCode,
        resultMsg: result.resultMsg,
        message: fallback.ok ? '날씨누리 기상특보 조회 성공' : '현재 여수시에 발표된 특보가 없습니다.',
        displayText: fallback.displayText,
        time: fallback.time,
        regId,
        source: '기상청 날씨누리 특보 현황',
        items: fallback.rows,
        status: fallback.status,
        fallbackFrom: '공공데이터포털 VilageFcstMsgService/getWthrWrnInfo'
      });
    }

    const displayText = makeDisplayText(result.items, regId);
    return sendJson(res, 200, {
      ok: true,
      resultCode: result.resultCode || '00',
      resultMsg: result.resultMsg || 'NORMAL_SERVICE',
      message: displayText === EMPTY_WARNING_TEXT ? '현재 여수시에 발표된 특보가 없습니다.' : '기상특보 조회 성공',
      displayText,
      time: result.items[0]?.tmFc || result.items[0]?.tmEf || result.items[0]?.announceTime || '',
      regId,
      source: '공공데이터포털 VilageFcstMsgService/getWthrWrnInfo',
      items: result.items,
      status: result.status
    });
  } catch (error) {
    try {
      const fallback = await fetchWeatherNuriWarning();
      return sendJson(res, 200, {
        ok: fallback.ok,
        message: fallback.ok ? '날씨누리 기상특보 조회 성공' : '현재 여수시에 발표된 특보가 없습니다.',
        displayText: fallback.displayText,
        time: fallback.time,
        regId,
        source: '기상청 날씨누리 특보 현황',
        items: fallback.rows,
        errors: [error.message]
      });
    } catch (fallbackError) {
      return sendJson(res, 200, {
        ok: false,
        message: '기상특보 API를 조회하지 못했습니다.',
        displayText: EMPTY_WARNING_TEXT,
        regId,
        items: [],
        errors: [error.message, fallbackError.message]
      });
    }
  }
}
