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
  marine: {}
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
  if (currentTab === 'ultra' || currentTab === 'midterm' || currentTab === 'marine') {
    return liveForecast[currentTab]?.[currentVenueId] || [];
  }
  return [];
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
      : `<div class="fm-note" style="padding:18px;">중기예보 조회 결과가 없습니다.</div>`;

    html = summaryHtml +
      `<div class="mid-list">${listHtml}</div>` +
      `<div class="fm-note">기상청 중기육상예보 getMidLandFcst(11F20000) + 중기기온 getMidTa(여수 11F20401) 기준</div>`;
  } else {
    const rowHtml = rows.length
      ? rows.map(r => `<tr>
          <td>${r.time}</td>
          <td>${escapeHtml(r.station ?? '-')}</td>
          <td><div class="wx-emoji">${waveEmoji(r.wave)}</div><div class="wx-label">${r.wave}</div></td>
          <td>💨 ${r.wind}</td>
          <td>🌡️ ${r.seaTemp}</td>
          <td>${r.airTemp ?? '-'}</td>
          <td>${r.humidity ?? '-'}</td>
        </tr>`).join('')
      : `<tr><td colspan="7">해양관측 조회 결과가 없습니다.</td></tr>`;
    html = `<table class="fm-table"><thead><tr><th>관측시각</th><th>지점</th><th>유의파고</th><th>풍속</th><th>수온</th><th>기온</th><th>습도</th></tr></thead><tbody>` +
      rowHtml +
      `</tbody></table><div class="fm-note">기상청 APIHub 해양관측자료 sea_obs 기준 · 인증키는 서버 환경변수에서만 사용합니다.</div>`;
  }
  body.innerHTML = html;
}

async function loadTabData(tab, venueId) {
  if (liveForecast[tab]?.[venueId]) {
    renderForecastTable();
    return;
  }

  renderLoading(tab === 'midterm' ? '중기예보를 불러오는 중입니다.' : (tab === 'marine' ? '해양관측자료를 불러오는 중입니다.' : '초단기예보를 불러오는 중입니다.'));
  try {
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
  document.getElementById('fmSub').textContent = `초단기 격자 ${v.nx},${v.ny} · 중기예보 여수 ${v.stnId} · ${hh}:${mi} 조회`;
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
