import "./styles/style.css";

import { initMap } from "./components/map.js";
import { initForecastModal } from "./components/forecast-modal.js";
import { venueData } from "./data/venues.js";
import { popupHTML } from "./components/common.js";
import * as api from "./api/client.js";
import { fetchRadarImage } from "./api/radar.js";

window.api = api;

function formatKstNowLabel({ includeWeekday = true, includeTime = true } = {}) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: includeWeekday ? 'short' : undefined,
    hour: includeTime ? '2-digit' : undefined,
    minute: includeTime ? '2-digit' : undefined,
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const date = `${parts.year}.${parts.month}.${parts.day}`;
  const weekday = includeWeekday && parts.weekday ? ` (${parts.weekday})` : '';
  const time = includeTime ? ` ${parts.hour}:${parts.minute}` : '';
  return `${date}${weekday}${time}`;
}

function setCurrentDateLabels() {
  const updatedAt = document.getElementById('updatedAt');
  const radarTime = document.getElementById('radarTime');
  const fmSub = document.getElementById('fmSub');
  const label = formatKstNowLabel();
  if (updatedAt) updatedAt.textContent = `${label} 기준`;
  if (radarTime) radarTime.textContent = formatKstNowLabel({ includeWeekday: false });
  if (fmSub && fmSub.textContent.includes('2026.05.20')) fmSub.textContent = `${formatKstNowLabel({ includeWeekday: false })} 발표`;
}


function initVenueTabs() {
  const tabs = document.querySelectorAll(".venue-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = Number(tab.dataset.venue);

      tabs.forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.venue) === id);
      });

      const mapModule = window.yeosuMap;

      if (mapModule?.map && mapModule?.markers?.[id]) {
        const venue = venueData[id];
        mapModule.map.flyTo([venue.lat, venue.lng], 13, { duration: 0.6 });
        mapModule.markers[id].openPopup();
      }
    });
  });
}

function initRefreshButton() {
  const refreshBtn = document.getElementById("refreshBtn");
  const updatedAt = document.getElementById("updatedAt");
  const radarTime = document.getElementById("radarTime");

  if (!refreshBtn) return;

  refreshBtn.addEventListener("click", () => {
    if (updatedAt) updatedAt.textContent = `${formatKstNowLabel()} 기준 갱신`;
    if (radarTime) radarTime.textContent = formatKstNowLabel({ includeWeekday: false });

    loadVenueWeather();
    loadWarningPanel();
    loadRadarPanel();
  });
}

function setActiveMainNav(targetHref) {
  document.querySelectorAll(".main-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === targetHref);
  });
}

function resetHomeView() {
  setActiveMainNav("#home");

  document.querySelectorAll(".venue-tab").forEach((tab) => {
    tab.classList.toggle("active", Number(tab.dataset.venue) === 1);
  });

  const mapModule = window.yeosuMap;
  if (mapModule?.map) {
    const venueLocations = Object.values(venueData).map((venue) => [venue.lat, venue.lng]);
    mapModule.map.closePopup();
    if (venueLocations.length) {
      mapModule.map.fitBounds(venueLocations, {
        padding: [40, 40],
        maxZoom: 12
      });
    }
  }

  if (typeof window.closeForecastModal === "function") {
    window.closeForecastModal();
  }

  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatRadarLabel(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{12}$/.test(text)) {
    return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}`;
  }
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
  }
  return text;
}

function formatPopupTimeLabel(baseDate, baseTime) {
  if (!baseDate || !baseTime) return '';
  const y = Number(baseDate.slice(0, 4)), m = Number(baseDate.slice(4, 6)), d = Number(baseDate.slice(6, 8));
  const hh = String(baseTime).slice(0, 2), mi = String(baseTime).slice(2, 4);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = new Date(y, m - 1, d).getDay();
  return `${m}.${String(d).padStart(2, '0')}(${dayNames[dow]}) ${hh}:${mi}`;
}

function testImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

let radarFrames = [];
let radarPlayTimer = null;
let radarPlayIndex = 0;
const RADAR_FRAME_INTERVAL_MS = 500;

function setRadarPlayIcon(playing) {
  const playBtn = document.getElementById("radarPlayBtn");
  if (!playBtn) return;
  const iconPlay = playBtn.querySelector(".icon-play");
  const iconPause = playBtn.querySelector(".icon-pause");
  if (iconPlay) iconPlay.style.display = playing ? "none" : "block";
  if (iconPause) iconPause.style.display = playing ? "block" : "none";
  const label = playing ? "레이더 애니메이션 정지" : "레이더 애니메이션 재생";
  playBtn.setAttribute("aria-label", label);
  playBtn.title = label;
}

function setRadarFrame(index) {
  const radarImage = document.getElementById("radarImage");
  const radarTime = document.getElementById("radarTime");
  const progressBar = document.getElementById("radarProgressBar");
  const frame = radarFrames[index];
  if (!frame || !radarImage) return;
  radarImage.src = frame.url;
  if (radarTime) radarTime.textContent = formatRadarLabel(frame.time);
  if (progressBar) progressBar.style.width = `${((index + 1) / radarFrames.length) * 100}%`;
}

function stopRadarPlay() {
  if (radarPlayTimer) {
    clearInterval(radarPlayTimer);
    radarPlayTimer = null;
  }
  setRadarPlayIcon(false);
  // 정지하면 가장 최신 영상으로 복귀합니다.
  if (radarFrames.length) setRadarFrame(radarFrames.length - 1);
}

function startRadarPlay() {
  if (radarFrames.length < 2 || radarPlayTimer) return;
  setRadarPlayIcon(true);
  radarPlayIndex = 0;
  setRadarFrame(radarPlayIndex);
  radarPlayTimer = setInterval(() => {
    radarPlayIndex = (radarPlayIndex + 1) % radarFrames.length;
    setRadarFrame(radarPlayIndex);
  }, RADAR_FRAME_INTERVAL_MS);
}

function initRadarPlayer() {
  const playBtn = document.getElementById("radarPlayBtn");
  if (!playBtn) return;
  playBtn.addEventListener("click", () => {
    if (radarPlayTimer) stopRadarPlay();
    else startRadarPlay();
  });
}

// 최근 시각들 중 실제로 존재하는 레이더 영상만 모아 애니메이션 프레임을 구성합니다.
async function buildRadarFrames(candidates) {
  const byTime = new Map();
  candidates.forEach(({ time, url }) => {
    if (!byTime.has(time)) byTime.set(time, []);
    byTime.get(time).push(url);
  });

  const times = Array.from(byTime.keys()); // 최신순
  const frames = [];
  for (const time of times) {
    for (const url of byTime.get(time)) {
      try {
        const okUrl = await testImage(url);
        frames.push({ time, url: okUrl });
        break;
      } catch {
        // 다음 후보로 재시도
      }
    }
  }
  return frames.reverse(); // 과거 → 최신 순으로 정렬 (애니메이션 재생 순서)
}

async function loadRadarPanel() {
  const radarImage = document.getElementById("radarImage");
  const radarFallback = document.getElementById("radarFallback");
  const radarTime = document.getElementById("radarTime");
  const playBtn = document.getElementById("radarPlayBtn");

  if (!radarImage) return;

  stopRadarPlay();
  radarFrames = [];
  if (playBtn) playBtn.disabled = true;

  try {
    if (radarFallback) {
      radarFallback.style.display = "flex";
      radarFallback.textContent = "레이더 영상을 불러오는 중입니다.";
    }

    const radar = await fetchRadarImage();
    const candidates = Array.isArray(radar?.candidates)
      ? radar.candidates
      : radar?.imageUrl
        ? [{ url: radar.imageUrl, time: radar.time }]
        : [];

    for (const candidate of candidates) {
      try {
        const okUrl = await testImage(candidate.url);
        radarImage.src = okUrl;
        radarImage.style.display = "block";
        if (radarFallback) radarFallback.style.display = "none";
        if (radarTime) radarTime.textContent = formatRadarLabel(candidate.time || radar.time);

        // 최신 프레임을 먼저 보여준 뒤, 재생용 프레임 목록을 백그라운드로 구성합니다.
        buildRadarFrames(candidates).then((frames) => {
          radarFrames = frames;
          if (playBtn) playBtn.disabled = frames.length < 2;
        });
        return;
      } catch {
        // 다음 후보 영상으로 자동 재시도
      }
    }

    radarImage.removeAttribute("src");
    if (radarFallback) {
      radarFallback.style.display = "flex";
      radarFallback.textContent = radar?.message || "레이더 영상을 찾지 못했습니다.";
    }
    console.warn("레이더 영상 없음:", radar);
  } catch (error) {
    console.error("레이더 영상 표시 실패:", error);
    radarImage.removeAttribute("src");
    if (radarFallback) {
      radarFallback.style.display = "flex";
      radarFallback.textContent = "레이더 영상을 불러오지 못했습니다.";
    }
  }
}

async function loadWarningPanel() {
  const warnBanner = document.querySelector(".warn-banner");
  const warnTexts = warnBanner?.querySelectorAll(".warn-text");
  if (!warnTexts?.length) return;

  const setWarningText = (value) => {
    warnTexts.forEach((item) => {
      item.textContent = value;
    });
  };

  try {
    setWarningText("예보·특보 정보를 불러오는 중입니다.");
    const warning = await api.getWarning();
    setWarningText(warning?.displayText || "내용없음");
    warnBanner.classList.toggle("is-error", warning?.ok === false);
    if (warning?.time) warnBanner.title = `발표시각: ${formatRadarLabel(warning.time)}`;
    if (warning?.errors?.length) console.warn("특보 조회 상세 오류:", warning.errors);
  } catch (error) {
    console.error("예보·특보 표시 실패:", error);
    setWarningText("내용없음");
  }
}

async function loadVenueWeather() {
  const markers = window.yeosuMap?.markers;
  try {
    const data = await api.getWeather({ type: 'ultra' });
    if (!data.ok) throw new Error(data.message || '날씨 API 응답 오류');

    (data.items || []).forEach((item) => {
      const venue = venueData[item.id];
      if (!venue) return;
      const current = item.current || {};
      venue.nx = Number(item.nx);
      venue.ny = Number(item.ny);
      venue.stnId = item.stnId;
      venue.awsName = item.awsName;
      venue.temp = current.temp ?? venue.temp;
      venue.humidity = current.humidity ?? venue.humidity;
      venue.wind = current.wind ?? venue.wind;
      venue.windDirText = current.windDirText ?? venue.windDirText;
      venue.rain1h = current.rain1h || '강수없음';
      venue.sky = current.sky || venue.sky;
      venue.icon = current.icon || venue.icon;
      venue.feels = current.feels ?? venue.temp;
      venue.tempDiff = current.tempDiff ?? null;
      if (item.ncstBase) {
        venue.baseLabel = formatPopupTimeLabel(item.ncstBase.baseDate, item.ncstBase.baseTime);
      }
      if (markers?.[venue.id]) markers[venue.id].setPopupContent(popupHTML(venue));
    });

    // 상단 배너 시각은 실시간 시계(setCurrentDateLabels)가 담당하므로 여기서는 덮어쓰지 않습니다.
  } catch (error) {
    console.error('초단기실황 표시 실패:', error);
  }
}

async function initApiStatus() {
  try {
    const config = await api.getConfig();
    console.log("API 설정 상태:", config);
  } catch (error) {
    console.warn("API 설정 확인 실패:", error);
  }
}


function openInNewTab(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function getPublicLink(name, fallback) {
  return import.meta.env[name] || fallback;
}

function initPageLinks() {
  const links = {
    warning: getPublicLink("VITE_WARNING_URL", "https://www.weather.go.kr/w/weather/warning/status.do"),
    ferry: getPublicLink("VITE_FERRY_URL", "https://island.theksa.co.kr/page/booking"),
    radar: getPublicLink("VITE_RADAR_MORE_URL", "https://www.weather.go.kr/w/image/radar.do"),
    safety: getPublicLink("VITE_SAFETY_URL", "https://www.weather.go.kr/w/special/safetyguide/heavy-rain.do")
  };

  document.querySelectorAll('a[href="#home"]').forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      resetHomeView();
    });
  });

  document.querySelectorAll('a[href="#forecast"]').forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveMainNav("#forecast");
      openInNewTab(links.warning);
    });
  });

  document.querySelectorAll('a[href="#guide"]').forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      openInNewTab(links.safety);
    });
  });

  document.querySelectorAll(".quick-card").forEach((card) => {
    const title = card.querySelector(".qtitle")?.textContent?.trim() || "";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const handler = () => {
      if (title.includes("운항")) openInNewTab(links.ferry);
      else if (title.includes("날씨누리")) openInNewTab(links.warning);
    };

    card.addEventListener("click", handler);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handler();
      }
    });
  });

  document.querySelectorAll(".more-pill").forEach((el) => {
    const text = el.textContent?.trim() || "";
    el.addEventListener("click", () => {
      if (text.includes("더보기")) openInNewTab(links.radar);
      else if (text.includes("운항")) openInNewTab(links.ferry);
      else if (text.includes("레이더")) openInNewTab(links.radar);
      else if (text.includes("예보") || text.includes("특보")) openInNewTab(links.warning);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setCurrentDateLabels();
  // 상단 배너 현재 시각이 멈춰있지 않도록 1분마다 갱신합니다.
  setInterval(setCurrentDateLabels, 60 * 1000);

  try {
    const mapResult = await initMap();

    window.yeosuMap = mapResult || window.yeosuMap || {};

    initForecastModal();
    initVenueTabs();
    initRefreshButton();
    initPageLinks();
    initRadarPlayer();
    initApiStatus();
    loadVenueWeather();
    loadRadarPanel();
    loadWarningPanel();

    // 날씨 데이터가 오래된 채로 멈춰있지 않도록 5분마다 자동으로 다시 불러옵니다.
    setInterval(() => {
      loadVenueWeather();
      loadRadarPanel();
      loadWarningPanel();
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("초기 실행 오류:", error);
  }
});
