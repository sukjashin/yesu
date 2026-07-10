let currentVenueId = null;
let currentTab = 'ultra';

export function getCurrentVenueId(){ return currentVenueId; }
export function setCurrentVenueId(id){ currentVenueId = id; }
export function getCurrentTab(){ return currentTab; }
export function setCurrentTab(tab){ currentTab = tab; }

function safe(value, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

// "어제보다 1℃ 높아요/낮아요/같아요" 문구 생성
export function tempDiffText(diff){
  if (diff === null || diff === undefined || Number.isNaN(Number(diff))) return '';
  const n = Number(diff);
  if (n > 0) return `어제보다 ${n}℃ 높아요`;
  if (n < 0) return `어제보다 ${Math.abs(n)}℃ 낮아요`;
  return '어제와 같아요';
}

export function popupHTML(v){
  const diffText = tempDiffText(v.tempDiff);
  return `
    <div class="popup-card">
      <div class="popup-venue"><b>${v.name}</b> (${v.place})</div>
      <div class="popup-time">${safe(v.baseLabel, '')}</div>
      <div class="popup-temp-row">
        <span class="popup-temp-main">${safe(v.temp)}℃</span>
        ${v.feels != null && v.feels !== '' ? `<span class="popup-feels">체감(${v.feels}℃)<span class="popup-feels-icon">🌡️</span></span>` : ''}
      </div>
      ${diffText ? `<div class="popup-delta">${diffText}</div>` : ''}
      <div class="popup-grid">
        <div class="popup-grid-item">
          <span class="pg-icon">💧</span><span class="pg-label">습도</span><span class="pg-value">${safe(v.humidity)}%</span>
        </div>
        <div class="popup-grid-item">
          <span class="pg-icon">💨</span><span class="pg-label">바람</span><span class="pg-value">${safe(v.windDirText,'')} ${safe(v.wind)}m/s</span>
        </div>
        <div class="popup-grid-item">
          <span class="pg-icon">🌧️</span><span class="pg-label">1시간강수량</span><span class="pg-value">${safe(v.rain1h,'mm')}</span>
        </div>
      </div>
      <button class="popup-detail-btn" onclick="openForecastModal(${v.id})">상세보기 ›</button>
    </div>
  `;
}

export function skyEmoji(sky){
  const map = {
    "맑음":"☀️", "구름조금":"🌤️", "구름많음":"⛅", "흐림":"☁️",
    "비":"🌧️", "비/눈":"🌨️", "빗방울":"🌦️", "눈":"❄️", "뇌우":"⛈️", "안개":"🌫️", "실황":"🌡️"
  };
  return map[sky] || "🌡️";
}
export function waveEmoji(waveStr){
  const h = parseFloat(waveStr);
  if (h >= 1.0) return "🌊🌊🌊";
  if (h >= 0.7) return "🌊🌊";
  return "🌊";
}
export function skyCell(sky){
  return `<div class="wx-emoji">${skyEmoji(sky)}</div><div class="wx-label">${sky}</div>`;
}

// 날씨누리 일별예보 스타일 참고 - YYYYMMDD 문자열로 날짜/요일 정보 계산(토요일 파랑, 일요일 빨강)
export function dateMetaFromYmd(ymd){
  const s = String(ymd);
  const y = Number(s.slice(0,4)), m = Number(s.slice(4,6)) - 1, d = Number(s.slice(6,8));
  const date = new Date(y, m, d);
  const dayNames = ['일','월','화','수','목','금','토'];
  const dow = date.getDay();
  const dowClass = dow === 0 ? 'dow-sun' : (dow === 6 ? 'dow-sat' : '');
  return {
    dateLabel: `${m+1}/${d}`,
    dowLabel: dayNames[dow],
    dowClass
  };
}
