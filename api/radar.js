function pad(value) {
  return String(value).padStart(2, '0');
}

function toKstDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatRadarTime(date = new Date()) {
  const kst = toKstDate(date);
  const yyyy = kst.getUTCFullYear();
  const mm = pad(kst.getUTCMonth() + 1);
  const dd = pad(kst.getUTCDate());
  const hh = pad(kst.getUTCHours());
  const mi = pad(Math.floor(kst.getUTCMinutes() / 10) * 10);
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

function buildTimes(count = 18) {
  const now = new Date();
  const result = [];
  for (let i = 1; i <= count; i += 1) {
    result.push(formatRadarTime(new Date(now.getTime() - i * 10 * 60 * 1000)));
  }
  return result;
}

function buildRadarUrls(time) {
  return [
    `https://www.weather.go.kr/w/repositary/image/rdr/img/RDR_CMP_WRC_${time}.png`,
    `https://www.weather.go.kr/w/repositary/image/rdr/img/RDR_CMP_WRC_${time}.gif`,
    `https://www.weather.go.kr/w/repositary/image/rdr/img/RDR_CMP_WRC_${time}.jpg`,
    `https://www.weather.go.kr/w/repositary/image/rdr/img/RDR_CMP_WRC_${time}.jpeg`
  ];
}

export default async function handler(req, res) {
  const times = buildTimes(Number(req.query.count || 18));
  const candidates = times.flatMap((time) => buildRadarUrls(time).map((url) => ({ time, url })));

  return res.status(200).json({
    ok: true,
    message: '기상청 레이더 공개 이미지 후보를 생성했습니다.',
    imageUrl: candidates[0]?.url || '',
    time: candidates[0]?.time || formatRadarTime(),
    candidates
  });
}
