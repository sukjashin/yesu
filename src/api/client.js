const API_TIMEOUT_MS = 18000;
const pendingRequests = new Map();

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('날씨 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw new Error(`날씨 서버에 연결할 수 없습니다: ${error?.message || '네트워크 오류'}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let data;

  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`날씨 서버가 잘못된 JSON을 반환했습니다. (HTTP ${res.status})`);
    }
  } else {
    const hint = text.trim().slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `날씨 API 경로를 찾을 수 없거나 서버가 올바르게 배포되지 않았습니다. (HTTP ${res.status}${hint ? `: ${hint}` : ''})`
    );
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `날씨 API 요청 실패 (HTTP ${res.status})`);
  }
  return data;
}

function requestJson(url) {
  if (pendingRequests.has(url)) return pendingRequests.get(url);
  const request = fetchJson(url).finally(() => pendingRequests.delete(url));
  pendingRequests.set(url, request);
  return request;
}

export async function getConfig() {
  return requestJson('/api/config');
}

export async function getWeather({ type = 'all', venueId = '' } = {}) {
  const params = new URLSearchParams({ type });
  if (venueId) params.set('venueId', venueId);
  return requestJson(`/api/weather?${params.toString()}`);
}

export async function getRadar() {
  return requestJson('/api/radar');
}

export async function getWarning() {
  return requestJson('/api/warning');
}

export async function getFerry() {
  return requestJson('/api/ferry');
}
