# Where Indi

Where Indi is a location-based indie music discovery demo for campus walking routes.
It recommends songs by combining the user's music taste, nearby place mood, GPS proximity, and listening feedback.

The current demo is tuned for presentation: when the app starts, previous listening history is reset and two demo songs are planted at the user's current demo location so the map flow is immediately visible.

## Demo Flow

1. Choose taste tags on the onboarding screen.
2. Open the map.
3. The current demo location shows one grouped marker, such as `내 위치 데모 구역 · 2곡`.
4. Tap the marker to see the songs at that place without leaving the map.
5. Tap a song in the map panel to start playback.
6. The player shows play/pause, progress, and time information.
7. Leave a star rating. Heard songs appear under the rating panel.

## Main Features

- Mobile app style UI with Home, Map, Player, and IndiCoin tabs
- Taste onboarding with genre and mood choices
- Home and recommendation cards that explain why a song is recommended
- Location-zone popup that asks whether to play the recommended song
- Map markers grouped by place, so songs at the same location do not overlap
- Map place panel that lists songs at a tapped location
- Heard-song list under the rating panel
- Play/pause controls, progress bar, and playback time display
- IndiCoin reward simulation for listening and rating
- Demo seed songs at the current location for easy presentations
- Kakao Maps integration with SVG fallback map
- Jamendo API loading for real indie tracks
- Optional Gemini-based recommendation wording when `GEMINI_API_KEY` is set

## Run

```powershell
node server.js
```

Then open:

```text
http://127.0.0.1:4173
```

## Optional Gemini Setup

Gemini is optional. Without an API key, the app keeps working with built-in and rule-based recommendation text.

```powershell
$env:GEMINI_API_KEY="your-gemini-api-key"
$env:GEMINI_MODEL="gemini-2.5-flash"
node server.js
```

## Backend API

The project uses a small Node server with in-memory state and static file serving.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/recommend` | Scores tracks by taste, time, place, and distance |
| POST | `/api/ai-reasons` | Adds optional Gemini recommendation reasons |
| POST | `/api/place-vibe` | Chooses a song when entering a music zone |
| POST | `/api/user/prefs` | Stores onboarding taste preferences |
| POST | `/api/unlock` | Simulates location-based unlock |
| POST | `/api/listen-reward` | Awards IndiCoin after listening progress |
| POST | `/api/review` | Stores star feedback and updates taste |
| POST | `/api/spend` | Simulates IndiCoin spending |
| GET | `/api/creator/dashboard` | Returns creator/demo metrics |

## Notes

- Demo listening memory is intentionally reset on app boot.
- The map only shows places where songs have been heard or seeded for demo.
- Multiple songs at the same place are grouped into one marker and shown as a small playlist panel.
- For production, move public API keys and map keys behind a server-side configuration layer.

## Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Map: Kakao Maps JavaScript SDK with SVG fallback
- Backend: Node.js HTTP server
- Music: Jamendo Public API
- Optional AI: Google Gemini
