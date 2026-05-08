# Where Indi

경희대 파일럿을 상정한 위치 기반 인디뮤직 발견 앱 데모입니다.

## Included

- 스마트폰 앱처럼 보이는 Spotify 스타일 인디뮤직 서비스 UI
- 2초 블랙 스플래시 화면과 Where Indi 로고
- Jamendo API 기반 실제 독립 아티스트 트랙 로딩
- Kakao Maps JavaScript SDK 기반 실제 지도 전환
- client_id 미입력 시 내장 데모 트랙 fallback
- 지도형 근처 음악 추천, 30m 근처 재생 반경, 24시간 다시 듣기
- 오디오 플레이어, 재생률 기반 취향 포인트, 리뷰 품질 점수
- Indi Points, 공연 할인 시뮬레이션, 창작자 대시보드

## Run

```bash
node server.js
```

Then open `http://localhost:4173`.

## Jamendo API

1. Create an app at `developer.jamendo.com`.
2. Copy the issued `client_id`.
3. Paste it into the Jamendo client_id field in the Discover screen.
4. Click `API 불러오기`.

The app uses Jamendo JSONP so the static demo can call the API from the browser.

## Kakao Map API

1. Create an app at `developers.kakao.com`.
2. Activate Kakao Map API in the app settings.
3. Add `http://localhost:4173` to the Web platform site domain.
4. Copy the JavaScript key, not the REST API key.
5. Paste it into the Kakao JavaScript key field in the Map screen.

Without a key, the app keeps the built-in demo map.
