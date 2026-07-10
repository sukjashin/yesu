export default function handler(req, res) {
  res.status(200).json({
    kmaConfigured: Boolean(process.env.KMA_SERVICE_KEY),
    radarConfigured: Boolean(process.env.RADAR_SERVICE_KEY || process.env.VITE_RADAR_SERVICE_KEY),
    warningConfigured: Boolean(process.env.KMA_SERVICE_KEY || process.env.WARNING_SERVICE_KEY),
    ferryConfigured: Boolean(process.env.FERRY_URL || process.env.FERRY_KEY)
  });
}
