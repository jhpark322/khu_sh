const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});
app.use(express.static(path.join(__dirname)));

// ── In-memory store ──────────────────────────────────────────────
const store = {
  users: {},      // userId → { prefs, keys, unlocks, reviews }
  unlocks: [],
  reviews: [],
  metrics: { discoveries: 120, unlocks: 86, reviews: 28, bookings: 9 }
};

function getUser(userId) {
  if (!store.users[userId]) {
    store.users[userId] = {
      prefs: { genres: ["indie"], moods: ["잔잔함", "밤"] },
      keys: 25,
      unlocked: [],
      reviewed: []
    };
  }
  return store.users[userId];
}

// ── Recommendation engine ────────────────────────────────────────
const PLACE_TAGS = {
  "정문 앞 카페": ["카페", "조용함", "밤", "야경"],
  "학교 중앙광장": ["야외", "청춘", "낮", "활기"],
  "독립서점": ["조용함", "오후", "독서", "로파이"],
  "공원 벤치": ["산책", "자연", "여유", "아침"],
  "소극장 앞": ["공연", "저녁", "문화", "밴드"],
  "버스정류장": ["이동", "저녁", "밤", "잔잔함"]
};

const TIME_MOODS = {
  morning:   ["청량", "산책", "아침", "어쿠스틱"],
  afternoon: ["로파이", "카페", "집중", "오후"],
  evening:   ["잔잔함", "밤", "감성", "인디"],
  night:     ["밤", "이별", "어쿠스틱", "잔잔함"]
};

function getTimeBucket(hour) {
  if (hour >= 6  && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreTrack(track, userPrefs, userLocation, timeBucket) {
  let score = 0;
  const reasons = [];

  // 1. 태그 취향 매칭 (30점)
  const userTags = [...userPrefs.genres, ...userPrefs.moods];
  const trackTags = track.tags || [];
  const matched = trackTags.filter(t => userTags.some(u => t.includes(u) || u.includes(t)));
  const tagScore = Math.min(30, matched.length * 10);
  score += tagScore;
  if (matched.length > 0) reasons.push(`${matched[0]} 취향과 잘 맞음`);

  // 2. 거리 근접도 (20점)
  let distScore = 10; // default when no GPS
  if (userLocation && track.coords) {
    const dist = haversine(userLocation.lat, userLocation.lng, track.coords.lat, track.coords.lng);
    distScore = Math.max(0, 20 - Math.floor(dist / 50));
    if (dist < 100) reasons.push(`${Math.round(dist)}m 바로 근처`);
    else if (dist < 500) reasons.push(`도보 ${Math.round(dist / 80)}분 거리`);
  }
  score += distScore;

  // 3. 시간대 분위기 (15점)
  const timeTags = TIME_MOODS[timeBucket] || [];
  const timeMatch = trackTags.some(t => timeTags.includes(t));
  if (timeMatch) { score += 15; reasons.push(`${timeBucket === "evening" ? "저녁" : timeBucket === "night" ? "밤" : timeBucket === "morning" ? "아침" : "오후"} 분위기와 딱 맞음`); }
  else score += 5;

  // 4. 장소 분위기 (10점)
  const placeTags = PLACE_TAGS[track.place] || [];
  const placeMatch = placeTags.some(t => timeTags.includes(t) || userTags.includes(t));
  if (placeMatch) { score += 10; }

  // 5. 신진 아티스트 보정 (5점)
  score += 5;
  reasons.push("숨은 인디 아티스트");

  const reason = reasons.slice(0, 2).join(" · ");
  return { score: Math.min(99, score), reason };
}

// ── API routes ────────────────────────────────────────────────────

// 사용자 취향 저장
app.post("/api/user/prefs", (req, res) => {
  const { userId, genres, moods } = req.body;
  const user = getUser(userId);
  if (genres) user.prefs.genres = genres;
  if (moods) user.prefs.moods = moods;
  res.json({ ok: true, prefs: user.prefs });
});

// 취향 기반 추천
app.get("/api/recommend", (req, res) => {
  const { userId, lat, lng, tracks: tracksJson } = req.query;
  const user = getUser(userId || "guest");
  const userLocation = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
  const hour = new Date().getHours();
  const timeBucket = getTimeBucket(hour);
  let tracks = [];
  try { tracks = JSON.parse(tracksJson || "[]"); } catch {}

  const scored = tracks.map((track, i) => {
    const { score, reason } = scoreTrack(track, user.prefs, userLocation, timeBucket);
    return { ...track, score, reason };
  }).sort((a, b) => b.score - a.score);

  res.json({ timeBucket, tracks: scored });
});

// 잠금 해제 기록 + 포인트 지급
app.post("/api/unlock", (req, res) => {
  const { userId, trackId } = req.body;
  const user = getUser(userId || "guest");
  if (!user.unlocked.includes(trackId)) {
    user.unlocked.push(trackId);
    user.keys += 5;
    store.metrics.unlocks += 1;
    store.metrics.discoveries += 1;
  }
  res.json({ ok: true, keys: user.keys, metrics: store.metrics });
});

// 리뷰 저장 + 품질 점수 계산 + 포인트
app.post("/api/review", (req, res) => {
  const { userId, trackId, text, feedbackType, tags } = req.body;
  const user = getUser(userId || "guest");

  let quality = 0;
  if (text && text.length >= 80) quality += 20;
  if (text && /분위기|잔잔|밤|감성|보컬|사운드/.test(text)) quality += 20;
  if (text && /장소|카페|공간|거리|서점|공원/.test(text)) quality += 20;
  if (text && /추천|사람|친구|어울/.test(text)) quality += 20;
  if (text && /아쉬|다만|좋았|기억|후반/.test(text)) quality += 20;

  const reward = quality >= 80 ? 30 : quality >= 60 ? 20 : quality >= 40 ? 15 : 10;

  if (!user.reviewed.includes(trackId)) {
    user.reviewed.push(trackId);
    user.keys += reward;
    store.metrics.reviews += 1;
    store.reviews.push({ userId, trackId, text, feedbackType, tags, quality, reward });
  }

  res.json({ ok: true, quality, reward, keys: user.keys, metrics: store.metrics });
});

// 포인트 사용
app.post("/api/spend", (req, res) => {
  const { userId, amount, purpose } = req.body;
  const user = getUser(userId || "guest");
  if (user.keys < amount) return res.json({ ok: false, message: "포인트 부족" });
  user.keys -= amount;
  if (purpose === "booking") store.metrics.bookings += 1;
  res.json({ ok: true, keys: user.keys, metrics: store.metrics });
});

// 크리에이터 대시보드
app.get("/api/creator/dashboard", (req, res) => {
  res.json({ metrics: store.metrics });
});

app.listen(4173, "127.0.0.1", () => {
  console.log("Where Indi running at http://127.0.0.1:4173");
});
