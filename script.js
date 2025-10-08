/* =======================================
    God Tier A16 Anime Tracker v3.1 - FINAL FIXES
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
  // (Stats rendering logic remains the same)
}

function renderTracker() {
  const trackerGrid = $("#trackerGrid");
  const trackerEmpty = $("#trackerEmpty");
  if (!trackerGrid || !trackerEmpty) return;

  // (Filter/sort logic remains the same)

  // (Card rendering and event listeners logic remains the same)
}

// (Batch Update Functions, Modal Functions, Auto-fill Cover functionality,
// Import/Export/Clear buttons, Filter/Sort Event Listeners remain the same)

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
}
function getDiscoverFilters() {
  // (Filter retrieval logic remains the same)
}

/**
 * FIX: Uses unique sort variables for each call to prevent data repetition.
 */
async function loadDiscover() {
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

  // Define the base query to accept the $sort variable
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

  // Define unique variables for each call - THIS IS THE CORE FIX
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

    // Clear and render each grid separately with its unique data
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

// (renderDiscoverCard, getSearchFilters, searchForm event listener remain the same)

// --- Tab Switching & Initialization ---
$$("nav .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    $$("nav .tab").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    $$("main .tab-panel").forEach((panel) => {
      const isActive = panel.id === tab;
      panel.classList.toggle("active", isActive);
    });

    // Call render functions for active tabs
    if (tab === "discover") {
      if (!$("#yearFilter").value) {
        $("#yearFilter").value = new Date().getFullYear();
      }
      loadDiscover();
    }
    if (tab === "tracker") renderTracker();
    if (tab === "search") $("#searchResults").innerHTML = "";
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
