const demoTracks = [
  {
    title: "밤 산책",
    artist: "Blue Room",
    place: "정문 앞 카페",
    distance: 18,
    score: 87,
    tags: ["잔잔함", "밤", "산책"],
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

const storedClientId = localStorage.getItem("jamendoClientId");
if (storedClientId) clientInput.value = storedClientId;

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
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

function setImage(element, src) {
  if (!src) {
    element.removeAttribute("src");
    element.style.background = "linear-gradient(135deg, #171216, #3177c5)";
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
  document.querySelector("#heroTrackTitle").textContent = track.title;
  document.querySelector("#heroTrackArtist").textContent = `${track.artist} · ${track.place} · ${track.distance}m`;
  document.querySelector("#dropTitle").textContent = track.title;
  document.querySelector("#dropMeta").textContent = `${track.artist} · ${track.place} · ${track.distance}m`;
  document.querySelector("#playerTitle").textContent = track.title;
  document.querySelector("#playerHeading").textContent = track.title;
  document.querySelector("#playerArtist").textContent = track.artist;
  document.querySelector("#heroTags").innerHTML = track.tags.map((tag) => `<span>${tag}</span>`).join("");
  document.querySelector("#distanceBar").style.width = `${Math.max(14, 100 - track.distance)}%`;

  setImage(document.querySelector("#heroCover"), track.image);
  setImage(document.querySelector("#dropCover"), track.image);
  setImage(document.querySelector("#playerCover"), track.image);

  if (track.audio) {
    audioPlayer.src = track.audio;
    audioPlayer.disabled = false;
  } else {
    audioPlayer.removeAttribute("src");
  }

  passText.textContent = state.unlocked
    ? "해금 완료 · 24시간 감상 가능"
    : "아직 해금 전입니다.";

  document.querySelector("#unlockStatus").textContent =
    track.distance <= 30 ? "해금 가능: 반경 안에 있습니다." : "아직 멀어요. 데모 위치 이동을 눌러 반경 안으로 들어가세요.";
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
    apiStatus.textContent = `Jamendo 트랙 ${state.tracks.length}개를 동선 드롭으로 배치했습니다.`;
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

  passText.textContent = "해금 완료 · 24시간 감상 가능 · 현장 발견 리워드 +5K";
  document.querySelector("#unlockStatus").textContent = "해금 완료: 감상권이 발급되었습니다.";
  updateKeys();
  updateMetrics();
  setView("track");
});

document.querySelector("#listenButton").addEventListener("click", () => {
  if (!state.unlocked) {
    passText.textContent = "먼저 지도에서 현장 해금을 진행하세요.";
    setView("map");
    return;
  }

  listenProgress.style.width = "72%";
  if (!state.listened) {
    state.listened = true;
    state.keys += 10;
  }

  passText.textContent = "감상률 72% · 감상 완료 리워드 +10K";
  reviewResult.textContent = "리뷰를 제출하면 구체성 점수에 따라 추가 컬처 키를 받을 수 있습니다.";
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
    reviewResult.textContent = "감상률 70%를 먼저 달성해야 리뷰 리워드를 받을 수 있습니다.";
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

  reviewResult.textContent = `리뷰 품질 ${score}점 · 리뷰 리워드 ${reward}K · 피드백 리워드 5K 지급`;
  updateKeys();
  updateMetrics();
});

document.querySelector("#spendHint").addEventListener("click", () => {
  if (state.keys < 10) {
    walletMessage.textContent = "컬처 키가 부족합니다.";
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
  walletMessage.textContent = "컬처 키 할인이 적용되었습니다.";
  updateKeys();
  updateMetrics();
});

renderMapMarkers();
renderAll();
const state = {
  keys: 25,
  unlocked: false,
  listened: false,
  reviewed: false,
  discountApplied: false,
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

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
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

navButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelector("#saveRoute").addEventListener("click", () => {
  const mood = document.querySelector("#moodSelect").value;
  document.querySelector("#scoreValue").textContent = mood.includes("청춘") ? "79" : mood.includes("카페") ? "82" : "87";
  setView("map");
});

document.querySelector("#moveCloserButton").addEventListener("click", () => {
  const userDot = document.querySelector("#userDot");
  userDot.setAttribute("cx", "548");
  userDot.setAttribute("cy", "153");
  document.querySelector("#distanceBar").style.width = "96%";
  document.querySelector("#dropMeta").textContent = "Blue Room · 정문 앞 카페 · 8m";
  document.querySelector("#unlockStatus").textContent = "해금 가능: 반경 안에 있습니다.";
});

document.querySelector("#unlockButton").addEventListener("click", () => {
  if (!state.unlocked) {
    state.unlocked = true;
    state.keys += 5;
    state.metrics.unlocks += 1;
    state.metrics.discoveries += 1;
  }
  passText.textContent = "해금 완료 · 24시간 감상 가능 · 만료 2026-05-09 20:00";
  document.querySelector("#unlockStatus").textContent = "해금 완료: 24시간 감상권이 발급되었습니다. +5K";
  updateKeys();
  updateMetrics();
  setView("track");
});

document.querySelector("#listenButton").addEventListener("click", () => {
  if (!state.unlocked) {
    passText.textContent = "먼저 지도에서 현장 해금을 진행하세요.";
    setView("map");
    return;
  }
  listenProgress.style.width = "72%";
  if (!state.listened) {
    state.listened = true;
    state.keys += 10;
  }
  passText.textContent = "감상률 72% · 감상 완료 리워드 지급 +10K";
  reviewResult.textContent = "리뷰를 제출하면 구체성 점수에 따라 추가 컬처 키를 받을 수 있습니다.";
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
    reviewResult.textContent = "감상률 70%를 먼저 달성해야 리뷰 리워드를 받을 수 있습니다.";
    return;
  }

  const text = document.querySelector("#reviewText").value.trim();
  let score = 0;
  if (text.length >= 80) score += 20;
  if (/분위기|잔잔|밤|감성|보컬/.test(text)) score += 20;
  if (/장소|카페|공간|거리/.test(text)) score += 20;
  if (/추천|사람|친구/.test(text)) score += 20;
  if (/아쉬|다만|좋았|기억/.test(text)) score += 20;

  const reward = score >= 80 ? 30 : score >= 60 ? 20 : 10;
  if (!state.reviewed) {
    state.reviewed = true;
    state.keys += reward + 5;
    state.metrics.reviews += 1;
  }

  reviewResult.textContent = `리뷰 품질 ${score}점 · 리뷰 리워드 ${reward}K · 피드백 리워드 5K 지급`;
  updateKeys();
  updateMetrics();
});

document.querySelector("#spendHint").addEventListener("click", () => {
  if (state.keys < 10) {
    walletMessage.textContent = "컬처 키가 부족합니다.";
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
  walletMessage.textContent = "컬처 키 할인이 적용되었습니다.";
  updateKeys();
  updateMetrics();
});

updateKeys();
updateMetrics();
