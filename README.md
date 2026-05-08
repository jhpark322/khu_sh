# Where Indi

경희대 캠퍼스 파일럿을 상정한 위치 기반 인디뮤직 발견 앱.
GPS 동선 위에서 사용자 취향과 장소 분위기에 어울리는 인디 음악을 자동 추천합니다.

## Features

- **세션 기반 온보딩** — 새로고침할 때마다 장르·분위기 취향을 다시 묻고 세션 동안만 기억
- **Gemini 2.5 Flash 추천 엔진** — 트랙별 추천 이유를 사용자 취향·시간대에 맞춰 한 줄로 생성
- **GPS 장소 트리거** — 캠퍼스 내 특정 장소 (정문 카페거리, 중앙광장, 독립서점 골목, 노천극장) 60m 이내 진입 시 Gemini가 그 장소에 가장 어울리는 트랙을 골라 배너로 알림
- **룰 베이스 보조 점수** — 태그 매칭(30) + GPS 근접(20) + 시간대(15) + 장소 분위기(10) + 신진 아티스트 보정(5)
- **Jamendo API** — 실제 독립 아티스트 트랙 자동 로딩 (client_id 하드코딩, 새로고침 즉시 재생 가능)
- **Kakao Maps SDK** — 실시간 GPS 위치와 추천 트랙 핀을 지도 위에 표시
- **포인트 경제** — 잠금 해제 +5K, 리뷰 품질에 따라 +10~30K, 공연 예매 100K 차감
- **크리에이터 대시보드** — 발견·해제·리뷰·예매 메트릭 실시간 집계

## Backend

Express 서버가 정적 파일과 REST API를 함께 서빙합니다.

| Method | Path | Description |
|---|---|---|
| GET  | `/api/recommend`         | 룰 베이스 점수 추천 |
| POST | `/api/ai-reasons`        | Gemini로 트랙별 추천 이유 생성 |
| POST | `/api/place-vibe`        | GPS 장소 진입 시 어울리는 트랙 + 감성 메시지 |
| POST | `/api/user/prefs`        | 세션 사용자 취향 저장 |
| POST | `/api/unlock`            | 잠금 해제 + 포인트 지급 |
| POST | `/api/review`            | 리뷰 저장 + 품질 점수 + 포인트 |
| POST | `/api/spend`             | 포인트 사용 (힌트, 예매 등) |
| GET  | `/api/creator/dashboard` | 누적 메트릭 |

## Run

```bash
npm install
node server.js
```

브라우저에서 `http://127.0.0.1:4173` 또는 `http://localhost:4173` 접속.

## API Keys (이미 코드에 하드코딩)

- **Jamendo** `client_id`: `b0af7f33`
- **Kakao Maps JS Key**: `dc140cc7273dca9367e4384de951ff75`
- **Gemini API Key**: `server.js` 상단 `GEMINI_API_KEY` 상수

새 키로 교체하려면 해당 위치만 수정하면 됩니다.

## Stack

- Frontend: Vanilla JS + HTML5 Audio + Kakao Maps SDK
- Backend: Node.js + Express, in-memory store
- AI: Google Gemini 2.5 Flash (`generativelanguage.googleapis.com`)
- Music: Jamendo Public API
