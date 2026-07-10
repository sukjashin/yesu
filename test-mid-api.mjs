import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
const key = env.match(/KMA_SERVICE_KEY=(.+)/)?.[1]?.trim();
const tmFcs = ['202507090600', '202507081800', '202507080600'];
const codes = ['4613035023', '4613025030', '4613034024', '11F20000', '11F20401'];

async function test(regId, api, tmFc) {
  const base = api === 'land' ? 'getMidLandFcst' : 'getMidTa';
  const url = `http://apis.data.go.kr/1360000/MidFcstInfoService/${base}?serviceKey=${key}&numOfRows=10&pageNo=1&dataType=JSON&regId=${regId}&tmFc=${tmFc}`;
  const r = await fetch(url);
  const data = await r.json();
  const code = data?.response?.header?.resultCode;
  const msg = data?.response?.header?.resultMsg;
  const items = data?.response?.body?.items?.item;
  const hasItem = items && (Array.isArray(items) ? items.length : true);
  console.log(api, regId, tmFc, code, msg, hasItem ? 'hasItem' : 'noItem');
  if (hasItem) console.log(JSON.stringify(items).slice(0, 300));
}

for (const tmFc of tmFcs) {
  for (const c of codes) {
    await test(c, 'land', tmFc);
    await test(c, 'ta', tmFc);
  }
}
