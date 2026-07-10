# 2026 여수세계섬박람회 행사장 기상정보 서비스

Vite + OpenStreetMap + `.env` 구조로 정리한 버전입니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 아래 주소로 접속합니다.

```txt
http://localhost:5173
```

## 인증키 입력

1. `.env.example`을 참고합니다.
2. `.env` 파일에 실제 인증키를 입력합니다.
3. `.env`는 `.gitignore`에 들어 있어 GitHub에 올라가지 않습니다.

## 주요 구조

```txt
index.html
src/
  main.js
  api/client.js
  components/map.js
  components/forecast-modal.js
  components/common.js
  data/venues.js
  data/forecast.js
  styles/style.css
api/
  config.js
  weather.js
  radar.js
  warning.js
  ferry.js
.env.example
.gitignore
package.json
vite.config.js
```

## 지도

지도는 Leaflet + OpenStreetMap을 사용합니다.
VWorld 인증키는 필요 없습니다.

## Vercel 배포 시

Vercel > Project Settings > Environment Variables에서 아래 값을 등록하세요.

```txt
KMA_SERVICE_KEY
RADAR_URL
WARNING_URL
WARNING_KEY
FERRY_KEY
FERRY_URL
```

## 주의

현재 `api/weather.js`, `api/radar.js`, `api/warning.js`, `api/ferry.js`는 실제 API 연결 전의 기본 틀입니다.
인증키를 받은 뒤 실제 API 주소와 응답 구조에 맞게 연결하면 됩니다.

## 2026-07-08 추가 수정

### 수정 내용
1. 메인 상단 기준일시가 고정값(2026.05.20)으로 남아 있던 문제를 수정했습니다.
   - 페이지가 열릴 때 한국시간 기준 현재 날짜/시간으로 즉시 변경됩니다.
   - API 조회 성공 시에는 기상청 초단기실황 기준시각으로 다시 표시됩니다.

2. 특보 조회 오류를 줄이도록 수정했습니다.
   - 여수 행정코드 `4613000000`을 기본값으로 사용합니다.
   - 기존 `VilageFcstMsgService/getWthrWrnInfo` 조회가 실패하면 기상특보 조회서비스 후보 API로 자동 재시도합니다.
   - 특보가 없으면 오류처럼 보이지 않도록 “현재 여수시에 발표된 특보가 없습니다.”로 표시합니다.

3. 날씨예보 조회 안정성을 개선했습니다.
   - 초단기실황/초단기예보 생성 직후 `NO_DATA`가 나올 경우 이전 기준시각으로 자동 재조회합니다.
   - 초단기실황이 실패해도 초단기예보가 성공하면 상세보기 예보는 표시됩니다.
   - 샘플데이터로 대체하지 않습니다.
