const demoTracks = [
  {
    title: "밤 산책",
    artist: "Blue Room",
    place: "국제캠 정문 앞",
    distance: 18,
    score: 87,
    tags: ["잔잔함", "밤", "산책"],
    coords: { lat: 37.2412, lng: 127.0795 },
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "자주 지나는 카페거리와 가까우며, 저녁 시간대와 잔잔한 인디 취향이 잘 맞습니다."
  },
  {
    title: "여름의 계단",
    artist: "Small Wave",
    place: "노천극장",
    distance: 42,
    score: 79,
    tags: ["청춘", "밴드", "캠퍼스"],
    coords: { lat: 37.2433, lng: 127.0795 },
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "축제 분위기의 중앙광장과 청춘 밴드 사운드가 잘 맞습니다."
  },
  {
    title: "오래된 책갈피",
    artist: "Noon Archive",
    place: "중앙도서관",
    distance: 71,
    score: 82,
    tags: ["로파이", "독서", "오후"],
    coords: { lat: 37.2424, lng: 127.0807 },
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "조용한 독립서점 분위기와 로파이 질감이 잘 어울립니다."
  }
];

// 세션마다 새로 생성 (새로고침하면 온보딩 다시)
const USER_ID = "u_" + Math.random().toString(36).slice(2, 9);

const state = {
  keys: 25,
  unlocked: false,
  listened: false,
  reviewed: false,
  discountApplied: false,
  listenedTrackIds: new Set(),
  pendingListenRewards: new Set(),
  playHistory: [],
  playedLocations: [],
  heardTracks: [],
  visitedPlaces: {},
  simulatedTimer: null,
  simulatedProgress: 0,
  promptedPlaces: {},
  onboardingComplete: false,
  backgroundDemoNotificationSent: false,
  activeTrack: 0,
  activeTag: "indie",
  tracks: demoTracks,
  kakaoMap: null,
  kakaoMarkers: [],
  kakaoMapReady: false,
  kakaoUserMarker: null,
  userLocation: null,
  geoWatchId: null,
  metrics: { discoveries: 120, unlocks: 86, reviews: 28, support: 9 }
};

// ── API helpers ───────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(path, opts);
    return res.json();
  } catch { return null; }
}

async function applyRecommendScores() {
  if (!state.tracks.length) return;
  const params = new URLSearchParams({ userId: USER_ID, tracks: JSON.stringify(state.tracks) });
  if (state.userLocation) {
    params.set("lat", state.userLocation.lat);
    params.set("lng", state.userLocation.lng);
  }
  const data = await api("GET", `/api/recommend?${params}`);
  if (data?.tracks) {
    state.tracks = data.tracks;
    renderTrackGrid();
    renderSelectedTrack();
  }
}

function showPointsToast(amount) {
  const toast = document.createElement("div");
  toast.className = "points-toast";
  toast.textContent = `+${amount} IC`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("pop"));
  setTimeout(() => toast.remove(), 1800);
}

const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav-button");
const keyBalance = document.querySelector("#keyBalance");
const keyBalance2 = document.querySelector("#keyBalance2");
const passText = document.querySelector("#passText");
const listenProgress = document.querySelector("#listenProgress");
const currentTimeText = document.querySelector("#currentTimeText");
const durationText = document.querySelector("#durationText");
const ratingResult = document.querySelector("#ratingResult");
const walletMessage = document.querySelector("#walletMessage");
const apiStatus = document.querySelector("#apiStatus");
const audioPlayer = document.querySelector("#audioPlayer");
const kakaoMapContainer = document.querySelector("#kakaoMap");
const mapCanvas = document.querySelector(".map-full");
const playedSongLayer = document.querySelector("#playedSongLayer");
const mapPlacePanel = document.querySelector("#mapPlacePanel");
const mapPlaceTitle = document.querySelector("#mapPlaceTitle");
const mapPlaceTrackList = document.querySelector("#mapPlaceTrackList");

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  const phoneApp = document.querySelector(".phone-app");
  if (phoneApp) phoneApp.dataset.view = id;
  if (id === "map") {
    startGeolocation();
    if (state.kakaoMapReady) requestAnimationFrame(renderKakaoMap);
    renderPlayHistory();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function trackKey(track) {
  return `${track?.title || "track"}::${track?.artist || "artist"}`;
}

function syncListenStateForActiveTrack() {
  state.listened = state.listenedTrackIds.has(trackKey(currentTrack()));
  if (listenProgress) listenProgress.style.width = state.listened ? "72%" : "0";
}

function updateKeys() {
  const label = `${state.keys} IC`;
  if (keyBalance) keyBalance.textContent = label;
  if (keyBalance2) keyBalance2.textContent = label;
}

function updateMetrics() {
  document.querySelector("#metricDiscoveries").textContent = state.metrics.discoveries;
  document.querySelector("#metricUnlocks").textContent = state.metrics.unlocks;
  document.querySelector("#metricReviews").textContent = state.metrics.reviews;
  document.querySelector("#metricSupport").textContent = state.metrics.support;
}

function currentTrack() {
  return state.tracks[state.activeTrack] || state.tracks[0];
}

// 경희대 국제캠퍼스 (용인 기흥) 좌표
const placeCoords = [
  { lat: 37.2412, lng: 127.0795 }, // 정문 앞
  { lat: 37.2424, lng: 127.0807 }, // 중앙도서관
  { lat: 37.2433, lng: 127.0795 }, // 노천극장
  { lat: 37.2420, lng: 127.0820 }, // 학생회관
  { lat: 37.2438, lng: 127.0815 }, // 외대 앞
  { lat: 37.2415, lng: 127.0810 }  // 푸른솔
];

const demoUserLocation = { lat: 37.24185, lng: 127.08025 };
const demoSeedPlaceName = "내 위치 데모 구역";

function mapUserLocation() {
  return state.userLocation || demoUserLocation;
}

function coordsForTrack(track, index = state.activeTrack) {
  return track.coords || placeCoords[index % placeCoords.length];
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function updatePlayerTime(current = 0, duration = 0) {
  if (currentTimeText) currentTimeText.textContent = formatTime(current);
  if (durationText) durationText.textContent = formatTime(duration);
}

function getTimeBucket(hour) {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function recommendationReason(track) {
  if (!track) return "";
  if (track.reason && !/[�]/.test(track.reason)) return track.reason;
  const tags = (track.tags || []).slice(0, 2).join(", ") || "인디";
  return `${track.place} 주변 분위기와 ${tags} 취향이 맞아서 추천했어요.`;
}

function timeLabel() {
  const bucket = getTimeBucket(new Date().getHours());
  return {
    morning: "아침",
    afternoon: "오후",
    evening: "저녁",
    night: "밤"
  }[bucket] || "지금";
}

function recommendationFactors(track, placeOverride = "") {
  const tags = (track?.tags || []).filter(Boolean).slice(0, 2);
  return [
    { label: "장소", value: placeOverride || track?.place || "현재 위치" },
    { label: "취향", value: tags.length ? tags.join(", ") : state.activeTag || "indie" },
    { label: "시간", value: `${timeLabel()} 시간대` },
    { label: "거리", value: `${Math.round(track?.distance || 0)}m 근처` }
  ];
}

function recommendationFactorHtml(track, placeOverride = "") {
  return `
    <span class="recommend-factor-list" aria-label="추천 고려 요소">
      ${recommendationFactors(track, placeOverride).map(item => `
        <span><b>${escapeHtml(item.label)}</b>${escapeHtml(item.value)}</span>
      `).join("")}
    </span>
  `;
}

function nearestPlace(lat, lng) {
  if (!Array.isArray(PLACES) || !PLACES.length) return null;
  return PLACES
    .map(place => ({ ...place, distance: getDistanceMeters(lat, lng, place.lat, place.lng) }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function placeForTrack(track) {
  const coords = coordsForTrack(track);
  const place = nearestPlace(coords.lat, coords.lng);
  return place || { name: track.place || "음악 구역", lat: coords.lat, lng: coords.lng, distance: 0 };
}

function saveListeningMemory() {
  localStorage.setItem("whereIndiListeningMemory", JSON.stringify({
    playHistory: state.playHistory,
    playedLocations: state.playedLocations,
    heardTracks: state.heardTracks,
    visitedPlaces: state.visitedPlaces
  }));
}

function restoreListeningMemory() {
  try {
    const saved = JSON.parse(localStorage.getItem("whereIndiListeningMemory") || "{}");
    if (Array.isArray(saved.playHistory)) state.playHistory = saved.playHistory;
    if (Array.isArray(saved.playedLocations)) state.playedLocations = saved.playedLocations;
    if (Array.isArray(saved.heardTracks)) state.heardTracks = saved.heardTracks;
    if (saved.visitedPlaces && typeof saved.visitedPlaces === "object") state.visitedPlaces = saved.visitedPlaces;
  } catch {
    localStorage.removeItem("whereIndiListeningMemory");
  }
}

function resetListeningMemoryForDemo() {
  localStorage.removeItem("whereIndiListeningMemory");
  state.playHistory = [];
  state.playedLocations = [];
  state.heardTracks = [];
  state.visitedPlaces = {};
  state.listenedTrackIds.clear();
  state.pendingListenRewards.clear();
  state.listened = false;
  state.reviewed = false;
}

function seedDemoSongsAtCurrentLocation() {
  const coords = mapUserLocation();
  const seedTracks = state.tracks.slice(0, 2);
  if (!seedTracks.length) return;

  state.playedLocations = state.playedLocations.filter(item => item.place !== demoSeedPlaceName);
  state.playHistory = state.playHistory.filter(item => item.place !== demoSeedPlaceName);
  state.heardTracks = state.heardTracks.filter(item => item.place !== demoSeedPlaceName);

  const placeRecord = {
    id: demoSeedPlaceName,
    name: demoSeedPlaceName,
    lat: coords.lat,
    lng: coords.lng,
    tracks: []
  };

  seedTracks.forEach((track) => {
    const id = trackKey(track);
    const marker = {
      id,
      title: track.title,
      artist: track.artist,
      image: track.image,
      place: demoSeedPlaceName,
      lat: coords.lat,
      lng: coords.lng
    };

    placeRecord.tracks.unshift(marker);
    state.playedLocations.unshift(marker);
    state.playHistory.unshift({
      id,
      title: track.title,
      artist: track.artist,
      image: track.image,
      place: demoSeedPlaceName,
      reason: `${demoSeedPlaceName} 주변 분위기와 취향이 맞아서 데모용으로 배치했어요.`,
      rating: null
    });
    state.heardTracks.unshift({
      id,
      title: track.title,
      artist: track.artist,
      image: track.image,
      place: demoSeedPlaceName,
      reason: `${demoSeedPlaceName} 주변 분위기와 취향이 맞아서 데모용으로 배치했어요.`,
      rating: null
    });
  });

  placeRecord.tracks = placeRecord.tracks.slice(0, 2);
  state.visitedPlaces[demoSeedPlaceName] = placeRecord;
  state.playedLocations = state.playedLocations.filter((item, index, arr) =>
    arr.findIndex(other => other.id === item.id) === index
  ).slice(0, 8);
  state.playHistory = state.playHistory.filter((item, index, arr) =>
    arr.findIndex(other => other.id === item.id) === index
  ).slice(0, 8);
  state.heardTracks = state.heardTracks.filter((item, index, arr) =>
    arr.findIndex(other => other.id === item.id) === index
  ).slice(0, 20);
  saveListeningMemory();
}

function openMapPlacePanel(placeName) {
  const place = state.visitedPlaces[placeName];
  if (!place || !mapPlacePanel || !mapPlaceTrackList) return;

  if (mapPlaceTitle) mapPlaceTitle.textContent = place.name;
  mapPlaceTrackList.innerHTML = "";

  place.tracks.forEach((item) => {
    const row = document.createElement("button");
    row.className = "map-place-track";
    row.type = "button";
    row.innerHTML = `
      <img src="${item.image || ""}" alt="${item.title} 커버">
      <div>
        <strong>${item.title}</strong>
        <span>${item.artist}</span>
        ${recommendationFactorHtml(state.tracks.find(track => trackKey(track) === item.id) || item, item.place)}
      </div>
      <small>재생</small>
    `;
    row.addEventListener("click", () => {
      selectHeardTrack(item.id, null);
      state.unlocked = true;
      renderSelectedTrack();
      playCurrentTrack();
    });
    mapPlaceTrackList.appendChild(row);
  });

  mapPlacePanel.classList.add("show");
}

function closeMapPlacePanel() {
  mapPlacePanel?.classList.remove("show");
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return await Notification.requestPermission() === "granted";
  } catch {
    return false;
  }
}

function canShowBrowserNotification() {
  return "Notification" in window && Notification.permission === "granted";
}

function showBackgroundRecommendationNotification(place, track, message) {
  if (!canShowBrowserNotification()) return false;

  const notification = new Notification("Where Indi 추천", {
    body: `${place} · ${track.title}\n${message || recommendationReason(track)}`,
    tag: `where-indi-${place}`,
    renotify: true,
    silent: false
  });

  notification.onclick = () => {
    window.focus();
    const idx = state.tracks.findIndex(item => item.title === track.title);
    if (idx >= 0) {
      state.activeTrack = idx;
      state.unlocked = true;
      syncListenStateForActiveTrack();
      renderAll();
    }
    setView("map");
    showPlaceVibeBanner(place, "알림에서 다시 열었어요.", message, track, { forceInApp: true });
    notification.close();
  };

  return true;
}

function triggerBackgroundDemoNotification() {
  if (!state.onboardingComplete || state.backgroundDemoNotificationSent || !document.hidden) return;
  const track = currentTrack();
  if (!track) return;

  state.backgroundDemoNotificationSent = true;
  const shown = showBackgroundRecommendationNotification(
    demoSeedPlaceName,
    track,
    "앱이 백그라운드에 있어도 현재 위치 추천을 받을 수 있어요."
  );

  if (!shown) {
    document.title = `추천 도착 · ${track.title}`;
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    document.title = "Where Indi";
    return;
  }
  window.setTimeout(triggerBackgroundDemoNotification, 1200);
});

function scheduleBackgroundDemoNotification() {
  state.backgroundDemoNotificationSent = false;
  if (document.hidden) {
    window.setTimeout(triggerBackgroundDemoNotification, 1200);
  }
}

function showDemoRecommendationAfterOnboarding() {
  const track = currentTrack();
  if (!track) return;
  window.setTimeout(() => {
    showPlaceVibeBanner(
      demoSeedPlaceName,
      "방금 고른 취향과 현재 위치에 맞춘 첫 추천",
      recommendationReason(track),
      track
    );
  }, 360);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setImage(element, src) {
  if (!element) return;
  if (!src) {
    element.removeAttribute("src");
    element.style.background = "linear-gradient(135deg, #1ed760, #121212)";
    return;
  }
  element.src = src;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function selectTrack(index, targetView = "map") {
  stopSimulatedPlayback();
  state.activeTrack = index;
  state.unlocked = false;
  state.reviewed = false;
  syncListenStateForActiveTrack();
  document.querySelectorAll("#ratingStars button").forEach((star) => star.classList.remove("active"));
  if (ratingResult) ratingResult.textContent = "별점을 남기면 다음 추천에 반영됩니다.";
  renderAll();
  if (targetView) setView(targetView);
}

function renderTrackGrid() {
  const grid = document.querySelector("#trackGrid");
  grid.innerHTML = "";

  state.tracks.slice(0, 6).forEach((track, index) => {
    const isActive = index === state.activeTrack;
    const isPlaying = index === playingIndex && !trackAudio.paused;

    const card = document.createElement("div");
    card.className = `track-card${isActive ? " active" : ""}`;

    const img = document.createElement("img");
    img.src = track.image;
    img.alt = `${track.title} 커버`;

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${track.title}</strong>
      <span>${track.artist}</span>
      <span class="track-reason">${recommendationReason(track)}</span>
      ${recommendationFactorHtml(track)}
    `;

    const playBtn = document.createElement("button");
    playBtn.className = "track-play-btn";
    playBtn.setAttribute("aria-label", isPlaying ? "일시정지" : "재생");
    playBtn.textContent = isPlaying ? "⏸" : "▶";
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.activeTrack = index;
      syncListenStateForActiveTrack();
      renderSelectedTrack();
      playTrack(index);
    });

    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(playBtn);

    card.addEventListener("click", () => selectTrack(index, "map"));

    grid.appendChild(card);
  });
}

function renderSelectedTrack() {
  const track = currentTrack();
  const meta = `${track.artist} · ${track.place} · ${track.distance}m`;
  setText("#heroTrackTitle", track.title);
  setText("#heroTrackArtist", meta);
  setText("#heroReason", recommendationReason(track));
  const heroReason = document.querySelector("#heroReason");
  if (heroReason) {
    heroReason.innerHTML = `
      ${escapeHtml(recommendationReason(track))}
      ${recommendationFactorHtml(track)}
    `;
  }
  setText("#dropTitle", track.title);
  setText("#dropMeta", `${track.artist} · ${track.place}`);
  setText("#playerTitle", track.title);
  setText("#playerHeading", track.title);
  setText("#playerArtist", track.artist);
  setText("#miniTitle", track.title);
  setText("#miniArtist", track.artist);

  const heroTags = document.querySelector("#heroTags");
  if (heroTags) heroTags.innerHTML = track.tags.map((tag) => `<span>${tag}</span>`).join("");

  const distanceBar = document.querySelector("#distanceBar");
  if (distanceBar) distanceBar.style.width = `${Math.max(14, 100 - track.distance)}%`;

  setImage(document.querySelector("#dropCover"), track.image);
  setImage(document.querySelector("#homeNowCover"), track.image);
  setImage(document.querySelector("#playerCover"), track.image);
  setImage(document.querySelector("#miniCover"), track.image);

  if (track.audio) {
    audioPlayer.src = track.audio;
    audioPlayer.disabled = false;
  } else {
    audioPlayer.removeAttribute("src");
  }

  passText.textContent = state.unlocked
    ? "재생 준비 완료 · 70% 이상 들으면 인디코인이 지급됩니다."
    : "음악 구역에서 추천을 받거나 지도 기록에서 선택해 들을 수 있어요.";

  const canUnlock = track.distance <= 30;
  const unlockBtn = document.querySelector("#unlockButton");
  if (unlockBtn) unlockBtn.disabled = !canUnlock && !state.unlocked;

  setText("#unlockStatus", `${track.distance}m`);
  updatePlayButtonState();

  if (state.kakaoMapReady) renderKakaoMap();
}

function renderMapMarkers() {
  renderPlayHistory();
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateRealDistances() {
  if (!state.userLocation) return;
  const { lat, lng } = state.userLocation;
  state.tracks.forEach(track => {
    if (track.coords) {
      track.distance = Math.round(getDistanceMeters(lat, lng, track.coords.lat, track.coords.lng));
    }
  });
}

function clearKakaoUserMarker() {
  if (!state.kakaoUserMarker) return;
  state.kakaoUserMarker.setMap(null);
  state.kakaoUserMarker = null;
}

function setGeoPill(text, active) {
  const pill = document.querySelector("#geoStatus");
  const label = document.querySelector("#geoStatusText");
  if (label) label.textContent = text;
  if (pill) pill.classList.toggle("active", !!active);
}

function startGeolocation() {
  if (!navigator.geolocation) {
    setGeoPill("위치 미지원", false);
    return;
  }
  setGeoPill("위치 확인 중...", false);

  function onSuccess(pos) {
    state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    updateRealDistances();
    renderSelectedTrack();
    renderTrackGrid();
    if (state.kakaoMapReady) renderKakaoMap();
    setGeoPill(`내 위치 확인됨 · ±${Math.round(pos.coords.accuracy)}m`, true);
    checkPlaceProximity(state.userLocation.lat, state.userLocation.lng);
  }

  // enableHighAccuracy=true 실패 시 Wi-Fi 기반 위치로 재시도
  function onError(err) {
    if (err.code === 2 || err.code === 3) {
      navigator.geolocation.getCurrentPosition(onSuccess, onFinalError,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      onFinalError(err);
    }
  }

  function onFinalError(err) {
    const msg = err.code === 1 ? "위치 권한 거부됨 — 브라우저 설정에서 허용 필요"
              : err.code === 2 ? "위치 신호 없음"
              : "위치 확인 실패";
    setGeoPill(msg, false);
    console.warn("Geolocation error:", err.code, err.message);
  }

  navigator.geolocation.getCurrentPosition(onSuccess, onError,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );

  if (state.geoWatchId !== null) navigator.geolocation.clearWatch(state.geoWatchId);
  state.geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateRealDistances();
      renderSelectedTrack();
      if (state.kakaoMapReady) renderKakaoMap();
      else renderFallbackMapLayer();
      setGeoPill(`내 위치 확인됨 · ±${Math.round(pos.coords.accuracy)}m`, true);
      checkPlaceProximity(state.userLocation.lat, state.userLocation.lng);
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 }
  );
}

function clearKakaoMarkers() {
  state.kakaoMarkers.forEach((marker) => marker.setMap(null));
  state.kakaoMarkers = [];
  clearKakaoUserMarker();
}

function renderKakaoMap() {
  if (!state.kakaoMapReady || !window.kakao?.maps || !kakaoMapContainer) return;

  const kakao = window.kakao;
  const activeCoords = coordsForTrack(currentTrack());
  const userCoords = mapUserLocation();
  const activeCenter = new kakao.maps.LatLng(userCoords.lat, userCoords.lng);

  if (!state.kakaoMap) {
    state.kakaoMap = new kakao.maps.Map(kakaoMapContainer, {
      center: activeCenter,
      level: 4
    });
  } else {
    state.kakaoMap.setCenter(activeCenter);
  }

  clearKakaoMarkers();
  const bounds = new kakao.maps.LatLngBounds();
  bounds.extend(activeCenter);
  bounds.extend(new kakao.maps.LatLng(activeCoords.lat, activeCoords.lng));
  renderKakaoUserMarker(userCoords);
  renderNearbyTrackMarkers(bounds);
  renderPlayedSongMarkers();
  state.kakaoMap.setBounds(bounds);

  requestAnimationFrame(() => {
    state.kakaoMap.relayout();
    state.kakaoMap.setBounds(bounds);
  });
}

function renderKakaoUserMarker(coords) {
  if (!state.kakaoMapReady || !window.kakao?.maps || !state.kakaoMap) return;
  const kakao = window.kakao;
  const position = new kakao.maps.LatLng(coords.lat, coords.lng);
  const label = state.userLocation ? "내 위치" : "데모 위치";
  state.kakaoUserMarker = new kakao.maps.CustomOverlay({
    map: state.kakaoMap,
    position,
    yAnchor: 0.5,
    content: `
      <div class="kakao-user-marker" aria-label="${label}">
        <span></span>
        <strong>${label}</strong>
      </div>
    `
  });
}

function renderNearbyTrackMarkers(bounds) {
  if (!state.kakaoMapReady || !window.kakao?.maps || !state.kakaoMap) return;
  const kakao = window.kakao;

  Object.values(state.visitedPlaces).forEach((place) => {
    const position = new kakao.maps.LatLng(place.lat, place.lng);
    bounds?.extend(position);
    const latest = place.tracks[0];
    const count = place.tracks.length;

    const content = `
      <button class="kakao-track-marker visited" type="button" data-place="${escapeHtml(place.name)}">
        <span>♪</span>
        <strong>${escapeHtml(place.name)}</strong>
        <small>${count}곡</small>
      </button>
    `;
    const marker = new kakao.maps.CustomOverlay({
      map: state.kakaoMap,
      position,
      content,
      yAnchor: 1.1
    });
    state.kakaoMarkers.push(marker);

  });
}

function initializeKakaoMap() {
  if (!window.kakao?.maps?.Map) return;
  state.kakaoMapReady = true;
  mapCanvas?.classList.add("kakao-active");
  renderKakaoMap();
}

function renderAll() {
  updateKeys();
  updateMetrics();
  renderSelectedTrack();
  renderTrackGrid();
  renderPlayHistory();
  renderHeardTrackList();
  renderFallbackMapLayer();
}

const trackAudio = new Audio();
let playingIndex = null;

function addPlayHistory(track) {
  if (!track) return;
  const id = trackKey(track);
  const place = placeForTrack(track);
  const heardItem = {
    id,
    title: track.title,
    artist: track.artist,
    image: track.image,
    place: place.name,
    reason: recommendationReason(track),
    rating: null
  };
  state.playHistory = [
    heardItem,
    ...state.playHistory.filter(item => item.id !== id)
  ].slice(0, 8);
  state.heardTracks = [
    heardItem,
    ...state.heardTracks.filter(item => item.id !== id)
  ].slice(0, 20);
  recordPlayedLocation(track);
  saveListeningMemory();
  renderPlayHistory();
  renderHeardTrackList();
}

function renderPlayHistory() {
  const list = document.querySelector("#playHistoryList");
  if (!list) return;

  if (!state.playHistory.length) {
    list.innerHTML = `<p class="status-text">아직 재생한 음악이 없습니다.</p>`;
    return;
  }

  list.innerHTML = "";
  state.playHistory.forEach((item) => {
    const row = document.createElement("article");
    row.className = "history-item";
    row.innerHTML = `
      <img src="${item.image || ""}" alt="${item.title} 커버">
      <div>
        <strong>${item.title}</strong>
        <span>${item.artist}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderHeardTrackList() {
  const list = document.querySelector("#heardTrackList");
  if (!list) return;

  if (!state.heardTracks.length) {
    list.innerHTML = `<p class="status-text">아직 들었던 노래가 없습니다.</p>`;
    return;
  }

  list.innerHTML = "";
  state.heardTracks.forEach((item) => {
    const row = document.createElement("button");
    row.className = "heard-track-item";
    row.type = "button";
    row.innerHTML = `
      <img src="${item.image || ""}" alt="${item.title} 커버">
      <div>
        <strong>${item.title}</strong>
        <span>${item.artist} · ${item.place}</span>
        <small>${item.rating ? "★".repeat(item.rating) : "별점 대기"} · ${item.reason}</small>
      </div>
    `;
    row.addEventListener("click", () => selectHeardTrack(item.id, "track"));
    list.appendChild(row);
  });
}

function selectHeardTrack(id, targetView = "track") {
  const index = state.tracks.findIndex(track => trackKey(track) === id);
  if (index >= 0) {
    selectTrack(index, targetView);
    state.unlocked = true;
    renderSelectedTrack();
  }
}

function playLocationFor(track) {
  const fallback = coordsForTrack(track);
  return {
    lat: state.userLocation?.lat ?? fallback.lat,
    lng: state.userLocation?.lng ?? fallback.lng
  };
}

function recordPlayedLocation(track) {
  const id = trackKey(track);
  const place = placeForTrack(track);
  const coords = { lat: place.lat, lng: place.lng };
  const existing = state.playedLocations.find(item => item.id === id);
  const marker = {
    id,
    title: track.title,
    artist: track.artist,
    image: track.image,
    place: place.name,
    lat: coords.lat,
    lng: coords.lng
  };

  if (existing) Object.assign(existing, marker);
  else state.playedLocations.unshift(marker);

  const placeRecord = state.visitedPlaces[place.name] || {
    id: place.name,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    tracks: []
  };
  placeRecord.tracks = [
    marker,
    ...placeRecord.tracks.filter(item => item.id !== id)
  ];
  state.visitedPlaces[place.name] = placeRecord;

  state.playedLocations = state.playedLocations.slice(0, 8);
  saveListeningMemory();
  if (state.kakaoMapReady) renderKakaoMap();
  else renderFallbackMapLayer();
}

function positionMapMarker(marker) {
  const bounds = {
    minLat: 37.2404,
    maxLat: 37.2445,
    minLng: 127.0786,
    maxLng: 127.0830
  };
  const x = ((marker.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = (1 - ((marker.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat))) * 100;
  return {
    left: `${Math.min(88, Math.max(10, x))}%`,
    top: `${Math.min(86, Math.max(12, y))}%`
  };
}

function renderFallbackMapLayer() {
  if (!playedSongLayer) return;
  playedSongLayer.innerHTML = "";

  const user = mapUserLocation();
  const userPos = positionMapMarker(user);
  const userMarker = document.createElement("div");
  userMarker.className = `fallback-user-marker${state.userLocation ? " live" : ""}`;
  userMarker.style.left = userPos.left;
  userMarker.style.top = userPos.top;
  userMarker.innerHTML = `
    <span></span>
    <strong>${state.userLocation ? "내 위치" : "데모 위치"}</strong>
  `;
  playedSongLayer.appendChild(userMarker);

  Object.values(state.visitedPlaces).forEach((place) => {
    const pos = positionMapMarker(place);
    const latest = place.tracks[0];
    const button = document.createElement("button");
    button.className = "nearby-song-marker visited";
    button.setAttribute("aria-label", `${place.name}에서 들었던 음악`);
    button.style.left = pos.left;
    button.style.top = pos.top;
    button.innerHTML = `
      <span>♪</span>
      <strong>${place.name}</strong>
      <small>${place.tracks.length}곡</small>
    `;
    button.addEventListener("click", () => openMapPlacePanel(place.name));
    playedSongLayer.appendChild(button);
  });

}

function renderPlayedSongMarkers() {
  renderFallbackMapLayer();
}

function stopSimulatedPlayback() {
  if (state.simulatedTimer) {
    window.clearInterval(state.simulatedTimer);
    state.simulatedTimer = null;
  }
  updatePlayButtonState();
}

async function awardListenCoins(track = currentTrack(), percent = 72) {
  const id = trackKey(track);
  if (state.listenedTrackIds.has(id) || state.pendingListenRewards.has(id)) return false;

  state.pendingListenRewards.add(id);
  const data = await api("POST", "/api/listen-reward", {
    userId: USER_ID,
    trackId: id,
    trackTitle: track.title,
    percent
  });

  state.pendingListenRewards.delete(id);
  if (data && !data.ok) {
    if (data.alreadyRewarded) state.listenedTrackIds.add(id);
    return false;
  }

  const reward = data?.reward || 10;
  if (data?.keys !== undefined) state.keys = data.keys;
  else state.keys += reward;

  state.listenedTrackIds.add(id);
  if (trackKey(currentTrack()) === id) {
    state.listened = true;
    if (listenProgress) listenProgress.style.width = `${Math.max(70, percent)}%`;
    passText.textContent = `${Math.round(percent)}% 감상 완료 · 인디코인 +${reward} IC`;
    if (ratingResult) ratingResult.textContent = "별점을 남기면 다음 추천에 반영됩니다.";
  }

  showPointsToast(reward);
  updateKeys();
  return true;
}

function updatePlayButtonState() {
  const button = document.querySelector("#playButton");
  if (!button) return;
  const isActiveAudio = playingIndex === state.activeTrack && !trackAudio.paused;
  const isSimulated = !!state.simulatedTimer;
  button.textContent = (isActiveAudio || isSimulated) ? "⏸ 일시정지" : "▶ 재생";
}

function startSimulatedPlayback(track = currentTrack()) {
  stopSimulatedPlayback();
  addPlayHistory(track);
  state.simulatedProgress = 0;
  const duration = 180;
  passText.textContent = "재생 중";
  updatePlayerTime(0, duration);
  updatePlayButtonState();
  state.simulatedTimer = window.setInterval(() => {
    state.simulatedProgress += 7;
    const percent = state.simulatedProgress;
    updatePlayerTime(Math.min(duration, Math.round((percent / 100) * duration)), duration);
    if (listenProgress) listenProgress.style.width = `${Math.min(percent, 100)}%`;
    if (percent >= 70) awardListenCoins(track, percent);
    if (percent >= 100) {
      stopSimulatedPlayback();
      passText.textContent = "재생 완료";
      updatePlayButtonState();
    }
  }, 350);
}

function playCurrentTrack() {
  if (!state.unlocked) state.unlocked = true;
  const track = currentTrack();
  if (state.simulatedTimer) {
    stopSimulatedPlayback();
    passText.textContent = "일시정지됨";
    updatePlayButtonState();
    return;
  }
  if (track.audio) {
    playTrack(state.activeTrack);
    return;
  }
  startSimulatedPlayback(track);
}

function playTrack(index) {
  const track = state.tracks[index];
  if (!track?.audio) return;
  stopSimulatedPlayback();
  addPlayHistory(track);

  if (playingIndex === index) {
    if (trackAudio.paused) {
      trackAudio.play();
      api("POST", "/api/play", { userId: USER_ID, trackTitle: track.title, artist: track.artist });
    } else {
      trackAudio.pause();
    }
  } else {
    trackAudio.src = track.audio;
    trackAudio.play();
    playingIndex = index;
    api("POST", "/api/play", { userId: USER_ID, trackTitle: track.title, artist: track.artist });
  }
  renderTrackGrid();
  updatePlayButtonState();
}

trackAudio.addEventListener("pause", () => {
  renderTrackGrid();
  updatePlayButtonState();
});
trackAudio.addEventListener("play", () => {
  renderTrackGrid();
  updatePlayButtonState();
  updatePlayerTime(trackAudio.currentTime, trackAudio.duration);
});
trackAudio.addEventListener("timeupdate", () => {
  if (playingIndex === null || !Number.isFinite(trackAudio.duration) || trackAudio.duration <= 0) return;
  const percent = Math.min(100, Math.round((trackAudio.currentTime / trackAudio.duration) * 100));
  if (playingIndex === state.activeTrack && listenProgress) {
    listenProgress.style.width = `${percent}%`;
    updatePlayerTime(trackAudio.currentTime, trackAudio.duration);
  }
  if (percent >= 70) awardListenCoins(state.tracks[playingIndex], percent);
});

function normalizeJamendoTrack(track, index) {
  const tags = [
    ...(track.musicinfo?.tags?.genres || []),
    ...(track.musicinfo?.tags?.vartags || [])
  ].slice(0, 3);

  const places = ["정문 앞 카페", "학교 중앙광장", "독립서점", "공원 벤치", "소극장 앞", "버스정류장"];
  const distances = [18, 42, 71, 25, 64, 33];

  return {
    title: track.name || `Jamendo Track ${index + 1}`,
    artist: track.artist_name || "Jamendo Artist",
    place: places[index % places.length],
    distance: distances[index % distances.length],
    score: Math.max(68, 92 - index * 4),
    coords: placeCoords[index % placeCoords.length],
    tags: tags.length ? tags : [state.activeTag, "indie", "live"],
    image: track.album_image || track.image || demoTracks[index % demoTracks.length].image,
    audio: track.audio || track.audiodownload || "",
    reason: "Jamendo API에서 불러온 독립 아티스트 트랙을 현재 동선과 장소 분위기에 맞춰 배치했습니다."
  };
}

async function loadJamendoTracks() {
  const clientId = "b0af7f33";
  if (apiStatus) apiStatus.textContent = "Jamendo에서 인디 트랙을 불러오는 중...";

  const endpoint = new URL("https://api.jamendo.com/v3.0/tracks/");
  endpoint.searchParams.set("client_id", clientId);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("include", "musicinfo");
  endpoint.searchParams.set("groupby", "artist_id");
  endpoint.searchParams.set("audioformat", "mp31");
  endpoint.searchParams.set("tags", state.activeTag);

  try {
    const res = await fetch(endpoint.toString());
    const data = await res.json();
    if (!data.results?.length) throw new Error("검색 결과가 없습니다.");

    state.tracks = data.results.map(normalizeJamendoTrack);
    state.activeTrack = 0;
    state.unlocked = false;
    state.listenedTrackIds.clear();
    state.pendingListenRewards.clear();
    state.listened = false;
    state.reviewed = false;
    syncListenStateForActiveTrack();
    if (apiStatus) apiStatus.textContent = `${state.tracks.length}개 트랙 불러옴`;
    renderAll();
    await applyRecommendScores();
    applyAiReasons();
  } catch (error) {
    state.tracks = demoTracks;
    if (apiStatus) apiStatus.textContent = `${error.message} · 데모 트랙으로 대체`;
    renderAll();
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-view-jump], [data-view-link]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setView(button.dataset.viewJump || button.dataset.viewLink);
  });
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    state.activeTag = button.dataset.tag;
  });
});

async function spendCoins(amount, purpose) {
  if (state.keys < amount) {
    walletMessage.textContent = `${amount} IC가 필요합니다. 음악을 감상하고 별점을 남겨 인디코인을 모아보세요.`;
    return null;
  }

  const data = await api("POST", "/api/spend", { userId: USER_ID, amount, purpose });
  if (data?.ok) {
    state.keys = data.keys;
    if (data.metrics) state.metrics = data.metrics;
    updateKeys();
    updateMetrics();
    return data;
  }

  if (data && !data.ok) {
    walletMessage.textContent = data.message || "인디코인이 부족합니다.";
    return null;
  }

  state.keys -= amount;
  updateKeys();
  return { ok: true, keys: state.keys };
}

document.querySelector("#unlockButton").addEventListener("click", async () => {
  if (!state.unlocked) {
    state.unlocked = true;
    const track = currentTrack();
    const data = await api("POST", "/api/unlock", { userId: USER_ID, trackId: track.title });
    if (data) {
      state.keys = data.keys;
      state.metrics = data.metrics;
    }
  }
  passText.textContent = "근처에서 재생 중 · 70% 이상 들으면 인디코인 지급";
  updateKeys();
  updateMetrics();
  setView("track");
});

document.querySelector("#playButton")?.addEventListener("click", () => {
  playCurrentTrack();
});

document.querySelector("#closeMapPlacePanel")?.addEventListener("click", closeMapPlacePanel);

document.addEventListener("click", (event) => {
  const marker = event.target.closest(".kakao-track-marker.visited");
  if (!marker) return;
  const place = marker.dataset.place;
  if (place) openMapPlacePanel(place);
});

document.querySelectorAll("#ratingStars button").forEach((button) => {
  button.addEventListener("click", async () => {
    const rating = Number(button.dataset.rating);
    document.querySelectorAll("#ratingStars button").forEach((star) => {
      star.classList.toggle("active", Number(star.dataset.rating) <= rating);
    });

    const track = currentTrack();
    const feedback = rating >= 4 ? "recommend" : "not-recommend";
    const data = await api("POST", "/api/review", {
      userId: USER_ID,
      trackId: track.title,
      trackObj: track,
      rating,
      feedbackType: feedback
    });

    if (data && !state.reviewed) {
      state.reviewed = true;
      state.keys = data.keys;
      state.metrics = data.metrics;
      showPointsToast(data.reward);
      ratingResult.textContent = `${rating}점 반영 완료 · +${data.reward} IC 적립`;
    } else if (!state.reviewed) {
      state.reviewed = true;
      state.keys += 10;
      ratingResult.textContent = `${rating}점 반영 완료 · +10 IC 적립`;
    } else {
      ratingResult.textContent = `${rating}점으로 업데이트했습니다.`;
    }

    const id = trackKey(track);
    state.heardTracks = state.heardTracks.map(item =>
      item.id === id ? { ...item, rating } : item
    );
    saveListeningMemory();
    renderHeardTrackList();
    updateKeys();
    updateMetrics();
  });
});

document.querySelector("#donateButton")?.addEventListener("click", async () => {
  const track = currentTrack();
  const data = await spendCoins(50, "donate");
  if (!data) return;
  walletMessage.textContent = `${track.artist}에게 50 IC를 후원했습니다.`;
});

document.querySelector("#merchButton")?.addEventListener("click", async () => {
  const data = await spendCoins(120, "merch");
  if (!data) return;
  walletMessage.textContent = "굿즈 구매가 완료되었습니다. 데모에서는 주문 예약 상태로 표시됩니다.";
});

resetListeningMemoryForDemo();
renderMapMarkers();
renderAll();

document.querySelector(".phone-app").dataset.view = "home";

function bootApp() {
  console.log("[WhereIndi] booting, USER_ID =", USER_ID);
  const splashScreen = document.querySelector("#splashScreen");
  window.setTimeout(() => splashScreen?.classList.add("hide"), 2000);
  window.setTimeout(() => splashScreen?.remove(), 2400);

  try { initializeKakaoMap(); } catch (e) { console.error("kakao init error:", e); }
  try { initOnboarding(); console.log("[WhereIndi] onboarding init OK"); } catch (e) { console.error("onboarding error:", e); }
  try { loadJamendoTracks(); } catch (e) { console.error("jamendo error:", e); }
  try { startGeolocation(); } catch (e) { console.error("geo error:", e); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}

// ── 온보딩 ────────────────────────────────────────────────────────
function initOnboarding() {
  const overlay = document.querySelector("#onboardingOverlay");
  if (!overlay) return;
  // 매 새로고침마다 다시 묻기 - localStorage 안 씀
  overlay.classList.add("active");

  document.querySelectorAll("#genreTags .otag").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });
  document.querySelectorAll("#moodTags .otag").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });

  document.querySelector("#onboardingDone").addEventListener("click", async () => {
    const genres = [...document.querySelectorAll("#genreTags .otag.active")].map(b => b.dataset.value);
    const moods = [...document.querySelectorAll("#moodTags .otag.active")].map(b => b.dataset.value);
    await requestNotificationPermission();
    await api("POST", "/api/user/prefs", { userId: USER_ID, genres, moods });
    state.onboardingComplete = true;
    overlay.classList.remove("active");
    await applyRecommendScores();
    applyAiReasons();
    showDemoRecommendationAfterOnboarding();
    scheduleBackgroundDemoNotification();
  });
}

// Gemini로 추천 이유 텍스트 생성
async function applyAiReasons() {
  if (!state.tracks.length) return;
  const body = { userId: USER_ID, tracks: state.tracks };
  if (state.userLocation) { body.lat = state.userLocation.lat; body.lng = state.userLocation.lng; }
  const data = await api("POST", "/api/ai-reasons", body);
  if (data?.tracks) {
    state.tracks = data.tracks;
    renderTrackGrid();
    renderSelectedTrack();
  }
}

// GPS 위치 기반 장소 트리거 (50m 이내 진입 시 Gemini 호출)
// 경희대 국제캠퍼스 장소 (용인 기흥)
const PLACES = [
  { name: "국제캠 정문 앞", lat: 37.2412, lng: 127.0795 },
  { name: "중앙도서관", lat: 37.2424, lng: 127.0807 },
  { name: "노천극장", lat: 37.2433, lng: 127.0795 },
  { name: "학생회관 앞", lat: 37.2420, lng: 127.0820 },
  { name: "푸른솔문화관", lat: 37.2440, lng: 127.0800 },
  { name: "외대 광장", lat: 37.2438, lng: 127.0815 }
];
const placeTriggered = new Set();

function checkPlaceProximity(lat, lng) {
  for (const p of PLACES) {
    const d = haversineMeters(lat, lng, p.lat, p.lng);
    const lastPrompt = state.promptedPlaces[p.name] || 0;
    if (d < 60 && Date.now() - lastPrompt > 45000) {
      state.promptedPlaces[p.name] = Date.now();
      triggerPlaceVibe(p.name);
      break;
    }
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function triggerPlaceVibe(placeName) {
  const fallbackTrack = chooseTrackForPlace(placeName);
  const data = await api("POST", "/api/place-vibe", { userId: USER_ID, place: placeName, tracks: state.tracks });
  const track = data?.track || fallbackTrack;
  if (!track) return;
  showPlaceVibeBanner(placeName, data?.vibe, data?.reason, track);
}

function chooseTrackForPlace(placeName) {
  const place = PLACES.find(item => item.name === placeName);
  const heardIds = new Set(state.heardTracks.map(item => item.id));
  const candidates = state.tracks
    .map((track, index) => {
      const coords = coordsForTrack(track, index);
      const distance = place ? getDistanceMeters(place.lat, place.lng, coords.lat, coords.lng) : 0;
      return { track, distance, heard: heardIds.has(trackKey(track)) };
    })
    .sort((a, b) => Number(a.heard) - Number(b.heard) || a.distance - b.distance);
  return candidates[0]?.track || currentTrack();
}

function showPlaceVibeBanner(place, vibe, reason, track, options = {}) {
  const message = vibe || reason || recommendationReason(track);
  if (document.hidden && !options.forceInApp) {
    const notified = showBackgroundRecommendationNotification(place, track, message);
    if (notified) return;
  }

  const old = document.querySelector(".nearby-recommend-popup");
  if (old) old.remove();
  const visited = state.visitedPlaces[place];
  const subcopy = visited
    ? `${place}에서 이미 ${visited.tracks.length}곡을 들었어요. 이번에는 다른 곡을 추천할게요.`
    : `${place} 분위기와 취향을 보고 고른 곡이에요.`;
  const banner = document.createElement("div");
  banner.className = "nearby-recommend-popup";
  banner.innerHTML = `
    <div class="nrp-card">
      <button class="nrp-close" aria-label="닫기">×</button>
      <span class="nrp-kicker">음악 구역 도착</span>
      <div class="nrp-track-head">
        <img src="${track.image || ""}" alt="${track.title} 앨범 커버">
        <div>
          <strong>${track.title}</strong>
          <span>${track.artist || "Where Indi"}</span>
        </div>
      </div>
      <p>${subcopy}</p>
      <small>${message}</small>
      ${recommendationFactorHtml(track, place)}
      <div class="nrp-actions">
        <button class="nrp-skip">나중에</button>
        <button class="nrp-play">▶ 재생</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("show"));
  banner.querySelector(".nrp-close").addEventListener("click", () => banner.remove());
  banner.querySelector(".nrp-skip").addEventListener("click", () => banner.remove());
  banner.querySelector(".nrp-play").addEventListener("click", () => {
    const idx = state.tracks.findIndex(t => t.title === track.title);
    if (idx >= 0) {
      state.activeTrack = idx;
      state.unlocked = true;
      syncListenStateForActiveTrack();
      renderAll();
      setView("track");
      playCurrentTrack();
    }
    banner.remove();
  });
  setTimeout(() => banner.remove(), 10000);
}
