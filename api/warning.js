const DEFAULT_REG_ID = '4613000000'; // 전남 여수시 행정구역 코드
const EMPTY_WARNING_TEXT = '내용없음';
const WARNING_URL = 'https://apis.data.go.kr/1360000/VilageFcstMsgService/getWthrWrnInfo';
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
  const value = normalizeText(text);
  if (value.includes('여수')) return true;
  if (!value.includes('전라남도')) return false;

  // "전라남도(흑산도.홍도, 거문도.초도, 완도여서도 제외)"처럼
  // 제외 지역만 괄호에 표기된 경우 여수시는 전라남도 전체 대상에 포함됩니다.
  return value.includes('제외') && !value.includes('여수 제외') && !value.includes('여수시 제외');
}

function includesTargetArea(item, regId) {
  const joined = Object.values(item).join(' ');
  return joined.includes('여수') || joined.includes(regId) || joined.includes('46130') || joined.includes('전라남도');
}

function makeDisplayText(items = [], regId = DEFAULT_REG_ID) {
  if (!items.length) return EMPTY_WARNING_TEXT;

  const targetItems = items.filter((item) => includesTargetArea(item, regId));
  const pool = targetItems.length ? targetItems : items;

  const texts = [];
  for (const item of pool) {
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
      const area = row.area.includes('여수')
        ? '여수시'
        : row.area.includes('전라남도')
          ? '여수시 포함 전라남도'
          : row.area;
      byWarning.set(key, `${row.kind}${row.level} : ${area}`);
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
