export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    message: '운항정보 API 연결 전 임시 응답입니다.',
    radarUrl: process.env.RADAR_URL || '',
    source: 'vercel'
  });
}
