/* =======================================
    God Tier A16 Anime Tracker v3.1 - FINAL FIXES (V2)
========================================= */

// --- Constants & Utilities ---
const LS_KEY = "a16_v3_data";
const LS_SETTINGS_KEY = "a16_v3_settings";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () =>
  "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function toast(txt, type = "") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = txt;
  t.className = "toast show" + (type ? " " + type : "");
  setTimeout(() => t.classList.remove("show"), 2500);
}

let state = {
  items: JSON.parse(localStorage.getItem(LS_KEY) || "[]").map((item) => ({
    id: item.id || uid(),
    title: item.title || "Untitled",
    alt: item.alt || "",
    total: +item.total || 0,
    watched: +item.watched || 0,
    status: item.status || "watching",
    rating: +item.rating || null,
    image: item.image || null,
    anilistId: item.anilistId || null,
  })),
  settings: JSON.parse(localStorage.getItem(LS_SETTINGS_KEY) || "{}"),
};

// --- Settings Persistence ---
function getSetting(key, defaultValue) {
  return state.settings[key] !== undefined ? state.settings[key] : defaultValue;
}
function saveSettings() {
  localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(state.settings));
  toast("Settings Saved!", "success");
  renderTracker();
}
function initSettings() {
  // (Input retrieval logic remains the same)
  $("#defaultEpisodes").value = getSetting("defaultEpisodes", 12);
  $("#episodeDuration").value = getSetting("episodeDuration", 24);

  $("#settingsForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    state.settings.defaultEpisodes = +data.defaultEpisodes;
    state.settings.episodeDuration = +data.episodeDuration;
    saveSettings();
  });

  $("#clearCacheBtn")?.addEventListener("click", () => {
    let count = 0;
    for (const key in localStorage) {
      if (key.startsWith("anilist_")) {
        localStorage.removeItem(key);
        count++;
      }
    }
    toast(`Cleared ${count} AniList API cache entries.`, "success");
  });
}

// --- Tracker & Stats Functions ---
function saveTracker() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.items));
  renderTracker();
}
function renderStats(items) {
  // ... (Stats rendering logic)
  const statsContainer = $("#sideStats");
  if (!statsContainer) return;

  const totalAnime = items.length;
  const completed = items.filter((i) => i.status === "completed").length;
  const watching = items.filter((i) => i.status === "watching").length;

  const totalEpisodes = items.reduce((sum, i) => sum + i.total, 0);
  const watchedEpisodes = items.reduce((sum, i) => sum + i.watched, 0);

  const totalDuration = totalEpisodes * getSetting("episodeDuration", 24);
  const watchedDuration = watchedEpisodes * getSetting("episodeDuration", 24);

  const timeToString = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} hr`;
    return `${(minutes / (60 * 24)).toFixed(1)} days`;
  };

  statsContainer.innerHTML = `
    <h3><i class="mdi mdi-chart-donut"></i> Tracker Summary</h3>
    <p class="m3-label">Total Titles: ${totalAnime}</p>
    <p class="m3-label">Completed: ${completed}</p>
    <p class="m3-label">Watching: ${watching}</p>
    <hr style="border-color: var(--color-outline); margin: 1rem 0;">
    <p class="m3-label">Total Episodes: ${totalEpisodes}</p>
    <p class="m3-label">Episodes Watched: ${watchedEpisodes}</p>
    <p class="m3-label">Time Spent: ${timeToString(watchedDuration)}</p>
    <p class="m3-label">Time Remaining: ${timeToString(
      totalDuration - watchedDuration
    )}</p>
  `;
}

function renderTracker() {
  const trackerGrid = $("#trackerGrid");
  const trackerEmpty = $("#trackerEmpty");
  if (!trackerGrid || !trackerEmpty) return;

  const quickSearch = $("#quickSearch").value.toLowerCase();
  const statusFilter = $("#statusFilter").value;
  const sortBy = $("#sortBy").value;

  let filteredItems = state.items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(quickSearch) ||
      item.alt.toLowerCase().includes(quickSearch);
    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // (Sort logic remains the same)

  renderStats(filteredItems);

  trackerGrid.innerHTML = filteredItems
    .map(
      (item) => `
    <div class="m3-card card" data-id="${item.id}" data-watched="${
        item.watched
      }" data-total="${item.total}" data-status="${
        item.status
      }" style="--card-color: ${item.color || "#1a1a1a"};">
        <div class="poster" onclick="editAnime('${item.id}')">
            ${
              item.image
                ? `<img src="${item.image}" alt="${item.title}">`
                : `<div class="no-poster">${item.title}</div>`
            }
            <div class="card-overlay">${item.watched}/${item.total}</div>
        </div>
        <div class="meta">
            <h4 class="title" onclick="editAnime('${item.id}')">${
        item.title
      }</h4>
            <p class="sub">${item.status.toUpperCase()} ${
        item.rating ? `| ★ ${item.rating}` : ""
      }</p>
            <div class="pbar-text">
                <span>Progress</span>
                <span>${((item.watched / (item.total || 1)) * 100).toFixed(
                  0
                )}%</span>
            </div>
            <div class="pbar"><i style="width: ${Math.min(
              100,
              (item.watched / (item.total || 1)) * 100
            )}%;"></i></div>
            <div class="card-actions">
                <button class="m3-icon-btn action-inc" data-id="${
                  item.id
                }" title="Watch Episode"><i class="mdi mdi-plus-circle"></i></button>
                <button class="m3-icon-btn action-dec" data-id="${
                  item.id
                }" title="Rewind Episode"><i class="mdi mdi-minus-circle"></i></button>
                <button class="m3-icon-btn action-del" data-id="${
                  item.id
                }" title="Delete"><i class="mdi mdi-trash-can-outline"></i></button>
            </div>
        </div>
    </div>
  `
    )
    .join("");

  trackerEmpty.style.display = filteredItems.length === 0 ? "flex" : "none";

  // (Event listeners for buttons remain the same)
}

function editAnime(id) {
  // (Modal functions and logic remain the same)
}
// (All other form and button handlers remain the same)

// --- AniList API & Caching ---
async function anilistQuery(query, variables = {}, retries = 2) {
  // (API fetch and caching logic remains the same)
  try {
    const cacheKey = `anilist_${JSON.stringify(variables)}`;
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "null");

    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return cache.data;
    }
    // ... (fetch logic)
    const res = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0].message);

    localStorage.setItem(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), data })
    );

    return data;
  } catch (error) {
    // ... (retry and cache fallback logic)
    const cache = JSON.parse(
      localStorage.getItem(`anilist_${JSON.stringify(variables)}`) || "null"
    );
    if (cache) {
      toast("Using cached data (API error/offline)", "danger");
      return cache.data;
    }
    toast(
      `API Error: ${error.message || "Check network connection."}`,
      "danger"
    );
    throw error;
  }
}

// --- Discover/Search Functions & Logic ---
function createSkeletonCards(container, count) {
  // (Skeleton card rendering logic remains the same)
  container.innerHTML = Array(count)
    .fill(0)
    .map(
      () => `
    <div class="m3-card card skeleton">
        <div class="poster"></div>
        <div class="meta">
            <div class="title-skeleton"></div>
            <div class="sub-skeleton"></div>
        </div>
    </div>
  `
    )
    .join("");
}
function getDiscoverFilters() {
  // (Filter retrieval logic remains the same)
  return {
    limit: +($("#discoverLimit")?.value || 8),
    season: $("#seasonFilter")?.value || "all",
    year: +($("#yearFilter")?.value || 0),
    genre: $("#genreFilter")?.value || "all",
  };
}

async function loadDiscover() {
  // (Core logic for fetching unique data for each grid remains the same)
  const filters = getDiscoverFilters();
  const { limit, season, year, genre } = filters;
  const trendingGrid = $("#trendingGrid");
  const popularGrid = $("#popularGrid");
  const newGrid = $("#newGrid");
  const topGrid = $("#topGrid");

  [trendingGrid, popularGrid, newGrid, topGrid].forEach((grid) =>
    createSkeletonCards(grid, limit)
  );

  function buildFilterStr() {
    let str = "";
    if (season && season !== "all") str += ` season: "${season}",`;
    if (year) str += ` seasonYear: ${year},`;
    if (genre && genre !== "all") str += ` genre_in: ["${genre}"],`;
    return str;
  }

  const baseQuery = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, ${buildFilterStr()}) {
          id title { romaji native english } coverImage { large extraLarge color } 
          bannerImage episodes status season seasonYear averageScore popularity genres studios { nodes { name } }
        }
      }
    }
  `;

  const trendingVars = {
    page: 1,
    perPage: limit,
    sort: ["TRENDING_DESC", "POPULARITY_DESC"],
  };
  const popularVars = { page: 1, perPage: limit, sort: ["POPULARITY_DESC"] };
  const newVars = { page: 1, perPage: limit, sort: ["START_DATE_DESC"] };
  const topVars = {
    page: 1,
    perPage: limit,
    sort: ["SCORE_DESC", "POPULARITY_DESC"],
  };

  try {
    const [trending, popular, newAnime, top] = await Promise.all([
      anilistQuery(baseQuery, trendingVars),
      anilistQuery(baseQuery, popularVars),
      anilistQuery(baseQuery, newVars),
      anilistQuery(baseQuery, topVars),
    ]);

    // Render each grid separately with its unique data
    trendingGrid.innerHTML = "";
    trending.data.Page.media.forEach(renderDiscoverCard(trendingGrid));

    popularGrid.innerHTML = "";
    popular.data.Page.media.forEach(renderDiscoverCard(popularGrid));

    newGrid.innerHTML = "";
    newAnime.data.Page.media.forEach(renderDiscoverCard(newGrid));

    topGrid.innerHTML = "";
    top.data.Page.media.forEach(renderDiscoverCard(topGrid));
  } catch (error) {
    [trendingGrid, popularGrid, newGrid, topGrid].forEach((grid) => {
      grid.innerHTML = '<div class="empty">Failed to load data.</div>';
    });
  }
}

function renderDiscoverCard(grid) {
  // (Card rendering logic remains the same)
  return (item) => {
    const card = document.createElement("div");
    card.className = "m3-card card discover-card";
    card.dataset.anilistId = item.id;
    card.style.setProperty("--card-color", item.coverImage.color || "#1a1a1a");

    const title = item.title.english || item.title.romaji || item.title.native;
    const score = item.averageScore ? `★ ${item.averageScore / 10}` : "N/A";
    const subText = `${item.seasonYear || "??"} ${
      item.season || ""
    } | ${score}`;

    card.innerHTML = `
      <div class="poster">
          <img src="${item.coverImage.large}" alt="${title}">
          <div class="card-overlay">
              <span class="score">${score}</span>
              <span class="status">${item.status}</span>
          </div>
      </div>
      <div class="meta">
          <h4 class="title">${title}</h4>
          <p class="sub">${subText}</p>
          <button class="m3-button primary small" onclick="addFromDiscover(this)" data-title="${title}" data-image="${
      item.coverImage.large
    }" data-anilist-id="${item.id}" data-episodes="${
      item.episodes || getSetting("defaultEpisodes", 12)
    }">
              <i class="mdi mdi-plus"></i> Add
          </button>
      </div>
    `;
    grid.appendChild(card);
  };
}

function getSearchFilters() {
  // (Filter retrieval logic remains the same)
}

// (searchForm event listener remains the same)

// --- Tab Switching & Initialization ---
$$("nav .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    // Deactivate all tabs
    $$("nav .tab").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    // Activate clicked tab
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    // Switch panels
    $$("main .tab-panel").forEach((panel) => {
      const isActive = panel.id === tab;
      panel.classList.toggle("active", isActive);
    });

    // Call render/load functions
    if (tab === "discover") {
      if (!$("#yearFilter").value) {
        $("#yearFilter").value = new Date().getFullYear();
      }
      loadDiscover();
    }
    if (tab === "tracker") renderTracker();
    if (tab === "search")
      $("#searchResults").innerHTML =
        '<div class="empty-state"><p>Enter a query and hit search to find anime on AniList.</p></div>';
  });
});

// --- Initial Setup ---
function initialize() {
  initSettings();
  // Auto-set current season/year filters for discover
  const now = new Date();
  const month = now.getMonth();
  let season;
  if (month >= 2 && month <= 4) season = "SPRING";
  else if (month >= 5 && month <= 7) season = "SUMMER";
  else if (month >= 8 && month <= 10) season = "FALL";
  else season = "WINTER";

  if ($("#seasonFilter")) $("#seasonFilter").value = season;
  if ($("#yearFilter")) $("#yearFilter").value = now.getFullYear();

  // Default to 'Tracker' tab on initial load
  renderTracker(); // Render tracker content first
  $("#tracker").classList.add("active");
  $("#trackerTab")?.classList.add("active");

  // Ensure the discover content loads when clicked for the first time
  $("#discoverTab")?.addEventListener("click", loadDiscover, { once: true });
}

initialize();
