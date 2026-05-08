const demoTracks = [
  {
    title: "밤 산책",
    artist: "Blue Room",
    place: "정문 앞 카페",
    distance: 18,
    score: 87,
    tags: ["잔잔함", "밤", "산책"],
    coords: { lat: 37.5939, lng: 127.0528 },
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "자주 지나는 카페거리와 가까우며, 저녁 시간대와 잔잔한 인디 취향이 잘 맞습니다."
  },
  {
    title: "여름의 계단",
    artist: "Small Wave",
    place: "학교 중앙광장",
    distance: 42,
    score: 79,
    tags: ["청춘", "밴드", "캠퍼스"],
    coords: { lat: 37.5969, lng: 127.0522 },
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "축제 분위기의 중앙광장과 청춘 밴드 사운드가 잘 맞습니다."
  },
  {
    title: "오래된 책갈피",
    artist: "Noon Archive",
    place: "독립서점",
    distance: 71,
    score: 82,
    tags: ["로파이", "독서", "오후"],
    coords: { lat: 37.5919, lng: 127.055 },
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
    audio: "",
    reason: "조용한 독립서점 분위기와 로파이 질감이 잘 어울립니다."
  }
];

const state = {
  keys: 25,
  unlocked: false,
  listened: false,
  reviewed: false,
  discountApplied: false,
  activeTrack: 0,
  activeTag: "indie",
  tracks: demoTracks,
  kakaoMap: null,
  kakaoMarkers: [],
  kakaoMapReady: false,
  metrics: {
    discoveries: 120,
    unlocks: 86,
    reviews: 28,
    bookings: 9
  }
};

const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav-button");
const keyBalance = document.querySelector("#keyBalance");
const passText = document.querySelector("#passText");
const listenProgress = document.querySelector("#listenProgress");
const reviewResult = document.querySelector("#reviewResult");
const walletMessage = document.querySelector("#walletMessage");
const apiStatus = document.querySelector("#apiStatus");
const audioPlayer = document.querySelector("#audioPlayer");
const clientInput = document.querySelector("#jamendoClientId");
const kakaoMapKeyInput = document.querySelector("#kakaoMapKey");
const kakaoMapStatus = document.querySelector("#kakaoMapStatus");
const kakaoMapContainer = document.querySelector("#kakaoMap");
const mapCanvas = document.querySelector(".map-canvas");

const storedClientId = localStorage.getItem("jamendoClientId");
if (storedClientId) clientInput.value = storedClientId;

const storedKakaoMapKey = localStorage.getItem("kakaoMapJavaScriptKey");
if (storedKakaoMapKey && kakaoMapKeyInput) kakaoMapKeyInput.value = storedKakaoMapKey;

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  const phoneApp = document.querySelector(".phone-app");
  if (phoneApp) phoneApp.dataset.view = id;
  if (id === "map" && state.kakaoMapReady) {
    requestAnimationFrame(renderKakaoMap);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateKeys() {
  keyBalance.textContent = `${state.keys}K`;
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

const placeCoords = [
  { lat: 37.5939, lng: 127.0528 },
  { lat: 37.5969, lng: 127.0522 },
  { lat: 37.5919, lng: 127.055 },
  { lat: 37.5977, lng: 127.0506 },
  { lat: 37.5958, lng: 127.0538 },
  { lat: 37.5929, lng: 127.0518 }
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

function renderTrackGrid() {
  const grid = document.querySelector("#trackGrid");
  grid.innerHTML = "";

  state.tracks.slice(0, 6).forEach((track, index) => {
    const button = document.createElement("button");
    button.className = `track-card${index === state.activeTrack ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <img src="${track.image}" alt="${track.title} 커버">
      <div>
        <strong>${track.title}</strong>
        <span>${track.artist}</span>
        <span>${track.place} · ${track.distance}m · ${track.score}점</span>
      </div>
    `;
    button.addEventListener("click", () => {
      state.activeTrack = index;
      state.unlocked = false;
      state.listened = false;
      state.reviewed = false;
      listenProgress.style.width = "0";
      renderAll();
      setView("map");
    });
    grid.appendChild(button);
  });
}

function renderSelectedTrack() {
  const track = currentTrack();
  const meta = `${track.artist} · ${track.place} · ${track.distance}m`;
  setText("#heroTrackTitle", track.title);
  setText("#heroTrackArtist", meta);
  setText("#dropTitle", track.title);
  setText("#dropMeta", meta);
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

  document.querySelector("#unlockStatus").textContent =
    track.distance <= 30 ? "지금 재생 가능: 가까운 위치입니다." : "조금 더 가까이 가면 바로 들을 수 있어요.";

  if (state.kakaoMapReady) renderKakaoMap();
}

function renderMapMarkers() {
  document.querySelectorAll(".drop-marker").forEach((marker) => {
    const index = Number(marker.dataset.dropIndex);
    marker.classList.toggle("selected", index === state.activeTrack);
    marker.addEventListener("click", () => {
      state.activeTrack = index;
      state.unlocked = false;
      state.listened = false;
      state.reviewed = false;
      listenProgress.style.width = "0";
      renderAll();
    });
  });
}

function loadKakaoMapsSdk(appKey) {
  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 8000;

    function withTimeout(fn) {
      const timer = setTimeout(() => {
        reject(new Error("카카오맵 응답 시간 초과 — JavaScript 키인지 확인하고, 카카오 콘솔 > 앱 > 플랫폼 > Web 에 현재 도메인(예: localhost, 127.0.0.1)을 등록했는지 확인하세요."));
      }, TIMEOUT_MS);
      return () => { clearTimeout(timer); fn(); };
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(withTimeout(resolve));
      return;
    }

    const oldScript = document.querySelector("#kakaoMapsSdk");
    if (oldScript && oldScript.dataset.appKey !== appKey) {
      oldScript.remove();
    }

    const existingScript = document.querySelector("#kakaoMapsSdk");
    if (existingScript) {
      existingScript.addEventListener("load", () => window.kakao?.maps
        ? window.kakao.maps.load(withTimeout(resolve))
        : reject(new Error("Kakao Maps SDK 초기화 실패 — JavaScript 키인지 확인하세요.")), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Kakao Maps SDK 네트워크 오류")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "kakaoMapsSdk";
    script.dataset.appKey = appKey;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.addEventListener("load", () => {
      if (!window.kakao?.maps) {
        reject(new Error("Kakao Maps SDK 초기화 실패 — JavaScript 키인지 확인하세요."));
        return;
      }
      window.kakao.maps.load(withTimeout(resolve));
    });
    script.addEventListener("error", () => reject(new Error("Kakao Maps SDK를 불러오지 못했습니다.")));
    document.head.appendChild(script);
  });
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

    kakao.maps.event.addListener(marker, "click", () => {
      state.activeTrack = index;
      state.unlocked = false;
      state.listened = false;
      state.reviewed = false;
      listenProgress.style.width = "0";
      renderAll();
      setView("map");
    });

    state.kakaoMarkers.push(marker);
    bounds.extend(position);
  });

  state.kakaoMap.setBounds(bounds);
  state.kakaoMap.setCenter(activeCenter);

  requestAnimationFrame(() => {
    state.kakaoMap.relayout();
    state.kakaoMap.setCenter(activeCenter);
  });
}

async function initializeKakaoMap() {
  const appKey = kakaoMapKeyInput?.value.trim();
  if (!appKey) {
    if (kakaoMapStatus) kakaoMapStatus.textContent = "Kakao JavaScript 키를 넣으면 실제 카카오맵으로 전환됩니다.";
    return;
  }

  localStorage.setItem("kakaoMapJavaScriptKey", appKey);
  if (kakaoMapStatus) kakaoMapStatus.textContent = "카카오맵을 불러오는 중입니다.";

  try {
    await loadKakaoMapsSdk(appKey);
    state.kakaoMapReady = true;
    mapCanvas?.classList.add("kakao-active");
    renderKakaoMap();
    if (kakaoMapStatus) kakaoMapStatus.textContent = "카카오맵 연결 완료. 트랙 위치를 실제 지도 위에 표시합니다.";
  } catch (error) {
    state.kakaoMapReady = false;
    mapCanvas?.classList.remove("kakao-active");
    if (kakaoMapStatus) kakaoMapStatus.textContent = `${error.message} 데모 지도를 유지합니다.`;
  }
}

function renderAll() {
  updateKeys();
  updateMetrics();
  renderSelectedTrack();
  renderTrackGrid();
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `jamendoCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";

    window[callbackName] = (data) => {
      delete window[callbackName];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error("Jamendo API 요청에 실패했습니다."));
    };

    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

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
  const clientId = clientInput.value.trim();
  if (!clientId) {
    state.tracks = demoTracks;
    state.activeTrack = 0;
    apiStatus.textContent = "client_id가 없어 내장 데모 트랙으로 돌아왔습니다.";
    renderAll();
    return;
  }

  localStorage.setItem("jamendoClientId", clientId);
  apiStatus.textContent = "Jamendo에서 인디 트랙을 불러오는 중입니다.";

  const endpoint = new URL("https://api.jamendo.com/v3.0/tracks/");
  endpoint.searchParams.set("client_id", clientId);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("include", "musicinfo");
  endpoint.searchParams.set("groupby", "artist_id");
  endpoint.searchParams.set("audioformat", "mp31");
  endpoint.searchParams.set("tags", state.activeTag);

  try {
    const data = await jsonp(endpoint.toString());
    if (!data.results || !data.results.length) {
      throw new Error("검색 결과가 없습니다.");
    }

    state.tracks = data.results.map(normalizeJamendoTrack);
    state.activeTrack = 0;
    state.unlocked = false;
    state.listened = false;
    state.reviewed = false;
    listenProgress.style.width = "0";
    apiStatus.textContent = `Jamendo 트랙 ${state.tracks.length}개로 내 주변 믹스를 만들었습니다.`;
    renderAll();
  } catch (error) {
    state.tracks = demoTracks;
    apiStatus.textContent = `${error.message} 내장 데모 트랙을 유지합니다.`;
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

document.querySelector("#loadJamendo").addEventListener("click", loadJamendoTracks);
document.querySelector("#loadKakaoMap").addEventListener("click", initializeKakaoMap);

document.querySelector("#moveCloserButton").addEventListener("click", () => {
  const userDot = document.querySelector("#userDot");
  userDot.setAttribute("cx", "548");
  userDot.setAttribute("cy", "153");
  currentTrack().distance = 8;
  renderSelectedTrack();
});

document.querySelector("#unlockButton").addEventListener("click", () => {
  if (!state.unlocked) {
    state.unlocked = true;
    state.keys += 5;
    state.metrics.unlocks += 1;
    state.metrics.discoveries += 1;
  }

  passText.textContent = "근처에서 재생 중 · 24시간 다시 듣기 가능 · 발견 포인트 +5K";
  document.querySelector("#unlockStatus").textContent = "재생 시작: 오늘의 근처 트랙에 추가됐습니다.";
  updateKeys();
  updateMetrics();
  setView("track");
});

document.querySelector("#listenButton").addEventListener("click", () => {
  if (!state.unlocked) {
    passText.textContent = "먼저 지도에서 근처 음악을 선택하세요.";
    setView("map");
    return;
  }

  listenProgress.style.width = "72%";
  if (!state.listened) {
    state.listened = true;
    state.keys += 10;
  }

  passText.textContent = "72% 재생됨 · 취향 포인트 +10K";
  reviewResult.textContent = "피드백을 남기면 취향 포인트가 더 쌓입니다.";
  updateKeys();
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((segment) => segment.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelector("#submitReview").addEventListener("click", () => {
  if (!state.listened) {
    reviewResult.textContent = "70% 이상 들으면 피드백을 남길 수 있어요.";
    return;
  }

  const text = document.querySelector("#reviewText").value.trim();
  let score = 0;
  if (text.length >= 80) score += 20;
  if (/분위기|잔잔|밤|감성|보컬|사운드/.test(text)) score += 20;
  if (/장소|카페|공간|거리|서점|공원/.test(text)) score += 20;
  if (/추천|사람|친구|어울/.test(text)) score += 20;
  if (/아쉬|다만|좋았|기억|후반/.test(text)) score += 20;

  const reward = score >= 80 ? 30 : score >= 60 ? 20 : 10;
  if (!state.reviewed) {
    state.reviewed = true;
    state.keys += reward + 5;
    state.metrics.reviews += 1;
  }

  reviewResult.textContent = `피드백 매치 ${score}점 · 취향 포인트 ${reward + 5}K 추가`;
  updateKeys();
  updateMetrics();
});

document.querySelector("#spendHint").addEventListener("click", () => {
  if (state.keys < 10) {
    walletMessage.textContent = "Indi Points가 부족합니다.";
    return;
  }

  state.keys -= 10;
  walletMessage.textContent = "다음 곡은 정문을 지나 두 번째 불빛 근처에 있습니다.";
  updateKeys();
});

document.querySelector("#applyDiscount").addEventListener("click", () => {
  if (state.discountApplied) {
    walletMessage.textContent = "이미 할인 시뮬레이션이 적용되었습니다.";
    return;
  }

  if (state.keys < 100) {
    walletMessage.textContent = "데모 할인에는 100K가 필요합니다. 감상과 리뷰를 더 진행해보세요.";
    return;
  }

  state.keys -= 100;
  state.discountApplied = true;
  state.metrics.bookings += 1;
  document.querySelector("#discountValue").textContent = "2,000원";
  document.querySelector("#finalPrice").textContent = "13,000원";
  walletMessage.textContent = "Indi Points 할인이 적용되었습니다.";
  updateKeys();
  updateMetrics();
});

renderMapMarkers();
renderAll();

document.querySelector(".phone-app").dataset.view = "home";

if (storedKakaoMapKey) {
  initializeKakaoMap();
}

window.addEventListener("load", () => {
  const splashScreen = document.querySelector("#splashScreen");
  window.setTimeout(() => {
    splashScreen?.classList.add("hide");
  }, 2000);
  window.setTimeout(() => {
    splashScreen?.remove();
  }, 2400);
});
