# Where Indi

경희대 캠퍼스 파일럿을 상정한 위치 기반 인디뮤직 발견 앱.
GPS 동선 위에서 사용자 취향과 장소 분위기에 어울리는 인디 음악을 자동 추천합니다.

## Features

- **세션 기반 온보딩** — 새로고침할 때마다 장르·분위기 취향을 다시 묻고 세션 동안만 기억
- **PCA + Gemini 설명 레이어** — PCA 기반 추천 결과를 Gemini가 사용자에게 자연스러운 한 줄 이유로 설명
- **GPS 장소 트리거** — 캠퍼스 내 특정 장소 (정문 카페거리, 중앙광장, 독립서점 골목, 노천극장) 60m 이내 진입 시 Gemini가 그 장소에 가장 어울리는 트랙을 골라 배너로 알림
- **룰 베이스 보조 점수** — 태그 매칭(30) + GPS 근접(20) + 시간대(15) + 장소 분위기(10) + 신진 아티스트 보정(5)
- **Jamendo API** — 실제 독립 아티스트 트랙 자동 로딩
- **Kakao Maps SDK** — 실시간 GPS 위치와 추천 트랙 핀을 지도 위에 표시
- **인디코인 경제** — 추천 음악 70% 감상 시 +10 IC, 리뷰 품질에 따라 +10~30 IC, 코인샵에서 레벨업·공연 할인·현금화 신청
- **크리에이터 대시보드** — 발견·해제·리뷰·예매 메트릭 실시간 집계

## Backend

Node 서버가 정적 파일과 REST API를 함께 서빙합니다.

| Method | Path | Description |
|---|---|---|
| GET  | `/api/recommend`         | 룰 베이스 점수 추천 |
| POST | `/api/ai-reasons`        | Gemini로 트랙별 추천 이유 생성 |
| POST | `/api/place-vibe`        | GPS 장소 진입 시 어울리는 트랙 + 감성 메시지 |
| POST | `/api/user/prefs`        | 세션 사용자 취향 저장 |
| POST | `/api/unlock`            | 지도 기반 듣기 활성화 |
| POST | `/api/listen-reward`     | 70% 이상 감상 시 인디코인 지급 |
| POST | `/api/review`            | 리뷰 저장 + 품질 점수 + 인디코인 |
| POST | `/api/spend`             | 인디코인 사용 (추천 힌트, 레벨업, 예매 할인, 현금화 신청) |
| GET  | `/api/creator/dashboard` | 누적 메트릭 |

## Run

```powershell
# 선택: AI 추천 문구까지 쓰려면 Gemini 키 설정
$env:GEMINI_API_KEY="your-gemini-api-key"

node server.js
```

브라우저에서 `http://127.0.0.1:4173` 또는 `http://localhost:4173` 접속.

## API Keys

- **Gemini API Key**: `GEMINI_API_KEY` 환경변수로 설정합니다.
- **Gemini Model**: 필요하면 `GEMINI_MODEL` 환경변수로 바꿀 수 있습니다. 기본값은 `gemini-2.5-flash`입니다.
- **Jamendo client_id / Kakao Maps JS Key**: 데모용 공개 클라이언트 키입니다. 실제 배포 전 서비스 도메인 제한과 키 교체를 권장합니다.

AI 키는 서버 코드나 README에 직접 커밋하지 마세요.

## Stack

- Frontend: Vanilla JS + HTML5 Audio + Kakao Maps SDK
- Backend: Node.js, in-memory store
- AI: Google Gemini 2.5 Flash (`generativelanguage.googleapis.com`)
- Music: Jamendo Public API
