# Where Indi

Where Indi is a location-based indie music discovery demo for campus walking routes.
It recommends songs by combining the user's selected taste, current place mood, time of day, distance, and listening feedback.

The demo is designed for a presentation flow: the app starts with an empty listening history, asks for the user's taste, then immediately shows a music recommendation popup for the current demo location.

## Demo Flow

1. Start the app and choose genre/mood tags.
2. After onboarding, a recommendation popup appears immediately.
3. The popup shows the album cover, song title, artist, and why the song was recommended.
4. Recommendation factors are shown as compact chips: place, taste, time, and distance.
5. Tap `재생` to start playback.
6. The player shows play/pause, progress, current time, and total duration.
7. Leave a star rating. Heard songs appear under the rating panel.
8. Open the map. Only places where songs have actually been played are shown.
9. Tap a place marker to open an in-map playlist panel instead of leaving the map.

## Current Demo Behavior

- Initial heard-song list is empty.
- Initial map playlist is empty.
- A recommendation popup appears after taste selection.
- Songs are added to history only after the user plays them.
- Songs played at the same place are grouped into one map marker.
- Tapping a grouped marker opens a playlist panel on the map.
- If browser notification permission is granted, a background recommendation notification can appear when the tab goes into the background.
- If notifications are blocked, the app falls back to changing the tab title.

## Main Features

- Mobile app style UI with Home, Map, Player, and IndiCoin tabs
- Taste onboarding with genre and mood choices
- Album cover thumbnails in home recommendations and recommendation popups
- Recommendation explanations based on place, taste, time, and distance
- Location-zone popup that asks whether to play a recommended song
- Browser notification support for background demo recommendations
- Map markers grouped by place to avoid overlapping songs
- In-map playlist panel for songs at a tapped place
- Heard-song list under the rating panel
- Play/pause controls, progress bar, and playback time display
- IndiCoin reward simulation for listening and rating
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

Gemini is optional. Without an API key, the app still works with built-in and rule-based recommendation text.

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
- Map markers are created only after a song is played.
- Multiple songs at the same place are grouped into one marker and shown as a playlist panel.
- Browser notifications require user permission and browser support.
- For production, move public API keys and map keys behind a server-side configuration layer.

## Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Map: Kakao Maps JavaScript SDK with SVG fallback
- Backend: Node.js HTTP server
- Music: Jamendo Public API
- Optional AI: Google Gemini
