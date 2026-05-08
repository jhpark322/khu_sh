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
  memberLevel: 1,
  cashoutRequested: false,
  listenedTrackIds: new Set(),
  pendingListenRewards: new Set(),
  activeTrack: 0,
  activeTag: "indie",
  tracks: demoTracks,
  kakaoMap: null,
  kakaoMarkers: [],
  kakaoMapReady: false,
  kakaoUserMarker: null,
  userLocation: null,
  geoWatchId: null,
  metrics: { discoveries: 120, unlocks: 86, reviews: 28, bookings: 9 }
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
const coinLevel = document.querySelector("#coinLevel");
const coinProgress = document.querySelector("#coinProgress");
const passText = document.querySelector("#passText");
const listenProgress = document.querySelector("#listenProgress");
const reviewResult = document.querySelector("#reviewResult");
const walletMessage = document.querySelector("#walletMessage");
const apiStatus = document.querySelector("#apiStatus");
const audioPlayer = document.querySelector("#audioPlayer");
const kakaoMapContainer = document.querySelector("#kakaoMap");
const mapCanvas = document.querySelector(".map-full");

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  const phoneApp = document.querySelector(".phone-app");
  if (phoneApp) phoneApp.dataset.view = id;
  if (id === "map") {
    startGeolocation();
    if (state.kakaoMapReady) requestAnimationFrame(renderKakaoMap);
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
  if (coinLevel) coinLevel.textContent = `Level ${state.memberLevel}`;
  if (coinProgress) {
    const nextCost = state.memberLevel * 25;
    const remaining = Math.max(0, nextCost - state.keys);
    coinProgress.textContent = remaining ? `다음 레벨까지 ${remaining} IC` : "레벨업 가능";
  }
  const levelCost = document.querySelector("#levelUpButton .reward-cost");
  if (levelCost) levelCost.textContent = `${state.memberLevel * 25} IC`;
}

function updateMetrics() {
  document.querySelector("#metricDiscoveries").textContent = state.metrics.discoveries;
  document.querySelector("#metricUnlocks").textContent = state.metrics.unlocks;
  document.querySelector("#metricReviews").textContent = state.metrics.reviews;
  document.querySelector("#metricBookings").textContent = state.metrics.bookings;
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

function coordsForTrack(track, index = state.activeTrack) {
  return track.coords || placeCoords[index % placeCoords.length];
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

function selectTrack(index, targetView = "map") {
  state.activeTrack = index;
  state.unlocked = false;
  state.reviewed = false;
  syncListenStateForActiveTrack();
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
      <span class="track-reason">${track.reason || track.place + " · " + track.distance + "m"}</span>
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
  setText("#heroReason", track.reason || "PCA 추천 결과를 바탕으로 지금 듣기 좋은 인디 트랙입니다.");
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

  setImage(document.querySelector("#heroCover"), track.image);
  setImage(document.querySelector("#dropCover"), track.image);
  setImage(document.querySelector("#playerCover"), track.image);
  setImage(document.querySelector("#miniCover"), track.image);

  if (track.audio) {
    audioPlayer.src = track.audio;
    audioPlayer.disabled = false;
  } else {
    audioPlayer.removeAttribute("src");
  }

  passText.textContent = state.unlocked
    ? "근처에서 재생 중 · 24시간 동안 다시 듣기 가능"
    : "근처 음악을 선택하면 바로 재생할 수 있어요.";

  const canUnlock = track.distance <= 30;
  const unlockBtn = document.querySelector("#unlockButton");
  if (unlockBtn) unlockBtn.disabled = !canUnlock && !state.unlocked;

  setText("#unlockStatus", `${track.distance}m`);

  if (state.kakaoMapReady) renderKakaoMap();
}

function renderMapMarkers() {
  document.querySelectorAll(".drop-marker").forEach((marker) => {
    const index = Number(marker.dataset.dropIndex);
    marker.classList.toggle("selected", index === state.activeTrack);
    marker.addEventListener("click", () => selectTrack(index, null));
  });
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

function updateKakaoUserMarker() {
  if (!state.kakaoMapReady || !window.kakao?.maps || !state.kakaoMap || !state.userLocation) return;
  const kakao = window.kakao;
  const pos = new kakao.maps.LatLng(state.userLocation.lat, state.userLocation.lng);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">
    <circle cx="14" cy="14" r="10" fill="#509bf5" stroke="#fff" stroke-width="3"/>
    <circle cx="14" cy="14" r="4" fill="#fff"/>
  </svg>`;
  const markerImage = new kakao.maps.MarkerImage(
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    new kakao.maps.Size(28, 28),
    { offset: new kakao.maps.Point(14, 14) }
  );
  if (state.kakaoUserMarker) {
    state.kakaoUserMarker.setPosition(pos);
  } else {
    state.kakaoUserMarker = new kakao.maps.Marker({
      map: state.kakaoMap,
      position: pos,
      title: "내 위치",
      image: markerImage,
      zIndex: 10
    });
  }
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
      updateKakaoUserMarker();
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
}

function renderKakaoMap() {
  if (!state.kakaoMapReady || !window.kakao?.maps || !kakaoMapContainer) return;

  const kakao = window.kakao;
  const activeCoords = coordsForTrack(currentTrack());
  const activeCenter = new kakao.maps.LatLng(activeCoords.lat, activeCoords.lng);

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

  state.tracks.slice(0, 6).forEach((track, index) => {
    const coords = coordsForTrack(track, index);
    const position = new kakao.maps.LatLng(coords.lat, coords.lng);
    const marker = new kakao.maps.Marker({
      map: state.kakaoMap,
      position,
      title: `${track.title} - ${track.artist}`
    });

    kakao.maps.event.addListener(marker, "click", () => selectTrack(index, "map"));

    state.kakaoMarkers.push(marker);
    bounds.extend(position);
  });

  state.kakaoMap.setLevel(4);
  state.kakaoMap.setCenter(activeCenter);
  updateKakaoUserMarker();

  requestAnimationFrame(() => {
    state.kakaoMap.relayout();
    state.kakaoMap.setCenter(activeCenter);
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
}

const trackAudio = new Audio();
let playingIndex = null;

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
    reviewResult.textContent = "리뷰를 남기면 인디코인이 더 쌓입니다.";
  }

  showPointsToast(reward);
  updateKeys();
  return true;
}

function playTrack(index) {
  const track = state.tracks[index];
  if (!track?.audio) return;

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
}

trackAudio.addEventListener("pause", () => renderTrackGrid());
trackAudio.addEventListener("play", () => renderTrackGrid());
trackAudio.addEventListener("timeupdate", () => {
  if (playingIndex === null || !Number.isFinite(trackAudio.duration) || trackAudio.duration <= 0) return;
  const percent = Math.min(100, Math.round((trackAudio.currentTime / trackAudio.duration) * 100));
  if (playingIndex === state.activeTrack && listenProgress) {
    listenProgress.style.width = `${percent}%`;
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
    walletMessage.textContent = `${amount} IC가 필요합니다. 추천 음악을 70% 이상 감상해 인디코인을 모아보세요.`;
    return null;
  }

  const data = await api("POST", "/api/spend", { userId: USER_ID, amount, purpose });
  if (data?.ok) {
    state.keys = data.keys;
    if (data.level) state.memberLevel = data.level;
    if (data.cashoutRequested !== undefined) state.cashoutRequested = data.cashoutRequested;
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

document.querySelector("#listenButton").addEventListener("click", async () => {
  if (!state.unlocked) {
    passText.textContent = "먼저 지도에서 근처 음악을 선택하세요.";
    setView("map");
    return;
  }
  listenProgress.style.width = "72%";
  const rewarded = await awardListenCoins(currentTrack(), 72);
  if (!rewarded) {
    passText.textContent = "72% 감상 완료 · 이미 인디코인을 받았어요.";
    reviewResult.textContent = "리뷰를 남기면 인디코인이 더 쌓입니다.";
  }
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((s) => s.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelector("#submitReview").addEventListener("click", async () => {
  if (!state.listened) {
    reviewResult.textContent = "70% 이상 들으면 리뷰를 남길 수 있어요.";
    return;
  }
  const text = document.querySelector("#reviewText").value.trim();
  const feedback = document.querySelector(".segment.active")?.dataset.feedback || "recommend";
  const track = currentTrack();

  const data = await api("POST", "/api/review", {
    userId: USER_ID, trackId: track.title, trackObj: track, text, feedbackType: feedback
  });

  if (data && !state.reviewed) {
    state.reviewed = true;
    state.keys = data.keys;
    state.metrics = data.metrics;
    showPointsToast(data.reward);
    reviewResult.textContent = `리뷰 품질 ${data.quality}점 · +${data.reward} IC 적립`;
  } else if (!state.reviewed) {
    state.reviewed = true;
    state.keys += 15;
    reviewResult.textContent = "리뷰가 제출되었습니다. +15 IC 적립";
  }
  updateKeys();
  updateMetrics();
});

document.querySelector("#spendHint").addEventListener("click", async () => {
  const data = await spendCoins(10, "hint");
  if (!data) return;
  walletMessage.textContent = "다음 곡은 정문을 지나 두 번째 불빛 근처에 있습니다.";
});

document.querySelector("#levelUpButton").addEventListener("click", async () => {
  const cost = state.memberLevel * 25;
  const data = await spendCoins(cost, "level-up");
  if (!data) return;
  if (!data.level) state.memberLevel += 1;
  walletMessage.textContent = `인디패스 Level ${state.memberLevel} 달성. 추천 우선권이 올라갔어요.`;
  updateKeys();
});

document.querySelector("#applyDiscount").addEventListener("click", async () => {
  if (state.discountApplied) { walletMessage.textContent = "이미 할인이 적용되었습니다."; return; }
  const data = await spendCoins(100, "booking");
  if (!data) return;
  state.discountApplied = true;
  document.querySelector("#discountValue").textContent = "2,000원";
  document.querySelector("#finalPrice").textContent = "13,000원";
  walletMessage.textContent = "공연 할인에 인디코인이 적용되었습니다.";
  updateKeys();
  updateMetrics();
});

document.querySelector("#cashOutButton").addEventListener("click", async () => {
  if (state.cashoutRequested) {
    walletMessage.textContent = "이미 현금화 신청이 접수되었습니다.";
    return;
  }
  const data = await spendCoins(200, "cashout");
  if (!data) return;
  state.cashoutRequested = true;
  walletMessage.textContent = "현금화 신청 접수 완료. 데모에서는 정산 대기 상태로 표시됩니다.";
});

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
    await api("POST", "/api/user/prefs", { userId: USER_ID, genres, moods });
    overlay.classList.remove("active");
    await applyRecommendScores();
    applyAiReasons();
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
    if (d < 60 && !placeTriggered.has(p.name)) {
      placeTriggered.add(p.name);
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
  const data = await api("POST", "/api/place-vibe", { userId: USER_ID, place: placeName, tracks: state.tracks });
  if (!data?.track) return;
  showPlaceVibeBanner(placeName, data.vibe, data.reason, data.track);
}

function showPlaceVibeBanner(place, vibe, reason, track) {
  const old = document.querySelector(".place-vibe-banner");
  if (old) old.remove();
  const banner = document.createElement("div");
  banner.className = "place-vibe-banner";
  banner.innerHTML = `
    <div class="pvb-pin">📍</div>
    <div class="pvb-body">
      <div class="pvb-place">${place}</div>
      <div class="pvb-vibe">${vibe}</div>
      <div class="pvb-track">▶ ${track.title} · ${track.artist}</div>
    </div>
    <button class="pvb-close" aria-label="닫기">×</button>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("show"));
  banner.querySelector(".pvb-close").addEventListener("click", () => banner.remove());
  banner.querySelector(".pvb-body").addEventListener("click", () => {
    const idx = state.tracks.findIndex(t => t.title === track.title);
    if (idx >= 0) { state.activeTrack = idx; playTrack(idx); }
    banner.remove();
  });
  setTimeout(() => banner.remove(), 8000);
}
