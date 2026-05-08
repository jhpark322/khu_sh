const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function express() {
  const routes = [];
  const middlewares = [];
  let staticRoot = null;

  function decorateResponse(res) {
    res.set = (name, value) => {
      res.setHeader(name, value);
      return res;
    };
    res.status = (statusCode) => {
      res.statusCode = statusCode;
      return res;
    };
    res.json = (payload) => {
      if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    };
  }

  function parseBody(req) {
    if (req.method === "GET" || req.method === "HEAD") return Promise.resolve({});

    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy();
      });
      req.on("end", () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
      req.on("error", () => resolve({}));
    });
  }

  function serveStatic(req, res) {
    if (!staticRoot || (req.method !== "GET" && req.method !== "HEAD")) return false;

    const root = path.resolve(staticRoot);
    const requestPath = req.path === "/" ? "/index.html" : req.path;
    const filePath = path.resolve(root, `.${decodeURIComponent(requestPath)}`);
    const normalizedRoot = root.toLowerCase();
    const normalizedFile = filePath.toLowerCase();

    if (normalizedFile !== normalizedRoot && !normalizedFile.startsWith(`${normalizedRoot}${path.sep}`)) {
      res.statusCode = 404;
      res.end("Not found");
      return true;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end("Not found");
      return true;
    }

    res.setHeader("Content-Type", MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    if (req.method === "HEAD") return res.end(), true;
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  async function handleRequest(req, res) {
    try {
      decorateResponse(res);
      const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      req.path = parsedUrl.pathname;
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      req.body = await parseBody(req);

      for (const middleware of middlewares) {
        await new Promise((resolve, reject) => {
          try {
            middleware(req, res, (err) => err ? reject(err) : resolve());
          } catch (error) {
            reject(error);
          }
        });
        if (res.writableEnded) return;
      }

      const route = routes.find((item) => item.method === req.method && item.path === req.path);
      if (route) {
        await route.handler(req, res);
        return;
      }

      if (serveStatic(req, res)) return;
      res.statusCode = 404;
      res.end("Not found");
    } catch (error) {
      console.error("Server error:", error);
      if (!res.headersSent) res.statusCode = 500;
      res.end("Internal server error");
    }
  }

  return {
    use(middleware) {
      if (middleware?.staticRoot) {
        staticRoot = middleware.staticRoot;
        return;
      }
      middlewares.push(middleware);
    },
    set() {},
    get(routePath, handler) {
      routes.push({ method: "GET", path: routePath, handler });
    },
    post(routePath, handler) {
      routes.push({ method: "POST", path: routePath, handler });
    },
    listen(port, host, callback) {
      return http.createServer(handleRequest).listen(port, host, callback);
    }
  };
}

express.json = () => (_req, _res, next) => next();
express.static = (root) => {
  const middleware = (_req, _res, next) => next();
  middleware.staticRoot = root;
  return middleware;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = GEMINI_API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  : "";

async function callGemini(prompt, { maxTokens = 200 } = {}) {
  if (!GEMINI_API_KEY) return "";

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
  next();
});
app.use(express.static(path.join(__dirname), { etag: false, lastModified: false, maxAge: 0 }));

// ── In-memory store ──────────────────────────────────────────────
const store = {
  users: {},
  reviews: [],
  metrics: { discoveries: 120, unlocks: 86, reviews: 28, support: 9 }
};

function getUser(userId) {
  if (!store.users[userId]) {
    store.users[userId] = {
      prefs: { genres: ["indie"], moods: ["잔잔함", "밤"] },
      keys: 25,
      unlocked: [],
      reviewed: [],
      listenRewards: [],
      playHistory: [],    // [trackTitle, ...] 최근 재생 순서
      likedTracks: [],    // 긍정 피드백 트랙
      dislikedTracks: []  // 부정 피드백 트랙
    };
  }
  return store.users[userId];
}

// ── PCA Recommendation Engine ─────────────────────────────────────

const ALL_GENRES  = ["indie", "acoustic", "lofi", "ambient", "folk", "jazz", "electronic", "pop", "rock"];
const ALL_MOODS   = ["잔잔함", "밤", "청춘", "로파이", "감성", "활기", "청량", "산책", "이별", "집중", "몽환", "설렘"];
const ALL_TIMES   = ["morning", "afternoon", "evening", "night"];
const ALL_PLACES  = ["국제캠 정문 앞", "중앙도서관", "노천극장", "학생회관 앞", "푸른솔문화관", "외대 광장"];
// 특수 조건 4개: energy, calm, novelty, social
const EXTRA_DIMS  = 4;
const DIMS = ALL_GENRES.length + ALL_MOODS.length + ALL_TIMES.length + ALL_PLACES.length + EXTRA_DIMS;

const PLACE_TAGS = {
  "국제캠 정문 앞": ["카페", "조용함", "밤", "야경", "indie"],
  "중앙도서관":     ["조용함", "오후", "독서", "로파이", "lofi", "집중"],
  "노천극장":       ["야외", "청춘", "공연", "활기", "밴드"],
  "학생회관 앞":    ["청춘", "낮", "활기", "캠퍼스", "acoustic"],
  "푸른솔문화관":   ["문화", "공연", "저녁", "밴드", "감성"],
  "외대 광장":      ["산책", "여유", "오후", "잔잔함", "folk"]
};

const PLACE_TIME_AFFINITY = {
  "국제캠 정문 앞": ["evening", "night"],
  "중앙도서관":     ["morning", "afternoon"],
  "노천극장":       ["evening", "afternoon"],
  "학생회관 앞":    ["afternoon", "morning"],
  "푸른솔문화관":   ["evening", "night"],
  "외대 광장":      ["morning", "afternoon"]
};

const TIME_MOODS = {
  morning:   ["청량", "산책", "아침", "acoustic", "folk"],
  afternoon: ["로파이", "lofi", "집중", "ambient", "indie"],
  evening:   ["잔잔함", "밤", "감성", "indie", "acoustic"],
  night:     ["밤", "이별", "몽환", "lofi", "잔잔함"]
};

function getTimeBucket(hour) {
  if (hour >= 6  && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Feature Vectorization ─────────────────────────────────────────

function encodeTrack(track) {
  const vec = new Array(DIMS).fill(0);
  const tags = (track.tags || []).map(t => t.toLowerCase());

  // Genre (0..8)
  ALL_GENRES.forEach((g, i) => {
    if (tags.some(t => t.includes(g) || g.includes(t))) vec[i] = 1;
  });

  // Mood (9..20)
  const moodOffset = ALL_GENRES.length;
  ALL_MOODS.forEach((m, i) => {
    if (tags.some(t => t.includes(m) || m.includes(t))) vec[moodOffset + i] = 1;
  });

  // Time from place affinity (21..24)
  const timeOffset = moodOffset + ALL_MOODS.length;
  const timePref = PLACE_TIME_AFFINITY[track.place] || [];
  ALL_TIMES.forEach((t, i) => { vec[timeOffset + i] = timePref.includes(t) ? 1 : 0; });

  // Place one-hot (25..30)
  const placeOffset = timeOffset + ALL_TIMES.length;
  const pi = ALL_PLACES.indexOf(track.place);
  if (pi >= 0) vec[placeOffset + pi] = 1;

  // Extra dims
  const extra = placeOffset + ALL_PLACES.length;
  const energyTags = ["활기", "청춘", "밴드", "신나", "rock", "electronic"];
  const calmTags   = ["잔잔함", "로파이", "lofi", "조용함", "ambient", "집중"];
  vec[extra + 0] = tags.some(t => energyTags.some(e => t.includes(e))) ? 1 : 0; // energy
  vec[extra + 1] = tags.some(t => calmTags.some(c => t.includes(c))) ? 1 : 0;   // calm
  vec[extra + 2] = 1; // novelty default (adjusted per user at scoring time)
  vec[extra + 3] = 0.5; // social proof (uniform)

  return vec;
}

function encodeUser(prefs, likedTracks = [], dislikedTracks = []) {
  const vec = new Array(DIMS).fill(0);
  const hour = new Date().getHours();

  // Genres
  prefs.genres.forEach(g => {
    const i = ALL_GENRES.findIndex(ag => ag === g.toLowerCase() || ag.includes(g.toLowerCase()));
    if (i >= 0) vec[i] = 1;
  });

  // Moods
  const moodOffset = ALL_GENRES.length;
  prefs.moods.forEach(m => {
    const i = ALL_MOODS.findIndex(am => am === m || am.includes(m) || m.includes(am));
    if (i >= 0) vec[moodOffset + i] = 1;
  });

  // Time preference
  const timeOffset = moodOffset + ALL_MOODS.length;
  const bucket = getTimeBucket(hour);
  const ti = ALL_TIMES.indexOf(bucket);
  if (ti >= 0) vec[timeOffset + ti] = 1;

  // Extra: energy/calm from moods
  const extra = timeOffset + ALL_TIMES.length + ALL_PLACES.length;
  const energyMoods = ["활기", "청춘"];
  const calmMoods   = ["잔잔함", "로파이", "집중"];
  vec[extra + 0] = prefs.moods.some(m => energyMoods.includes(m)) ? 1 : 0;
  vec[extra + 1] = prefs.moods.some(m => calmMoods.includes(m)) ? 1 : 0;

  // Boost from liked tracks
  likedTracks.forEach(lt => {
    const lv = encodeTrack(lt);
    lv.forEach((v, i) => { vec[i] = Math.min(1, vec[i] + v * 0.3); });
  });

  // Suppress from disliked tracks
  dislikedTracks.forEach(dt => {
    const dv = encodeTrack(dt);
    dv.forEach((v, i) => { vec[i] = Math.max(0, vec[i] - v * 0.2); });
  });

  return vec;
}

// ── Pure-JS PCA (power iteration) ────────────────────────────────

function vecDot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function vecNorm(v) { return Math.sqrt(vecDot(v, v)); }
function vecNormalize(v) { const n = vecNorm(v) || 1; return v.map(x => x / n); }
function cosineSim(a, b) { return vecDot(a, b) / ((vecNorm(a) * vecNorm(b)) || 1e-8); }

function computePCA(matrix, k = 4, iters = 60) {
  const n = matrix.length, d = matrix[0]?.length || 0;
  if (n < 2 || d === 0) return null;

  // Center
  const means = Array.from({length: d}, (_, j) =>
    matrix.reduce((s, r) => s + r[j], 0) / n
  );
  let X = matrix.map(row => row.map((v, j) => v - means[j]));

  const components = [];
  for (let c = 0; c < Math.min(k, d, n - 1); c++) {
    // Random init, seeded by component index for reproducibility
    let ev = Array.from({length: d}, (_, i) => Math.sin(i * (c + 1) * 0.7));
    ev = vecNormalize(ev);

    for (let it = 0; it < iters; it++) {
      // v ← X^T (X v), normalized
      const Xv = X.map(row => vecDot(row, ev));
      ev = Array.from({length: d}, (_, j) => X.reduce((s, row, i) => s + row[j] * Xv[i], 0));
      ev = vecNormalize(ev);
    }
    components.push(ev);

    // Deflate (remove this component from X)
    const proj = X.map(row => vecDot(row, ev));
    X = X.map((row, i) => row.map((v, j) => v - proj[i] * ev[j]));
  }

  return { components, means };
}

function projectPCA(vec, pca) {
  const centered = vec.map((v, i) => v - pca.means[i]);
  return pca.components.map(pc => vecDot(centered, pc));
}

// ── Multi-condition Scoring ───────────────────────────────────────

function scoreTrackML(track, user, userLocation, timeBucket, pca, userProj, opts = {}) {
  let score = 0;
  const factors = [];
  const match = {
    pcaSimilarity: null,
    pcaScore: 0,
    distanceScore: 0,
    timeMatch: false,
    placeMatch: false,
    noveltyScore: 0,
    diversityScore: 0,
    feedbackScore: 0,
    factors
  };

  const trackTags = (track.tags || []).map(t => t.toLowerCase());
  const timeTags  = TIME_MOODS[timeBucket] || [];

  // 1. PCA cosine similarity (35점) — core preference match
  if (pca && userProj) {
    const trackVec  = encodeTrack(track);
    const trackProj = projectPCA(trackVec, pca);
    const sim = cosineSim(userProj, trackProj);
    const pcaScore = Math.max(0, sim) * 35;
    score += pcaScore;
    match.pcaSimilarity = Number(sim.toFixed(3));
    match.pcaScore = Math.round(pcaScore);
    if (sim > 0.7) factors.push("취향과 거의 완벽히 일치");
    else if (sim > 0.4) factors.push("취향과 잘 맞음");
  }

  // 2. GPS 근접도 (20점)
  if (userLocation && track.coords) {
    const dist = haversine(userLocation.lat, userLocation.lng, track.coords.lat, track.coords.lng);
    const distScore = Math.max(0, 20 - Math.floor(dist / 50));
    score += distScore;
    match.distanceScore = distScore;
    track._dist = Math.round(dist);
    if (dist < 80)  factors.push(`${Math.round(dist)}m 바로 앞`);
    else if (dist < 400) factors.push(`도보 ${Math.round(dist / 80)}분`);
  } else {
    score += 10;
    match.distanceScore = 10;
  }

  // 3. 시간대 분위기 정합성 (15점)
  const timeHits = trackTags.filter(t => timeTags.some(tt => t.includes(tt) || tt.includes(t)));
  if (timeHits.length > 0) {
    score += 15;
    match.timeMatch = true;
    const timeKr = { morning:"아침", afternoon:"오후", evening:"저녁", night:"밤" }[timeBucket];
    factors.push(`${timeKr} 감성과 딱`);
  } else {
    score += 5;
  }

  // 4. 장소 분위기 일치 (10점)
  const placeTags = PLACE_TAGS[track.place] || [];
  const placeHits = placeTags.filter(t => timeTags.some(tt => t.includes(tt) || tt.includes(t)));
  if (placeHits.length > 0) {
    score += 10;
    match.placeMatch = true;
  }

  // 5. 신선도 / 노블티 (8점) — 최근 들은 트랙 패널티
  const recentPlays = opts.playHistory || [];
  const playCount = recentPlays.filter(t => t === track.title).length;
  match.noveltyScore = Math.max(0, 8 - playCount * 4);
  score += match.noveltyScore;
  if (playCount === 0) factors.push("아직 못 들은 트랙");

  // 6. 아티스트 다양성 (5점) — 최근 2곡과 같은 아티스트 패널티
  const lastTwo = recentPlays.slice(-2);
  if (!lastTwo.includes(track.artist)) {
    match.diversityScore = 5;
    score += 5;
  }

  // 7. 긍정/부정 피드백 반영 (7점)
  const liked    = (opts.likedTracks    || []).map(t => t.title);
  const disliked = (opts.dislikedTracks || []).map(t => t.title);
  if (liked.includes(track.title)) {
    match.feedbackScore += 7;
    score += 7;
  }
  if (disliked.includes(track.title)) {
    match.feedbackScore -= 10;
    score -= 10;
  }

  const reason = factors.slice(0, 2).join(" · ") || "인디 취향에 어울리는 곡";
  return { score: Math.min(99, Math.max(0, Math.round(score))), reason, match };
}

// ── API Routes ────────────────────────────────────────────────────

// 취향 저장
app.post("/api/user/prefs", (req, res) => {
  const { userId, genres, moods } = req.body;
  const user = getUser(userId || "guest");
  if (genres) user.prefs.genres = genres;
  if (moods)  user.prefs.moods  = moods;
  res.json({ ok: true, prefs: user.prefs });
});

// PCA 기반 추천
app.get("/api/recommend", (req, res) => {
  const { userId, lat, lng, tracks: tracksJson } = req.query;
  const user = getUser(userId || "guest");
  const userLocation = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
  const hour = new Date().getHours();
  const timeBucket = getTimeBucket(hour);

  let tracks = [];
  try { tracks = JSON.parse(tracksJson || "[]"); } catch {}
  if (!tracks.length) return res.json({ timeBucket, tracks: [] });

  // Build feature matrix & run PCA
  const trackVecs = tracks.map(encodeTrack);
  const pca = trackVecs.length >= 2 ? computePCA(trackVecs) : null;

  // User vector & projection
  const userVec  = encodeUser(user.prefs, user.likedTracks, user.dislikedTracks);
  const userProj = pca ? projectPCA(userVec, pca) : null;

  const opts = {
    playHistory:    user.playHistory,
    likedTracks:    user.likedTracks,
    dislikedTracks: user.dislikedTracks
  };

  const scored = tracks
    .map(track => {
      const { score, reason, match } = scoreTrackML(track, user, userLocation, timeBucket, pca, userProj, opts);
      return {
        ...track,
        score,
        reason,
        match: {
          ...match,
          pcaComponents: pca?.components.length || 0,
          timeBucket
        }
      };
    })
    .sort((a, b) => b.score - a.score);

  res.json({ timeBucket, tracks: scored, pcaComponents: pca?.components.length || 0 });
});

// 재생 이력 기록
app.post("/api/play", (req, res) => {
  const { userId, trackTitle, artist } = req.body;
  const user = getUser(userId || "guest");
  user.playHistory.push(trackTitle);
  if (user.playHistory.length > 20) user.playHistory.shift(); // 최근 20개만
  store.metrics.discoveries += 1;
  res.json({ ok: true });
});

// 70% 이상 감상 리워드
app.post("/api/listen-reward", (req, res) => {
  const { userId, trackId, trackTitle, percent } = req.body;
  const user = getUser(userId || "guest");
  const id = trackId || trackTitle;
  const listenedPercent = Number(percent || 0);

  if (!id) return res.json({ ok: false, message: "트랙 정보가 없습니다." });
  if (listenedPercent < 70) {
    return res.json({ ok: false, message: "70% 이상 들어야 인디코인이 지급됩니다." });
  }
  if (user.listenRewards.includes(id)) {
    return res.json({ ok: false, alreadyRewarded: true, keys: user.keys, reward: 0 });
  }

  user.listenRewards.push(id);
  user.keys += 10;
  store.metrics.unlocks += 1;
  res.json({ ok: true, reward: 10, keys: user.keys, metrics: store.metrics });
});

// Gemini: PCA 추천 결과를 사용자 언어로 설명
app.post("/api/ai-reasons", async (req, res) => {
  const { userId, tracks, lat, lng } = req.body;
  const user = getUser(userId || "guest");
  const hour = new Date().getHours();
  const timeKr = { morning:"아침", afternoon:"오후", evening:"저녁", night:"밤" }[getTimeBucket(hour)];

  if (!Array.isArray(tracks) || !tracks.length) return res.json({ tracks: [] });

  const trackList = tracks.slice(0, 6).map((t, i) => {
    const match = t.match || {};
    const factors = Array.isArray(match.factors) ? match.factors.join(" / ") : (t.reason || "");
    return `${i+1}. "${t.title}" - ${t.artist}
   점수 ${t.score || "?"}, PCA유사도 ${match.pcaSimilarity ?? "n/a"}, PCA점수 ${match.pcaScore ?? "n/a"}, GPS점수 ${match.distanceScore ?? "n/a"}, 시간매치 ${match.timeMatch ? "yes" : "no"}, 장소매치 ${match.placeMatch ? "yes" : "no"}, 요인 ${factors}, 태그 ${(t.tags||[]).join(", ")}`;
  }).join("\n");

  const prompt = `당신은 경희대 국제캠퍼스 인디뮤직 앱의 추천 설명 LLM입니다.
추천 자체는 이미 PCA 기반 추천 엔진이 계산했습니다. 당신은 새 추천을 만들지 말고, 아래 PCA/룰 점수 결과를 사람이 듣고 싶어지게 설명만 합니다.
사용자 취향 — 장르: ${user.prefs.genres.join(", ")}, 분위기: ${user.prefs.moods.join(", ")}
현재 시간대: ${timeKr}
${lat && lng ? "현재 위치: 경희대 국제캠퍼스" : ""}

각 트랙에 대해 PCA 취향 유사도, 위치, 시간대, 장소 분위기 중 핵심 1~2개를 녹여서 한 줄(35자 이내)로 설명해줘.
${trackList}

JSON만 반환 (다른 말 금지):
[{"i":1,"reason":"..."},{"i":2,"reason":"..."}]`;

  const text = await callGemini(prompt, { maxTokens: 500 });
  let reasons = [];
  try { reasons = JSON.parse((text.match(/\[[\s\S]*\]/) || [text])[0]); } catch {}

  const enriched = tracks.map((t, idx) => {
    const found = reasons.find(r => r.i === idx + 1);
    return found?.reason ? { ...t, reason: found.reason } : t;
  });
  res.json({ tracks: enriched });
});

// GPS 장소 진입 → Gemini 추천
app.post("/api/place-vibe", async (req, res) => {
  const { userId, place, tracks } = req.body;
  const user = getUser(userId || "guest");
  const timeKr = { morning:"아침", afternoon:"오후", evening:"저녁", night:"밤" }[getTimeBucket(new Date().getHours())];

  const trackList = (tracks||[]).slice(0, 8).map((t, i) =>
    `${i+1}. "${t.title}" - ${t.artist} [${(t.tags||[]).join(", ")}]`
  ).join("\n");

  const prompt = `사용자가 경희대 국제캠퍼스 "${place}"에 도착했습니다.
시간대: ${timeKr} / 취향: ${user.prefs.genres.join(", ")} / ${user.prefs.moods.join(", ")}

후보 트랙:
${trackList}

가장 어울리는 트랙 1개를 골라 JSON 반환:
{"i":번호,"vibe":"장소 감성 한 줄(30자 이내)","reason":"선택 이유(30자 이내)"}`;

  const text = await callGemini(prompt, { maxTokens: 250 });
  let pick = null;
  try { pick = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]); } catch {}

  const idx = (pick?.i || 1) - 1;
  const track = (tracks||[])[idx] || (tracks||[])[0];
  res.json({ place, track, vibe: pick?.vibe || `${place}의 인디 한 곡`, reason: pick?.reason || "" });
});

// 잠금 해제
app.post("/api/unlock", (req, res) => {
  const { userId, trackId } = req.body;
  const user = getUser(userId || "guest");
  if (!user.unlocked.includes(trackId)) {
    user.unlocked.push(trackId);
    store.metrics.unlocks += 1;
    store.metrics.discoveries += 1;
  }
  res.json({ ok: true, keys: user.keys, metrics: store.metrics });
});

// 별점 저장 + 피드백 학습
app.post("/api/review", (req, res) => {
  const { userId, trackId, trackObj, text, feedbackType, tags, rating } = req.body;
  const user = getUser(userId || "guest");

  // 피드백 학습: liked/disliked 리스트 업데이트
  if (feedbackType === "recommend" && trackObj) {
    if (!user.likedTracks.find(t => t.title === trackObj.title)) {
      user.likedTracks.push(trackObj);
    }
  } else if (feedbackType === "not-recommend" && trackObj) {
    if (!user.dislikedTracks.find(t => t.title === trackObj.title)) {
      user.dislikedTracks.push(trackObj);
    }
  }

  const starRating = Number(rating || 0);
  let quality = 0;
  let reward = 10;

  if (starRating > 0) {
    quality = Math.min(100, Math.max(20, starRating * 20));
    reward = starRating >= 5 ? 20 : starRating >= 4 ? 15 : 10;
  } else {
    // 긴 텍스트 리뷰를 보내는 구버전 클라이언트 대응
    if (text && text.length >= 80) quality += 20;
    if (text && /분위기|잔잔|밤|감성|보컬|사운드/.test(text)) quality += 20;
    if (text && /장소|카페|공간|거리|도서관|캠퍼스/.test(text)) quality += 20;
    if (text && /추천|사람|친구|어울/.test(text)) quality += 20;
    if (text && /아쉬|다만|좋았|기억|후반/.test(text)) quality += 20;
    reward = quality >= 80 ? 30 : quality >= 60 ? 20 : quality >= 40 ? 15 : 10;
  }

  if (!user.reviewed.includes(trackId)) {
    user.reviewed.push(trackId);
    user.keys += reward;
    store.metrics.reviews += 1;
    store.reviews.push({ userId, trackId, text, feedbackType, tags, rating: starRating, quality, reward });
  }

  res.json({ ok: true, quality, reward, keys: user.keys, metrics: store.metrics });
});

// 인디코인 사용
app.post("/api/spend", (req, res) => {
  const { userId, amount, purpose } = req.body;
  const user = getUser(userId || "guest");
  if (user.keys < amount) return res.json({ ok: false, message: "인디코인이 부족합니다." });
  user.keys -= amount;
  if (purpose === "donate" || purpose === "merch") store.metrics.support += 1;
  res.json({
    ok: true,
    keys: user.keys,
    metrics: store.metrics
  });
});

// 크리에이터 대시보드
app.get("/api/creator/dashboard", (req, res) => {
  res.json({ metrics: store.metrics });
});

app.listen(4173, "0.0.0.0", () => {
  console.log("Where Indi running at http://127.0.0.1:4173");
});
