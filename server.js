const express = require("express");
const path = require("path");

const GEMINI_API_KEY = "AIzaSyAxIi7qUITYaEGfXA4YC0UyWOtXPE_0GT4";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function callGemini(prompt, { maxTokens = 200 } = {}) {
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
      })
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } catch (e) {
    console.error("Gemini error:", e.message);
    return "";
  }
}

const app = express();
app.use(express.json());
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname), { etag: false, lastModified: false, maxAge: 0 }));

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
  "국제캠 정문 앞": ["카페", "조용함", "밤", "야경"],
  "중앙도서관": ["조용함", "오후", "독서", "로파이"],
  "노천극장": ["야외", "청춘", "공연", "활기"],
  "학생회관 앞": ["청춘", "낮", "활기", "캠퍼스"],
  "푸른솔문화관": ["문화", "공연", "저녁", "밴드"],
  "외대 광장": ["산책", "여유", "오후", "잔잔함"]
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

// 취향 기반 추천 (rule-based)
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

// Gemini 기반 AI 추천 이유 생성
app.post("/api/ai-reasons", async (req, res) => {
  const { userId, tracks, lat, lng } = req.body;
  const user = getUser(userId || "guest");
  const hour = new Date().getHours();
  const timeBucket = getTimeBucket(hour);
  const timeKr = { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" }[timeBucket];

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.json({ tracks: [] });
  }

  const trackList = tracks.slice(0, 6).map((t, i) =>
    `${i + 1}. "${t.title}" - ${t.artist} (장소: ${t.place || "캠퍼스"}, 태그: ${(t.tags || []).join(", ")})`
  ).join("\n");

  const prompt = `당신은 위치 기반 인디뮤직 추천 큐레이터입니다.
사용자 취향: 장르 ${user.prefs.genres.join(", ")}, 분위기 ${user.prefs.moods.join(", ")}
지금 시간대: ${timeKr}
${lat && lng ? `현재 위치: 경희대 캠퍼스 근처` : ""}

다음 트랙들 각각에 대해 "왜 지금 이 사용자에게 어울리는지" 한 줄(25자 이내)로 감성적으로 설명해줘.
${trackList}

응답 형식 (JSON만, 다른 말 금지):
[{"i":1,"reason":"..."},{"i":2,"reason":"..."}, ...]`;

  const text = await callGemini(prompt, { maxTokens: 600 });
  let reasons = [];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    reasons = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {}

  const enriched = tracks.map((t, idx) => {
    const found = reasons.find(r => r.i === idx + 1);
    return found?.reason ? { ...t, reason: found.reason } : t;
  });

  res.json({ tracks: enriched });
});

// 특정 장소에 도착했을 때 Gemini가 그 장소 분위기에 맞는 추천 생성
app.post("/api/place-vibe", async (req, res) => {
  const { userId, place, tracks } = req.body;
  const user = getUser(userId || "guest");
  const hour = new Date().getHours();
  const timeKr = { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" }[getTimeBucket(hour)];

  const trackList = (tracks || []).slice(0, 8).map((t, i) =>
    `${i + 1}. "${t.title}" - ${t.artist} [${(t.tags || []).join(", ")}]`
  ).join("\n");

  const prompt = `당신은 장소 큐레이터입니다.
사용자가 방금 "${place}"에 도착했습니다.
시간대: ${timeKr}
사용자 취향: ${user.prefs.genres.join(", ")} / ${user.prefs.moods.join(", ")}

후보 트랙:
${trackList}

위 후보 중 이 장소·시간·취향에 가장 어울리는 트랙 1개를 골라 i 번호와 한 문장(40자 이내) 추천 이유를 JSON으로 반환.
형식: {"i":번호,"vibe":"한 줄 메시지","reason":"선택 이유"}
다른 말 금지.`;

  const text = await callGemini(prompt, { maxTokens: 300 });
  let pick = null;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    pick = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {}

  const idx = pick?.i ? pick.i - 1 : 0;
  const track = (tracks || [])[idx] || (tracks || [])[0];
  res.json({
    place,
    track,
    vibe: pick?.vibe || `${place}에 어울리는 인디 한 곡`,
    reason: pick?.reason || ""
  });
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
