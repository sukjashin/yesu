// 공공데이터포털 기상청 API 전용 날씨 프록시
// - 초단기실황: VilageFcstInfoService_2.0/getUltraSrtNcst
// - 초단기예보: VilageFcstInfoService_2.0/getUltraSrtFcst
// - 중기예보: MidFcstInfoService/getMidLandFcst + getMidTa
const VILAGE_BASE_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const MID_BASE_URL = 'http://apis.data.go.kr/1360000/MidFcstInfoService';
const APIHUB_SEA_OBS_URL = 'https://apihub.kma.go.kr/api/typ01/url/sea_obs.php';

const MID_LAND_REG_ID = '11F20000'; // 광주·전라남도(중기육상예보 공통 지역코드)
const MID_TEMP_REG_ID = '11F20401'; // 여수(중기기온 지역코드) - 기상청 getMidTa가 인식하는 정식 코드

const VENUES = {
  1: { id: 1, name: '주행사장', place: '돌산 진모지구', nx: '75', ny: '65', stnId: MID_TEMP_REG_ID, midLandRegId: MID_LAND_REG_ID, midTempRegId: MID_TEMP_REG_ID, awsName: '여수' },
  2: { id: 2, name: '부행사장', place: '개도', nx: '74', ny: '61', stnId: MID_TEMP_REG_ID, midLandRegId: MID_LAND_REG_ID, midTempRegId: MID_TEMP_REG_ID, awsName: '여수' },
  3: { id: 3, name: '부행사장', place: '금오도', nx: '74', ny: '61', stnId: MID_TEMP_REG_ID, midLandRegId: MID_LAND_REG_ID, midTempRegId: MID_TEMP_REG_ID, awsName: '여수' }
};

const MARINE_STATION_ID = '22103'; // 거문도: 여수 해상 관측 기준 지점

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

function pad(value) { return String(value).padStart(2, '0'); }
function kstNow() { return new Date(Date.now() + 9 * 60 * 60 * 1000); }
function formatDateKst(date) { return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`; }

function getUltraNcstBase(now = kstNow(), backHours = 0) {
  const base = new Date(now.getTime());
  // 실황은 HH00 자료가 HH40 전후부터 안정적으로 조회됩니다.
  if (base.getUTCMinutes() < 40) base.setUTCHours(base.getUTCHours() - 1);
  base.setUTCHours(base.getUTCHours() - backHours);
  base.setUTCMinutes(0, 0, 0);
  return { baseDate: formatDateKst(base), baseTime: `${pad(base.getUTCHours())}00` };
}

function getUltraFcstBase(now = kstNow(), backHours = 0) {
  const base = new Date(now.getTime());
  // 초단기예보는 HH30 자료를 사용합니다. 45분 전에는 직전 시각 자료가 안전합니다.
  if (base.getUTCMinutes() < 45) base.setUTCHours(base.getUTCHours() - 1);
  base.setUTCHours(base.getUTCHours() - backHours);
  base.setUTCMinutes(30, 0, 0);
  return { baseDate: formatDateKst(base), baseTime: `${pad(base.getUTCHours())}30` };
}

function getMidTmFc(now = kstNow()) {
  const base = new Date(now.getTime());
  const hour = base.getUTCHours();
  // 중기예보는 06시, 18시 발표입니다. 발표 직후 생성 지연을 고려해 아래 함수에서 이전 발표도 재조회합니다.
  if (hour < 6) {
    base.setUTCDate(base.getUTCDate() - 1);
    return `${formatDateKst(base)}1800`;
  }
  if (hour < 18) return `${formatDateKst(base)}0600`;
  return `${formatDateKst(base)}1800`;
}

// 단기예보(getVilageFcst) 발표시각: 02,05,08,11,14,17,20,23시 (각 10~15분 후 제공)
const VILAGE_FCST_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
function getVilageFcstBase(now = kstNow(), backSlots = 0) {
  const base = new Date(now.getTime());
  const hour = base.getUTCHours();
  const minute = base.getUTCMinutes();
  let idx = 0;
  for (let i = 0; i < VILAGE_FCST_HOURS.length; i += 1) {
    const h = VILAGE_FCST_HOURS[i];
    if (hour > h || (hour === h && minute >= 15)) idx = i;
  }
  let target = idx - backSlots;
  let dayOffset = 0;
  while (target < 0) {
    target += VILAGE_FCST_HOURS.length;
    dayOffset -= 1;
  }
  if (dayOffset !== 0) base.setUTCDate(base.getUTCDate() + dayOffset);
  return { baseDate: formatDateKst(base), baseTime: `${pad(VILAGE_FCST_HOURS[target])}00` };
}

function ymdAddDays(ymd, days) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)) - 1, d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDateKst(dt);
}

function normalizeItems(data) {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function formatTmKst(date = kstNow()) {
  return `${formatDateKst(date)}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function getSeaObsTimes(now = kstNow()) {
  const base = new Date(now.getTime());
  base.setUTCMinutes(0, 0, 0);
  const times = [];
  for (let back = 0; back <= 6; back += 1) {
    const t = new Date(base.getTime() - back * 60 * 60 * 1000);
    times.push(formatTmKst(t));
  }
  return times;
}

function valueOrDash(value, suffix = '') {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || (Number.isFinite(n) && n <= -9)) return '-';
  return suffix ? `${value}${suffix}` : String(value);
}

function windDirKo(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  const dirs = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  return dirs[Math.round((n % 360) / 22.5) % 16];
}

function parseSeaObsText(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let headers = null;
  const rows = [];
  const csvHeaders = ['TP', 'TM', 'STN_ID', 'STN_KO', 'LON', 'LAT', 'WH', 'WD', 'WS', 'WS_GST', 'TW', 'TA', 'PA', 'HM'];
  const fallbackHeaders = ['TM', 'STN_ID', 'STN_KO', 'WH', 'WD', 'WS', 'WS_GST', 'TW', 'TA', 'PA', 'HM'];

  for (const line of lines) {
    const clean = line.replace(/^#\s?/, '').trim();
    if (!headers && clean.includes('STN_ID') && clean.includes('STN_KO') && clean.includes('TM')) {
      headers = clean.split(/\s+/);
      continue;
    }
    if (line.startsWith('#') || /^[-=]+$/.test(clean) || /^START|^END/i.test(clean)) continue;

    const isCsv = clean.includes(',');
    const parts = isCsv
      ? clean.split(',').map((part) => part.trim()).filter((part) => part !== '' && part !== '=')
      : clean.split(/\s+/);
    const names = isCsv ? csvHeaders : (headers && parts.length >= headers.length ? headers : fallbackHeaders);
    if (parts.length < 4 || (!/^\d{10,12}$/.test(parts[0]) && !/^\d{10,12}$/.test(parts[1]))) continue;

    const item = {};
    names.forEach((name, idx) => { item[name] = parts[idx]; });
    rows.push(item);
  }
  return rows;
}

function formatSeaObsTime(tm = '') {
  const text = String(tm);
  if (!/^\d{10,12}$/.test(text)) return text || '-';
  return `${text.slice(4, 6)}/${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12) || '00'}`;
}

function mapSeaObsRow(row) {
  const windDir = windDirKo(row.WD);
  return {
    stationId: row.STN_ID || row.STN || '',
    station: row.STN_KO || '-',
    time: formatSeaObsTime(row.TM),
    wave: valueOrDash(row.WH, 'm'),
    wind: `${valueOrDash(row.WS, 'm/s')}${windDir ? ` (${windDir})` : ''}`,
    gust: valueOrDash(row.WS_GST, 'm/s'),
    seaTemp: valueOrDash(row.TW, '°C'),
    airTemp: valueOrDash(row.TA, '°C'),
    humidity: valueOrDash(row.HM, '%'),
    pressure: valueOrDash(row.PA, 'hPa')
  };
}

function pickMarineRows(rows) {
  return rows
    .map(mapSeaObsRow)
    .filter((row) => row.stationId === MARINE_STATION_ID || row.station.includes('거문도'))
    .slice(0, 1);
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

function pickTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).replace(/\s+/g, ' ').trim() : '';
}

async function callKma(url, params, serviceKey) {
  const qs = new URLSearchParams({ ...params, dataType: 'JSON' });
  const fullUrl = `${url}?serviceKey=${encodeServiceKey(serviceKey)}&${qs.toString()}`;
  const apiRes = await fetch(fullUrl);
  const text = await apiRes.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    const resultCode = pickTag(text, 'resultCode') || pickTag(text, 'returnAuthMsg');
    const resultMsg = pickTag(text, 'resultMsg') || pickTag(text, 'returnReasonCode') || text.slice(0, 180);
    throw new Error(`기상청 API XML 오류: ${resultCode ? resultCode + ' ' : ''}${resultMsg}`);
  }

  const header = data?.response?.header || {};
  const resultCode = String(header.resultCode ?? '');
  const ok = apiRes.ok && (resultCode === '00' || resultCode === '0' || resultCode === '');
  if (!ok) {
    const err = new Error(header.resultMsg || `기상청 API 응답 오류(${apiRes.status})`);
    err.resultCode = resultCode;
    throw err;
  }
  return data;
}

async function callSeaObs(authKey, tm) {
  const qs = new URLSearchParams({ tm, stn: MARINE_STATION_ID, help: '0', authKey: String(authKey).trim() });
  const apiRes = await fetch(`${APIHUB_SEA_OBS_URL}?${qs.toString()}`);
  const text = new TextDecoder('euc-kr').decode(await apiRes.arrayBuffer());
  if (!apiRes.ok) throw new Error(`APIHub 해양관측 응답 오류(${apiRes.status})`);
  if (/ERROR|인증|auth|KEY/i.test(text) && !text.includes('STN_KO')) {
    throw new Error('APIHub 해양관측 인증 또는 조회 오류');
  }
  return parseSeaObsText(text);
}

async function getSeaObsRows(authKey) {
  let lastError;
  for (const tm of getSeaObsTimes()) {
    try {
      const rows = await callSeaObs(authKey, tm);
      if (rows.length) return { tm, rows: pickMarineRows(rows) };
      lastError = new Error(`해양관측 조회 결과 없음(${tm})`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('해양관측 조회 결과가 없습니다.');
}

async function callWithBaseFallback(makeBase, url, commonParams, serviceKey, maxBackHours = 5) {
  let lastError;
  for (let back = 0; back <= maxBackHours; back += 1) {
    const base = makeBase(kstNow(), back);
    try {
      const data = await callKma(url, { ...commonParams, base_date: base.baseDate, base_time: base.baseTime }, serviceKey);
      const items = normalizeItems(data);
      if (items.length) return { data, base, items };
      lastError = new Error(`조회 결과 없음(${base.baseDate} ${base.baseTime})`);
    } catch (error) {
      lastError = error;
      const msg = String(error.message || '');
      if (!msg.includes('NO_DATA') && !msg.includes('NODATA') && !msg.includes('조회된 데이터가 없습니다')) break;
    }
  }
  throw lastError || new Error('기상청 API 조회 결과가 없습니다.');
}

async function callMidBothWithFallback(venue, serviceKey) {
  const now = kstNow();
  const tried = new Set();
  let lastError;

  for (let offsetHours = 0; offsetHours <= 36; offsetHours += 12) {
    const t = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
    const tmFc = getMidTmFc(t);
    if (tried.has(tmFc)) continue;
    tried.add(tmFc);

    try {
      const [landData, tempData] = await Promise.all([
        callKma(`${MID_BASE_URL}/getMidLandFcst`, { pageNo: '1', numOfRows: '10', regId: venue.midLandRegId, tmFc }, serviceKey),
        callKma(`${MID_BASE_URL}/getMidTa`, { pageNo: '1', numOfRows: '10', regId: venue.midTempRegId, tmFc }, serviceKey)
      ]);
      const landItems = normalizeItems(landData);
      const tempItems = normalizeItems(tempData);
      if (landItems.length || tempItems.length) return { tmFc, landItems, tempItems };
      lastError = new Error(`중기예보 조회 결과 없음(${tmFc})`);
    } catch (error) {
      lastError = error;
      const msg = String(error.message || '');
      if (!msg.includes('NO_DATA') && !msg.includes('NODATA') && !msg.includes('조회된 데이터가 없습니다')) break;
    }
  }
  throw lastError || new Error('중기예보 조회 결과가 없습니다.');
}

function skyText(value) {
  return { '1': '맑음', '3': '구름많음', '4': '흐림' }[String(value)] || '정보없음';
}

function ptyText(value) {
  return { '0': '없음', '1': '비', '2': '비/눈', '3': '눈', '5': '빗방울', '6': '빗방울눈날림', '7': '눈날림' }[String(value)] || '없음';
}

function weatherIcon(sky, pty) {
  if (pty && pty !== '없음') return pty.includes('눈') ? '❄️' : '🌧️';
  return { '맑음': '☀️', '구름많음': '⛅', '흐림': '☁️', '실황': '🌡️' }[sky] || '🌡️';
}

// 기상청 여름철 체감온도 공식(Ta: 기온, RH: 습도)
function calcFeelsLike(tempC, humidity) {
  if (tempC === null || tempC === undefined || humidity === null || humidity === undefined) return null;
  const Ta = Number(tempC), RH = Number(humidity);
  if (Number.isNaN(Ta) || Number.isNaN(RH)) return null;
  const Tw = Ta * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
    + Math.atan(Ta + RH) - Math.atan(RH - 1.67633)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
    - 4.686035;
  const feels = -0.2442 + 0.55399 * Tw + 0.45535 * Ta - 0.0022 * Tw * Tw + 0.00278 * Tw * Ta + 3.0;
  return Math.round(feels * 10) / 10;
}

function windDirText(deg) {
  if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return '';
  const dirs = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  const idx = Math.round((Number(deg) % 360) / 22.5) % 16;
  return dirs[idx];
}

function parseNcst(items) {
  const result = { temp: null, humidity: null, wind: null, windDir: null, rain1h: '강수없음', pty: '없음', rnYn: false };
  for (const item of items) {
    const value = item.obsrValue;
    if (item.category === 'T1H') result.temp = Number(value);
    if (item.category === 'REH') result.humidity = Number(value);
    if (item.category === 'WSD') result.wind = Number(value);
    if (item.category === 'VEC') result.windDir = Number(value);
    if (item.category === 'RN1') result.rain1h = value === '0' ? '강수없음' : value;
    if (item.category === 'PTY') result.pty = ptyText(value);
  }
  result.rnYn = result.pty !== '없음' || (result.rain1h && result.rain1h !== '0' && result.rain1h !== '강수없음');
  result.sky = result.rnYn ? result.pty : '실황';
  result.icon = weatherIcon(result.sky, result.pty);
  result.feels = calcFeelsLike(result.temp, result.humidity);
  result.windDirText = windDirText(result.windDir);
  return result;
}

function parseUltraFcst(items) {
  const byTime = new Map();
  for (const item of items) {
    const key = `${item.fcstDate}${item.fcstTime}`;
    if (!byTime.has(key)) byTime.set(key, { date: item.fcstDate, time: item.fcstTime });
    byTime.get(key)[item.category] = item.fcstValue;
  }

  const now = kstNow();
  const nowKey = `${formatDateKst(now)}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

  return Array.from(byTime.values())
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .filter((r) => r.T1H !== undefined || r.SKY !== undefined || r.PTY !== undefined)
    .filter((r) => `${r.date}${r.time}` > nowKey) // 현재 시각 이후(다가올 시각)부터만 표출
    .slice(0, 6)
    .map((r) => {
      const pty = ptyText(r.PTY || '0');
      const sky = pty !== '없음' ? pty : skyText(r.SKY);
      return {
        date: r.date,
        time: `${String(r.time).slice(0, 2)}:${String(r.time).slice(2, 4)}`,
        sky,
        temp: r.T1H ?? '-',
        precip: r.RN1 && r.RN1 !== '0' ? r.RN1 : '강수없음',
        humidity: r.REH ?? '-',
        wind: r.WSD ?? '-',
        icon: weatherIcon(sky, pty)
      };
    });
}

function parseMidForecast(landItems, tempItems, baseYmd = formatDateKst(kstNow())) {
  const land = landItems[0] || {};
  const temp = tempItems[0] || {};
  const result = [];

  for (let day = 3; day <= 10; day += 1) {
    const weatherAm = land[`wf${day}Am`] || land[`wf${day}`] || '-';
    const weatherPm = land[`wf${day}Pm`] || land[`wf${day}`] || weatherAm;
    const rainAm = land[`rnSt${day}Am`] ?? land[`rnSt${day}`] ?? '-';
    const rainPm = land[`rnSt${day}Pm`] ?? land[`rnSt${day}`] ?? rainAm;
    const min = temp[`taMin${day}`] ?? '-';
    const max = temp[`taMax${day}`] ?? '-';

    if (weatherAm !== '-' || weatherPm !== '-' || min !== '-' || max !== '-') {
      result.push({ date: ymdAddDays(baseYmd, day), am: weatherAm, pm: weatherPm, rnAm: rainAm, rnPm: rainPm, min, max });
    }
  }
  return result;
}

// 단기예보(getVilageFcst) 원자료를 날짜별로 묶습니다.
function groupShortFcstByDate(items, todayStr) {
  const byDate = new Map();
  for (const item of items) {
    const date = item.fcstDate;
    if (!date || date <= todayStr) continue; // 오늘은 초단기예보 탭에서 별도로 보여주므로 제외
    if (!byDate.has(date)) byDate.set(date, { TMP: [], SKY: {}, PTY: {}, POP: {}, TMN: null, TMX: null });
    const bucket = byDate.get(date);
    const time = item.fcstTime;
    const value = item.fcstValue;
    if (item.category === 'TMP') bucket.TMP.push(Number(value));
    if (item.category === 'SKY') bucket.SKY[time] = value;
    if (item.category === 'PTY') bucket.PTY[time] = value;
    if (item.category === 'POP') bucket.POP[time] = Number(value);
    if (item.category === 'TMN') bucket.TMN = Number(value);
    if (item.category === 'TMX') bucket.TMX = Number(value);
  }
  return byDate;
}

function pickNearestTime(map, targetHour) {
  const times = Object.keys(map);
  if (!times.length) return null;
  let best = times[0], bestDiff = Infinity;
  for (const t of times) {
    const diff = Math.abs(Number(t.slice(0, 2)) - targetHour);
    if (diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return map[best];
}

function buildShortDayRow(date, bucket) {
  const skyAm = pickNearestTime(bucket.SKY, 9);
  const ptyAm = pickNearestTime(bucket.PTY, 9);
  const skyPm = pickNearestTime(bucket.SKY, 15);
  const ptyPm = pickNearestTime(bucket.PTY, 15);
  const am = (ptyAm && ptyAm !== '0') ? ptyText(ptyAm) : skyText(skyAm);
  const pm = (ptyPm && ptyPm !== '0') ? ptyText(ptyPm) : skyText(skyPm);

  const popEntries = Object.entries(bucket.POP);
  const popAm = popEntries.filter(([t]) => Number(t.slice(0, 2)) < 12).map(([, v]) => v);
  const popPm = popEntries.filter(([t]) => Number(t.slice(0, 2)) >= 12).map(([, v]) => v);
  const allPop = popEntries.map(([, v]) => v);
  const rnAm = popAm.length ? Math.max(...popAm) : (allPop.length ? Math.max(...allPop) : '-');
  const rnPm = popPm.length ? Math.max(...popPm) : (allPop.length ? Math.max(...allPop) : '-');

  const min = bucket.TMN !== null ? bucket.TMN : (bucket.TMP.length ? Math.min(...bucket.TMP) : '-');
  const max = bucket.TMX !== null ? bucket.TMX : (bucket.TMP.length ? Math.max(...bucket.TMP) : '-');

  return { date, am, pm, rnAm, rnPm, min, max };
}

async function getShortForecastRows(venue, serviceKey) {
  const common = { pageNo: '1', numOfRows: '1000', nx: venue.nx, ny: venue.ny };
  const { items } = await callWithBaseFallback(getVilageFcstBase, `${VILAGE_BASE_URL}/getVilageFcst`, common, serviceKey, 4);
  const todayStr = formatDateKst(kstNow());
  const byDate = groupShortFcstByDate(items, todayStr);
  const dates = Array.from(byDate.keys()).sort().slice(0, 2); // 내일, 모레 2일만 사용(중기예보 3일차부터와 중복 방지)
  const thirdDate = Array.from(byDate.keys()).sort()[2];
  if (thirdDate && !dates.includes(thirdDate)) dates.push(thirdDate);
  return dates.map((date) => buildShortDayRow(date, byDate.get(date)));
}

function mergeForecastRows(...rowGroups) {
  const byDate = new Map();
  for (const rows of rowGroups) {
    for (const row of rows) {
      if (!row?.date) continue;
      const existing = byDate.get(row.date);
      byDate.set(row.date, existing ? { ...row, ...existing } : row);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getYesterdayTemp(venue, todayBase, serviceKey) {
  try {
    const y = Number(todayBase.baseDate.slice(0, 4));
    const m = Number(todayBase.baseDate.slice(4, 6)) - 1;
    const d = Number(todayBase.baseDate.slice(6, 8));
    const dt = new Date(Date.UTC(y, m, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yBaseDate = formatDateKst(dt);
    const data = await callKma(`${VILAGE_BASE_URL}/getUltraSrtNcst`, {
      pageNo: '1', numOfRows: '1000', nx: venue.nx, ny: venue.ny,
      base_date: yBaseDate, base_time: todayBase.baseTime
    }, serviceKey);
    const items = normalizeItems(data);
    const t1h = items.find((it) => it.category === 'T1H');
    return t1h ? Number(t1h.obsrValue) : null;
  } catch {
    return null;
  }
}

async function getVenueWeather(venue, serviceKey) {
  const common = { pageNo: '1', numOfRows: '1000', nx: venue.nx, ny: venue.ny };
  const result = { ...venue, current: {}, ultra: [], errors: [] };

  try {
    const ncst = await callWithBaseFallback(getUltraNcstBase, `${VILAGE_BASE_URL}/getUltraSrtNcst`, common, serviceKey);
    result.ncstBase = ncst.base;
    result.current = parseNcst(ncst.items);

    const yesterdayTemp = await getYesterdayTemp(venue, ncst.base, serviceKey);
    if (yesterdayTemp !== null && result.current.temp !== null) {
      result.current.yesterdayTemp = yesterdayTemp;
      result.current.tempDiff = Math.round((result.current.temp - yesterdayTemp) * 10) / 10;
    }
  } catch (error) {
    result.errors.push(`초단기실황: ${error.message}`);
  }

  try {
    const fcst = await callWithBaseFallback(getUltraFcstBase, `${VILAGE_BASE_URL}/getUltraSrtFcst`, common, serviceKey);
    result.fcstBase = fcst.base;
    result.ultra = parseUltraFcst(fcst.items);
  } catch (error) {
    result.errors.push(`초단기예보: ${error.message}`);
  }

  if (!result.ultra.length && !Object.keys(result.current).length) {
    throw new Error(result.errors.join(' / ') || '초단기실황·예보 조회 실패');
  }

  return result;
}

async function getMidForecast(venue, serviceKey) {
  const [mid, shortRows] = await Promise.all([
    callMidBothWithFallback(venue, serviceKey),
    getShortForecastRows(venue, serviceKey).catch((error) => {
      console.warn('단기예보(내일·모레) 조회 실패:', error.message);
      return [];
    })
  ]);
  const midRows = parseMidForecast(mid.landItems, mid.tempItems, mid.tmFc.slice(0, 8));
  const combined = mergeForecastRows(shortRows, midRows);
  return { ...venue, tmFc: mid.tmFc, midterm: combined };
}

export default async function handler(req, res) {
  const serviceKey = process.env.KMA_SERVICE_KEY || process.env.VITE_KMA_SERVICE_KEY;
  const query = getQuery(req);
  const venue = VENUES[query.venueId] || VENUES[query.venue] || null;
  const type = query.type || 'all';

  try {
    if (type === 'marine') {
      const apiHubKey = process.env.KMA_APIHUB_AUTH_KEY || process.env.VITE_KMA_APIHUB_AUTH_KEY;
      if (!apiHubKey || String(apiHubKey).includes('여기에_APIHub_인증키')) {
        return sendJson(res, 200, { ok: false, resultCode: 'NO_APIHUB_KEY', type, items: [], message: 'KMA_APIHUB_AUTH_KEY가 설정되지 않았습니다.' });
      }
      const targets = venue ? [venue] : Object.values(VENUES);
      const sea = await getSeaObsRows(apiHubKey);
      const results = targets.map((target) => ({ ...target, marine: sea.rows, seaObsTm: sea.tm }));
      return sendJson(res, 200, { ok: true, type, items: results, message: 'APIHub 해양관측 조회 성공' });
    }

    if (!serviceKey || String(serviceKey).includes('여기에_공공데이터포털_인증키')) {
      return sendJson(res, 200, { ok: false, resultCode: 'NO_SERVICE_KEY', message: 'KMA_SERVICE_KEY가 설정되지 않았습니다.', venues: VENUES });
    }

    if (type === 'midterm') {
      const targets = venue ? [venue] : Object.values(VENUES);
      const settled = await Promise.allSettled(targets.map((v) => getMidForecast(v, serviceKey)));
      const results = settled.map((r, idx) => (
        r.status === 'fulfilled'
          ? r.value
          : { ...targets[idx], midterm: [], errors: [r.reason?.message || '중기예보 조회 실패'] }
      ));
      const hasData = results.some((item) => item.midterm?.length);
      return sendJson(res, 200, { ok: hasData, type, items: results, message: hasData ? '중기예보 조회 성공' : '중기예보 조회 결과가 없습니다.' });
    }

    if (type === 'ultra' || type === 'current' || type === 'all') {
      const targets = venue ? [venue] : Object.values(VENUES);
      const settled = await Promise.allSettled(targets.map((v) => getVenueWeather(v, serviceKey)));
      const results = settled.map((r, idx) => (
        r.status === 'fulfilled'
          ? r.value
          : { ...targets[idx], current: {}, ultra: [], errors: [r.reason?.message || '초단기실황·예보 조회 실패'] }
      ));
      const hasData = results.some((item) => item.ultra?.length || Object.keys(item.current || {}).length);
      return sendJson(res, 200, { ok: hasData, type, items: results, message: hasData ? '초단기실황·예보 조회 성공' : '초단기실황·예보 조회 결과가 없습니다.' });
    }

    return sendJson(res, 400, { ok: false, message: `지원하지 않는 type입니다: ${type}` });
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: '기상청 API 조회 중 오류가 발생했습니다.', error: error.message });
  }
}
