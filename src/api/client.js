export async function getConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

export async function getWeather({ type = 'all', venueId = '' } = {}) {
  const params = new URLSearchParams({ type });
  if (venueId) params.set('venueId', venueId);
  const res = await fetch(`/api/weather?${params.toString()}`);
  return res.json();
}

export async function getRadar() {
  const res = await fetch('/api/radar');
  return res.json();
}

export async function getWarning() {
  const res = await fetch('/api/warning');
  return res.json();
}

export async function getFerry() {
  const res = await fetch('/api/ferry');
  return res.json();
}
