# 공공데이터포털 방식 전용 수정 내역

## 수정 완료
- APIHub 관련 설정과 호출 코드를 제거했습니다.
- 특보 조회는 공공데이터포털 `VilageFcstMsgService/getWthrWrnInfo`만 사용하도록 정리했습니다.
- 여수시 행정코드 `4613000000` 기준으로 특보를 조회하도록 고정했습니다.
- 특보가 없거나 공통 안내문만 내려오면 화면에는 빈값이 나오도록 처리했습니다.
- 초단기예보/실황, 중기예보는 `.env`의 `KMA_SERVICE_KEY` 하나로만 호출하도록 정리했습니다.
- Vite 개발 서버의 `/api/warning`, `/api/weather` 프록시 구조를 공공데이터포털 방식으로 통일했습니다.

## 실행 방법
```bash
npm install
npm run dev
```

## 인증키 입력 위치
`.env` 파일의 아래 항목에 공공데이터포털 인증키를 넣으세요.

```env
KMA_SERVICE_KEY=공공데이터포털_인증키
WARNING_REG_ID=4613000000
```
