import { venueData } from '../data/venues.js';
import { dateMetaFromYmd, getCurrentTab, getCurrentVenueId, setCurrentTab, setCurrentVenueId, skyCell, skyEmoji, waveEmoji } from './common.js';
import * as api from '../api/client.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const liveForecast = {
  ultra: {},
  midterm: {},
  marine: {},
  combined: {}
};

function renderLoading(message) {
  const body = document.getElementById('fmBody');
  if (body) body.innerHTML = `<div class="fm-note" style="padding:18px;">${message}</div>`;
}

function renderError(message) {
  const body = document.getElementById('fmBody');
  if (body) body.innerHTML = `<div class="fm-note" style="padding:18px;color:#b42318;">${message}</div>`;
}

function getRows(currentVenueId, currentTab) {
  // 초단기예보와 중기예보는 실제 API 결과만 표시합니다.
  // API 실패 시 샘플 예보로 바꾸지 않습니다.
  if (currentTab === 'ultra' || currentTab === 'midterm' || currentTab === 'marine' || currentTab === 'combined') {
    return liveForecast[currentTab]?.[currentVenueId] || [];
  }
  return [];
}

function daySubLabel(ymd) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = Number(String(ymd).slice(0, 4));
  const m = Number(String(ymd).slice(4, 6)) - 1;
  const d = Number(String(ymd).slice(6, 8));
  const target = new Date(y, m, d);
  const diff = Math.round((target - start) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  return '';
}

function formatTmFc(tmFc = '') {
  const text = String(tmFc);
  if (!/^\d{12}$/.test(text)) return '';
  const y = Number(text.slice(0, 4));
  const m = Number(text.slice(4, 6));
  const d = Number(text.slice(6, 8));
  const hh = text.slice(8, 10);
  const mm = text.slice(10, 12);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${String(m).padStart(2, '0')}월 ${String(d).padStart(2, '0')}일 (${dow})요일 ${hh}:${mm}`;
}

function renderCombinedForecast(data, venue) {
  const midtermByDate = new Map((data.midterm || []).map((row) => [row.date, row]));
  const marineRows = data.marine || [];
  const displayDates = (data.midterm || []).slice(0, 3).map((row) => row.date);
  const midRows = displayDates.map((date) => midtermByDate.get(date) || { date });
  const marineByDate = new Map(marineRows.map((row) => [row.date, row]));
  const alignedMarineRows = displayDates.map((date) => marineByDate.get(date) || { date });
  const weatherColspan = Math.max(displayDates.length * 2, 1);
  const marineColspan = Math.max(displayDates.length * 2, 1);
  const announced = formatTmFc(data.tmFc || data.midSeaTmFc);
  const weatherHeader = displayDates.map((date) => {
    const meta = dateMetaFromYmd(date);
    const sub = daySubLabel(date);
    return `<th colspan="2" class="${meta.dowClass}">
      <div class="combo-date-main">${meta.dateLabel.replace('/', '월 ')}일(${meta.dowLabel})</div>
      ${sub ? `<div class="combo-date-sub">${sub}</div>` : ''}
    </th>`;
  }).join('');
  const marineHeader = displayDates.map((date) => {
    const meta = dateMetaFromYmd(date);
    return `<th colspan="2" class="${meta.dowClass}">${meta.dateLabel.replace('/', '월 ')}일(${meta.dowLabel})</th>`;
  }).join('');

  const weatherEmpty = `<tr><td colspan="${weatherColspan + 1}">단기예보 조회 결과가 없습니다.</td></tr>`;
  const marineEmpty = `<tr><td colspan="${marineColspan + 2}">단기해양예보 조회 결과가 없습니다.</td></tr>`;

  const weatherTable = displayDates.length ? `<table class="combo-table weather-table">
    <thead>
      <tr><th rowspan="2" class="side-head">날짜<br/>시각</th>${weatherHeader}</tr>
      <tr>${displayDates.map(() => '<th>오전</th><th>오후</th>').join('')}</tr>
    </thead>
    <tbody>
      <tr><th>날씨</th>${midRows.map((r) => `
        <td><div class="combo-icon">${skyEmoji(r.am)}</div><div class="combo-label">${escapeHtml(r.am ?? '-')}</div></td>
        <td><div class="combo-icon">${skyEmoji(r.pm)}</div><div class="combo-label">${escapeHtml(r.pm ?? '-')}</div></td>
      `).join('')}</tr>
      <tr><th>기온</th>${midRows.map((r) => `
        <td class="temp-min">${r.min ?? '-'}℃</td>
        <td class="temp-max">${r.max ?? '-'}℃</td>
      `).join('')}</tr>
      <tr><th>강수확률</th>${midRows.map((r) => `
        <td>${r.rnAm ?? '-'}%</td>
        <td>${r.rnPm ?? '-'}%</td>
      `).join('')}</tr>
    </tbody>
  </table>` : `<table class="combo-table weather-table"><tbody>${weatherEmpty}</tbody></table>`;

  const marineTable = displayDates.length ? `<table class="combo-table marine-table">
    <thead>
      <tr><th rowspan="2" colspan="2" class="side-head">지역</th>${marineHeader}</tr>
      <tr>${displayDates.map(() => '<th>오전</th><th>오후</th>').join('')}</tr>
    </thead>
    <tbody>
      <tr>
        <th rowspan="2">남해서부</th>
        <th>날씨</th>
        ${alignedMarineRows.map((r) => `
          <td><div class="combo-icon">${skyEmoji(r.am)}</div><div class="combo-label">${escapeHtml(r.am ?? '-')}</div></td>
          <td><div class="combo-icon">${skyEmoji(r.pm)}</div><div class="combo-label">${escapeHtml(r.pm ?? '-')}</div></td>
        `).join('')}
      </tr>
      <tr>
        <th>파고(m)</th>
        ${alignedMarineRows.map((r) => `
          <td>${escapeHtml(String(r.waveAm ?? '-').replace(/m$/, ''))}</td>
          <td>${escapeHtml(String(r.wavePm ?? '-').replace(/m$/, ''))}</td>
        `).join('')}
      </tr>
    </tbody>
  </table>` : `<table class="combo-table marine-table"><tbody>${marineEmpty}</tbody></table>`;

  return `<div class="combo-forecast">
    ${announced ? `<div class="combo-issued"><b>발표시간:</b> ${announced}</div>` : ''}
    <section class="combo-section">${weatherTable}</section>
    <section class="combo-section">${marineTable}</section>
    <div class="fm-note">날씨예보: ${venue.place} 격자 nx ${venue.nx}, ny ${venue.ny} · 해양예보: 기상청 단기예보 파고(WAV) 기준</div>
  </div>`;
}

export function renderForecastTable(){
  const currentVenueId = getCurrentVenueId();
  const currentTab = getCurrentTab();
  const rows = getRows(currentVenueId, currentTab);
  const body = document.getElementById('fmBody');
  const venue = venueData[currentVenueId];
  let html = '';

  if (!body) return;

  if (currentTab === 'ultra') {
    const rowHtml = rows.length
      ? rows.map(r => `<tr>
          <td>${r.time}</td>
          <td>${skyCell(r.sky)}</td>
          <td>🌡️ ${r.temp ?? r.max ?? '-'}℃</td>
          <td>${r.precip || '강수없음'}<br/>습도 ${r.humidity ?? '-'}%</td>
        </tr>`).join('')
      : `<tr><td colspan="4">초단기예보 조회 결과가 없습니다.</td></tr>`;
    html = `<table class="fm-table"><thead><tr><th>시각</th><th>날씨</th><th>기온</th><th>강수/습도</th></tr></thead><tbody>` +
      rowHtml +
      `</tbody></table><div class="fm-note">기상청 초단기예보 기준 · 격자 nx ${venue.nx}, ny ${venue.ny}</div>`;
  } else if (currentTab === 'combined') {
    html = renderCombinedForecast(rows, venue);
  } else if (currentTab === 'midterm') {
    const summaryRow = rows.find(r => r.summary);
    const dayRows = rows.filter(r => !r.summary);

    const summaryHtml = summaryRow
      ? `<div class="mid-summary">${escapeHtml(summaryRow.summary).replace(/\n/g, '<br/>')}</div>`
      : '';

    const listHtml = dayRows.length
      ? dayRows.map((r) => {
          const meta = dateMetaFromYmd(r.date);
          return `<div class="mid-row">
            <div class="mid-date">
              <div class="mid-date-main ${meta.dowClass}">${meta.dateLabel}</div>
              <div class="mid-date-dow ${meta.dowClass}">${meta.dowLabel}</div>
            </div>
            <div class="mid-ampm">
              <div class="mid-ampm-col">
                <span class="mid-ampm-tag">오전</span>
                <span class="mid-icon">${skyEmoji(r.am)}</span>
                <span class="mid-wx">${r.am ?? '-'}</span>
              </div>
              <div class="mid-ampm-col">
                <span class="mid-ampm-tag">오후</span>
                <span class="mid-icon">${skyEmoji(r.pm)}</span>
                <span class="mid-wx">${r.pm ?? '-'}</span>
              </div>
            </div>
            <div class="mid-temp">
              <span class="mid-temp-min">${r.min ?? '-'}°</span>
              <span class="mid-temp-max">${r.max ?? '-'}°</span>
            </div>
            <div class="mid-rain">
              <span>☔${r.rnAm ?? '-'}%</span>
              <span>☔${r.rnPm ?? '-'}%</span>
            </div>
          </div>`;
        }).join('')
      : `<div class="fm-note" style="padding:18px;">단기예보 조회 결과가 없습니다.</div>`;

    html = summaryHtml +
      `<div class="mid-list">${listHtml}</div>` +
      `<div class="fm-note">기상청 중기육상예보 getMidLandFcst(11F20000) + 중기기온 getMidTa(여수 11F20401) 기준</div>`;
  } else {
    const rowHtml = rows.length
      ? rows.map(r => `<tr>
          <td>${dateMetaFromYmd(r.date).dateLabel}<br/>${dateMetaFromYmd(r.date).dowLabel}</td>
          <td><div class="wx-emoji">${skyEmoji(r.am)}</div><div class="wx-label">${escapeHtml(r.am ?? '-')}</div></td>
          <td><div class="wx-emoji">${skyEmoji(r.pm)}</div><div class="wx-label">${escapeHtml(r.pm ?? '-')}</div></td>
          <td><div class="wx-emoji">${waveEmoji(r.waveAm)}</div><div class="wx-label">${escapeHtml(r.waveAm ?? '-')}</div></td>
          <td><div class="wx-emoji">${waveEmoji(r.wavePm)}</div><div class="wx-label">${escapeHtml(r.wavePm ?? '-')}</div></td>
        </tr>`).join('')
      : `<tr><td colspan="5">단기해양예보 조회 결과가 없습니다.</td></tr>`;
    html = `<table class="fm-table"><thead><tr><th>예보일</th><th>오전 날씨</th><th>오후 날씨</th><th>오전 파고</th><th>오후 파고</th></tr></thead><tbody>` +
      rowHtml +
      `</tbody></table><div class="fm-note">기상청 단기예보 getVilageFcst 파고(WAV) 기준 · 격자 nx ${venue.nx}, ny ${venue.ny}</div>`;
  }
  body.innerHTML = html;
}

async function loadTabData(tab, venueId) {
  if (liveForecast[tab]?.[venueId]) {
    renderForecastTable();
    return;
  }

  renderLoading(tab === 'combined' ? '단기 · 해양 날씨를 불러오는 중입니다.' : (tab === 'midterm' ? '단기예보를 불러오는 중입니다.' : (tab === 'marine' ? '단기해양예보를 불러오는 중입니다.' : '초단기예보를 불러오는 중입니다.')));
  try {
    if (tab === 'combined') {
      const [midData, marineData] = await Promise.all([
        api.getWeather({ type: 'midterm', venueId }),
        api.getWeather({ type: 'marine', venueId })
      ]);
      const midItem = midData.items?.[0] || {};
      const marineItem = marineData.items?.[0] || {};
      if (!midData.ok) console.warn(midData.message || '단기예보 API 응답 오류');
      if (!marineData.ok) console.warn(marineData.message || '해양예보 API 응답 오류');
      liveForecast.combined[venueId] = {
        midterm: midItem.midterm || [],
        marine: marineItem.marine || [],
        tmFc: midItem.tmFc,
        marineBase: marineItem.marineBase
      };
      renderForecastTable();
      return;
    }

    const data = await api.getWeather({ type: tab === 'midterm' ? 'midterm' : (tab === 'marine' ? 'marine' : 'ultra'), venueId });
    const item = data.items?.[0];
    if (!data.ok) console.warn(data.message || 'API 응답 오류');
    if (item?.errors?.length) console.warn('상세 예보 일부 조회 오류:', item.errors);
    if (tab === 'midterm') liveForecast.midterm[venueId] = item?.midterm || [];
    else if (tab === 'marine') liveForecast.marine[venueId] = item?.marine || [];
    else liveForecast.ultra[venueId] = item?.ultra || [];
    renderForecastTable();
  } catch (error) {
    console.error('상세 예보 조회 실패:', error);
    renderError(`${error.message}<br/>실제 기상청 데이터를 불러오지 못해 표시는 비워두었습니다.`);
  }
}

export function openForecastModal(id){
  setCurrentVenueId(id);
  setCurrentTab('ultra');
  const v = venueData[id];
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('fmTitle').textContent = `${v.name} (${v.place})`;
  document.getElementById('fmSub').textContent = `초단기 격자 ${v.nx},${v.ny} · 단기예보 여수 ${v.stnId} · ${hh}:${mi} 조회`;
  document.querySelectorAll('.fm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'ultra'));
  document.getElementById('forecastModal').style.display = 'flex';
  loadTabData('ultra', id);
}
export function closeForecastModal(){
  document.getElementById('forecastModal').style.display = 'none';
}

export function initForecastModal(){
  window.openForecastModal = openForecastModal;
  window.closeForecastModal = closeForecastModal;
  document.querySelectorAll('.fm-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      setCurrentTab(tab.dataset.tab);
      document.querySelectorAll('.fm-tab').forEach(t => t.classList.toggle('active', t === tab));
      loadTabData(tab.dataset.tab, getCurrentVenueId());
    });
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') closeForecastModal();
  });
}
