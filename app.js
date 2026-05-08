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
