import { defineConfig, loadEnv } from 'vite';
import weatherHandler from './api/weather.js';
import warningHandler from './api/warning.js';

function localApiPlugin() {
  let env = {};

  function getEnv(name, fallback = '') {
    return env[name] || fallback;
  }

  function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toKstDate(date = new Date()) {
    return new Date(date.getTime() + 9 * 60 * 60 * 1000);
  }

  function formatKstRadarTime(date = new Date()) {
    const kst = toKstDate(date);
    const yyyy = kst.getUTCFullYear();
    const mm = pad(kst.getUTCMonth() + 1);
    const dd = pad(kst.getUTCDate());
    const hh = pad(kst.getUTCHours());
    const mi = pad(Math.floor(kst.getUTCMinutes() / 10) * 10);
    return `${yyyy}${mm}${dd}${hh}${mi}`;
  }

  function buildRadarCandidates(count = 18) {
    const result = [];
    for (let i = 1; i <= count; i += 1) {
      const time = formatKstRadarTime(new Date(Date.now() - i * 10 * 60 * 1000));
      ['png', 'gif', 'jpg', 'jpeg'].forEach((ext) => {
        result.push({ time, url: `https://www.weather.go.kr/w/repositary/image/rdr/img/RDR_CMP_WRC_${time}.${ext}` });
      });
    }
    return result;
  }

  return {
    name: 'local-api-plugin',
    configResolved(config) {
      env = loadEnv(config.mode, process.cwd(), '');
    },
    configureServer(server) {
      server.middlewares.use('/api/config', (req, res) => {
        sendJson(res, 200, {
          kmaConfigured: Boolean(env.KMA_SERVICE_KEY || env.VITE_KMA_SERVICE_KEY),
          radarConfigured: Boolean(env.RADAR_SERVICE_KEY || env.VITE_RADAR_SERVICE_KEY),
          warningConfigured: Boolean(env.KMA_SERVICE_KEY || env.VITE_KMA_SERVICE_KEY),
          marineConfigured: Boolean(env.KMA_SERVICE_KEY || env.VITE_KMA_SERVICE_KEY),
          ferryConfigured: true,
          warningMode: '공공데이터포털'
        });
      });

      server.middlewares.use('/api/radar', async (req, res) => {
        const candidates = buildRadarCandidates(18);
        sendJson(res, 200, {
          ok: true,
          message: '기상청 레이더 공개 이미지 후보를 생성했습니다.',
          imageUrl: candidates[0]?.url || '',
          time: candidates[0]?.time || formatKstRadarTime(),
          candidates
        });
      });

      server.middlewares.use('/api/warning', async (req, res) => {
        req.query = Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams.entries());
        process.env.KMA_SERVICE_KEY = getEnv('KMA_SERVICE_KEY', getEnv('VITE_KMA_SERVICE_KEY'));
        process.env.WARNING_REG_ID = getEnv('WARNING_REG_ID', '4613000000');
        process.env.WARNING_ROWS = getEnv('WARNING_ROWS', '100');
        process.env.WARNING_PAGE = getEnv('WARNING_PAGE', '1');
        process.env.WARNING_DATA_TYPE = getEnv('WARNING_DATA_TYPE', 'XML');
        await warningHandler(req, res);
      });

      server.middlewares.use('/api/ferry', (req, res) => {
        sendJson(res, 200, { ok: true, url: 'https://island.theksa.co.kr/page/booking', message: '실시간 운항정보 페이지로 연결합니다.', source: 'local' });
      });

      server.middlewares.use('/api/weather', async (req, res) => {
        req.query = Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams.entries());
        process.env.KMA_SERVICE_KEY = getEnv('KMA_SERVICE_KEY', getEnv('VITE_KMA_SERVICE_KEY'));
        await weatherHandler(req, res);
      });
    }
  };
}

export default defineConfig({
  plugins: [localApiPlugin()],
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
});
