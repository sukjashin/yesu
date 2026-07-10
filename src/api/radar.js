export async function fetchRadarImage() {
  const res = await fetch('/api/radar');
  return res.json();
}
