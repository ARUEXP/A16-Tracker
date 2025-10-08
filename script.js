/* A16 Tracker v2.0
   - AniList GraphQL for discovery & high-quality covers
   - localStorage persistence
   - simple in-memory caching + rate-friendly requests
   - tabs: tracker | discover | search | settings
*/

/* ========== CONFIG ========== */
const LS_KEY = "a16_v2_data";
const LS_SETTINGS = "a16_v2_settings";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const CACHE_TTL = 1000 * 60 * 10; // 10 min cache for discover
const DEFAULT_DISCOVER_LIMIT = 8;

/* ========== UTIL ========= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const escape = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
const uid = () =>
  "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const throttle = (fn, t) => {
  let busy = false;
  return (...a) => {
    if (busy) return;
    busy = true;
    fn(...a);
    setTimeout(() => (busy = false), t);
  };
};
const toast = (m, t = 1800) => {
  const el = $("#toast");
  el.textContent = m;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), t);
};

/* ========== STORAGE ========== */
let state = { items: [] };
let settings = { theme: "dark", accent: "#06b6d4", autoCover: true };
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) state = JSON.parse(raw);
} catch (e) {
  console.warn("load failed", e);
}
try {
  const s = localStorage.getItem(LS_SETTINGS);
  if (s) settings = JSON.parse(s);
} catch (e) {
  console.warn("settings load");
}
function saveState() {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(LS_KEY, serialized);
    return true;
  } catch (error) {
    console.error("Failed to save state:", error);
    toast("Failed to save changes. Storage might be full.");
    return false;
  }
}

function saveSettings() {
  try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(LS_SETTINGS, serialized);
    applySettings();
    return true;
  } catch (error) {
    console.error("Failed to save settings:", error);
    toast("Failed to save settings. Storage might be full.");
    return false;
  }
}

/* ========== CACHE (memory + localStorage optional) ========== */
// Memory cache for faster access and to reduce localStorage writes
const memoryCache = new Map();

const cacheKey = (k) => `a16_cache_${k}`;

function cacheSet(key, data) {
  const obj = { ts: Date.now(), data };
  const cKey = cacheKey(key);

  // Update memory cache first
  memoryCache.set(cKey, obj);

  try {
    localStorage.setItem(cKey, JSON.stringify(obj));
  } catch (e) {
    console.warn("Cache write failed:", e);
    // If localStorage fails, we still have memory cache
    try {
      // Try to clean up old items to make space
      for (let k of Object.keys(localStorage)) {
        if (k.startsWith("a16_cache_")) {
          localStorage.removeItem(k);
        }
      }
      // Try one more time
      localStorage.setItem(cKey, JSON.stringify(obj));
    } catch (e2) {
      console.error("Cache cleanup and retry failed:", e2);
    }
  }
}

function cacheGet(key) {
  const cKey = cacheKey(key);

  // Check memory cache first for better performance
  const memItem = memoryCache.get(cKey);
  if (memItem) {
    if (Date.now() - memItem.ts <= CACHE_TTL) {
      return memItem.data;
    } else {
      memoryCache.delete(cKey);
    }
  }

  try {
    const raw = localStorage.getItem(cKey);
    if (!raw) return null;

    const o = JSON.parse(raw);
    if (Date.now() - o.ts > CACHE_TTL) {
      localStorage.removeItem(cKey);
      return null;
    }

    // Update memory cache with valid data
    memoryCache.set(cKey, o);
    return o.data;
  } catch (e) {
    console.warn("Cache read failed:", e);
    return null;
  }
}

// Clean up expired cache items periodically
setInterval(() => {
  const now = Date.now();

  // Clean memory cache
  for (let [key, value] of memoryCache.entries()) {
    if (now - value.ts > CACHE_TTL) {
      memoryCache.delete(key);
    }
  }

  // Clean localStorage cache
  try {
    for (let k of Object.keys(localStorage)) {
      if (k.startsWith("a16_cache_")) {
        try {
          const item = JSON.parse(localStorage.getItem(k));
          if (now - item.ts > CACHE_TTL) {
            localStorage.removeItem(k);
          }
        } catch (e) {
          // Remove invalid cache entries
          localStorage.removeItem(k);
        }
      }
    }
  } catch (e) {
    console.warn("Cache cleanup failed:", e);
  }
}, CACHE_TTL);

/* ========== DOM refs & init ========== */
document.addEventListener("DOMContentLoaded", init);

function init() {
  // elements
  const tabs = $$(".tab");
  tabs.forEach((t) => t.addEventListener("click", onTab));
  $("#addBtn").addEventListener("click", () => openModal());
  // allow multiple open-add triggers if present
  $$("#openAdd1, #openAdd2, #openAdd3").forEach(
    (n) => n && n.addEventListener("click", () => openModal())
  );
  $("#modalClose").addEventListener("click", closeModal);
  $("#cancelBtn").addEventListener("click", closeModal);
  $("#animeForm").addEventListener("submit", onSaveAnime);
  $("#autoCoverBtn").addEventListener("click", autoFillCover);
  $("#exportBtn").addEventListener("click", exportJSON);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", onImport);
  $("#clearBtn").addEventListener("click", () => {
    if (confirm("Clear all local data?")) {
      state.items = [];
      saveState();
      renderTracker();
      toast("Cleared");
    }
  });

  // Theme toggle removed from behavior: keep UI stable in dark-only mode.

  $("#quickSearch").addEventListener(
    "input",
    debounce(() => {
      const v = $("#quickSearch").value.trim();
      renderTracker(v);
    }, 180)
  );
  $("#clearQuick").addEventListener("click", () => {
    $("#quickSearch").value = "";
    renderTracker();
    $("#quickSearch").focus();
  });
  $("#globalSearch").addEventListener(
    "input",
    debounce(() => renderTracker($("#globalSearch").value.trim()), 180)
  );
  $("#sortBy").addEventListener("change", () => renderTracker());
  $("#statusFilter").addEventListener("change", () => renderTracker());
  $("#onlyPoster").addEventListener("change", () => renderTracker());
  $("#refreshDiscover").addEventListener("click", () => loadDiscover(true));
  $("#searchForm").addEventListener("submit", onSearchForm);

  // discover auto load when user opens discover tab; also load on init in background
  loadDiscover(false);

  applySettings();
  renderTracker();
  bindDiscoverPlaceholders();
}

/* ========== Tabs handler ========== */
function onTab(e) {
  const tab = e.currentTarget.dataset.tab;
  $$(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === tab));
  if (tab === "discover") loadDiscover(false);
}

/* ========== SETTINGS ========== */
function applySettings() {
  // Keep dark-only UI; still apply accent color if changed via settings
  document.documentElement.style.setProperty(
    "--accent",
    settings.accent || "#06b6d4"
  );
  const accentColor = document.getElementById("accentColor");
  if (accentColor) accentColor.value = settings.accent || "#06b6d4";
  const autoAddCover = document.getElementById("autoAddCover");
  if (autoAddCover) autoAddCover.checked = settings.autoCover;
}

/* ========== TRACKER CRUD & RENDER ========== */
function renderTracker(searchTerm = "") {
  const grid = $("#trackerGrid");
  const items = (state.items || []).slice();
  const statusFilter = $("#statusFilter").value;
  const onlyPoster = $("#onlyPoster").checked;
  const sort = $("#sortBy").value;
  const q = (searchTerm || $("#globalSearch").value || "").toLowerCase();

  let list = items;
  if (q)
    list = list.filter((i) =>
      (i.title + " " + (i.alt || "")).toLowerCase().includes(q)
    );
  if (statusFilter !== "all")
    list = list.filter((i) => i.status === statusFilter);
  if (onlyPoster) list = list.filter((i) => i.image);

  if (sort === "alpha") list.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "progress") list.sort((a, b) => prog(b) - prog(a));
  else if (sort === "rating")
    list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  else list.sort((a, b) => b.created - a.created);

  grid.innerHTML = "";
  if (list.length === 0) {
    $("#trackerEmpty").style.display = "flex";
  } else {
    $("#trackerEmpty").style.display = "none";
  }
  for (const item of list) grid.appendChild(cardFor(item));
  renderSideStats();
}

function cardFor(item) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = item.id;
  const poster = document.createElement("div");
  poster.className = "poster";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = item.title;
  img.src = item.image || unsplashFallback(item.title);
  poster.appendChild(img);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<div class="title">${escape(
    item.title
  )}</div><div class="sub">${escape(item.alt || "")}</div>
    <div class="small">Status: ${item.status} • ${item.watched}/${
    item.total
  } • Rating: ${item.rating || "—"}</div>
    <div class="pbar"><i style="width:${prog(item)}%"></i></div>
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <div style="display:flex;gap:8px"><button class="icon" data-act="inc">+</button><button class="icon" data-act="dec">−</button></div>
      <div style="display:flex;gap:8px"><button class="icon" data-act="edit">✎</button><button class="icon" data-act="del">🗑</button></div>
    </div>`;
  el.appendChild(poster);
  el.appendChild(meta);

  el.querySelectorAll("[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const a = btn.dataset.act;
      if (a === "inc") {
        item.watched = Math.min(
          Number(item.total || 0),
          Number(item.watched || 0) + 1
        );
        saveState();
        renderTracker();
        toast("Progress +1");
      }
      if (a === "dec") {
        item.watched = Math.max(0, Number(item.watched || 0) - 1);
        saveState();
        renderTracker();
        toast("Progress -1");
      }
      if (a === "edit") {
        openModal(item.id);
      }
      if (a === "del") {
        if (!confirm(`Delete ${item.title}?`)) return;
        state.items = state.items.filter((x) => x.id !== item.id);
        saveState();
        renderTracker();
        toast("Deleted");
      }
    })
  );

  return el;
}

function prog(it) {
  const t = Number(it.total) || 0,
    w = Number(it.watched) || 0;
  return t === 0 ? 0 : Math.round((w / t) * 100);
}

/* ========== Modal & add/edit ========== */
function openModal(id = null) {
  const modal = $("#modal");
  modal.setAttribute("aria-hidden", "false");
  modal.style.display = "grid";
  const form = $("#animeForm");
  form.reset();
  if (id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    form.title.value = item.title;
    form.alt.value = item.alt || "";
    form.image.value = item.image || "";
    form.total.value = item.total || 12;
    form.watched.value = item.watched || 0;
    form.status.value = item.status || "watching";
    form.rating.value = item.rating || "";
    $("#modalTitle").textContent = "Edit Anime";
    form.dataset.editing = id;
  } else {
    $("#modalTitle").textContent = "Add Anime";
    delete form.dataset.editing;
  }
  setTimeout(() => form.title.focus(), 80);
}

function closeModal() {
  $("#modal").setAttribute("aria-hidden", "true");
  $("#modal").style.display = "none";
}

function validateAnimeForm(form) {
  const errors = [];

  // Title validation
  const title = form.title.value.trim();
  if (!title) {
    errors.push("Title is required");
  } else if (title.length < 2) {
    errors.push("Title must be at least 2 characters");
  } else if (title.length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  // Episodes validation
  const total = Number(form.total.value);
  if (isNaN(total) || total < 1) {
    errors.push("Total episodes must be at least 1");
  } else if (total > 2000) {
    errors.push("Total episodes seems too high (max 2000)");
  }

  const watched = Number(form.watched.value);
  if (isNaN(watched) || watched < 0) {
    errors.push("Episodes watched must be 0 or higher");
  } else if (watched > total) {
    errors.push("Episodes watched cannot exceed total episodes");
  }

  // Image URL validation
  const imageUrl = form.image.value.trim();
  if (imageUrl && !imageUrl.match(/^https?:\/\/.+/i)) {
    errors.push("Image URL must start with http:// or https://");
  }

  // Rating validation
  const rating = form.rating.value;
  if (
    rating &&
    (isNaN(Number(rating)) || Number(rating) < 1 || Number(rating) > 10)
  ) {
    errors.push("Rating must be between 1 and 10");
  }

  // Status validation
  const validStatuses = ["watching", "completed", "onhold", "dropped", "plan"];
  if (!validStatuses.includes(form.status.value)) {
    errors.push("Invalid status selected");
  }

  return errors;
}

async function onSaveAnime(e) {
  e.preventDefault();
  const f = e.target;

  // Validate form
  const errors = validateAnimeForm(f);
  if (errors.length > 0) {
    alert(errors.join("\n"));
    return;
  }

  const title = f.title.value.trim();
  const payload = {
    id: f.dataset.editing || uid(),
    title,
    alt: f.alt.value.trim(),
    image: f.image.value.trim() || "",
    total: Math.max(1, Number(f.total.value || 1)),
    watched: clamp(Number(f.watched.value || 0), 0, Number(f.total.value || 1)),
    status: f.status.value,
    rating: f.rating.value || "",
    created: f.dataset.editing
      ? state.items.find((x) => x.id === f.dataset.editing).created
      : Date.now(),
  };

  if (!payload.image && $("#autoAddCover").checked) {
    // try AniList search for title -> get cover
    try {
      const found = await aniListSearchTitle(title);
      if (found && found.coverImage)
        payload.image =
          found.coverImage.extraLarge ||
          found.coverImage.large ||
          found.coverImage.medium ||
          "";
    } catch (e) {
      console.warn("ani auto cover fail", e);
    }
    if (!payload.image) payload.image = unsplashFallback(title);
  }

  if (f.dataset.editing) {
    state.items = state.items.map((x) => (x.id === payload.id ? payload : x));
    toast("Saved");
  } else {
    state.items.unshift(payload);
    toast("Added");
  }
  saveState();
  closeModal();
  renderTracker();
}

/* ========== Auto-fill cover using AniList search (first match) ========== */
async function autoFillCover() {
  const title = $("#animeForm").title.value.trim();
  if (!title) return toast("Enter title first");
  try {
    const found = await aniListSearchTitle(title);
    if (found && found.coverImage) {
      $("#animeForm").image.value =
        found.coverImage.extraLarge ||
        found.coverImage.large ||
        found.coverImage.medium ||
        "";
      toast("Cover filled (AniList)");
      return;
    }
  } catch (e) {
    console.warn(e);
  }
  $("#animeForm").image.value = unsplashFallback(title);
  toast("Fallback cover used");
}

/* ========== AniList GraphQL helpers with Rate Limiting ========== */
const API_RATE_LIMIT = {
  maxRequests: 90, // AniList allows 90 requests per minute
  windowMs: 60 * 1000, // 1 minute window
  requests: [],
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const now = Date.now();

  // Clean up old requests
  API_RATE_LIMIT.requests = API_RATE_LIMIT.requests.filter(
    (time) => now - time < API_RATE_LIMIT.windowMs
  );

  if (API_RATE_LIMIT.requests.length >= API_RATE_LIMIT.maxRequests) {
    // Calculate how long to wait
    const oldestRequest = API_RATE_LIMIT.requests[0];
    const waitTime = API_RATE_LIMIT.windowMs - (now - oldestRequest);

    if (waitTime > 0) {
      console.warn(
        `Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`
      );
      await sleep(waitTime);
    }
  }

  // Add this request to the queue
  API_RATE_LIMIT.requests.push(now);
}

async function aniListGraphQL(query, variables = {}) {
  // Wait for rate limit if needed
  await waitForRateLimit();

  try {
    const res = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Add user agent to be more respectful to the API
        "User-Agent": "A16-Tracker/2.0 (github.com/ARUEXP/A16-Tracker)",
      },
      body: JSON.stringify({ query, variables }),
    });

    // Handle rate limit headers if provided
    const remaining = res.headers.get("X-RateLimit-Remaining");
    if (remaining !== null) {
      const remainingNum = parseInt(remaining, 10);
      if (!isNaN(remainingNum) && remainingNum < 10) {
        // If less than 10 requests remaining, add artificial delay
        await sleep(1000);
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limit exceeded
        const retryAfter = res.headers.get("Retry-After");
        const waitTime = (retryAfter ? parseInt(retryAfter, 10) : 60) * 1000;
        await sleep(waitTime);
        // Retry the request
        return aniListGraphQL(query, variables);
      }
      throw new Error("AniList network error " + res.status);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors.map((x) => x.message).join("; "));
    }

    return json.data;
  } catch (error) {
    console.error("AniList API error:", error);
    // If it's a network error, retry after a delay
    if (error.name === "TypeError" && error.message.includes("network")) {
      await sleep(5000);
      return aniListGraphQL(query, variables);
    }
    throw error;
  }
}

async function aniListSearchTitle(title) {
  const q = `
  query ($search:String) {
    Page(perPage:1){ media(search:$search, type: ANIME){ id title{ romaji english native } coverImage { extraLarge large medium } bannerImage averageScore popularity } }
  }`;
  const data = await aniListGraphQL(q, { search: title });
  const m = data?.Page?.media?.[0];
  if (!m) return null;
  return {
    id: m.id,
    title: m.title,
    coverImage: m.coverImage,
    banner: m.bannerImage,
    score: m.averageScore,
    popularity: m.popularity,
  };
}

/* ========== Discover — trending/popular/new/top using AniList queries ========== */
async function loadDiscover(force = false) {
  // use cache
  const limit = Number($("#discoverLimit").value || DEFAULT_DISCOVER_LIMIT);
  const keys = ["trending", "popular", "new", "top"].map(
    (k) => k + "_" + limit
  );
  keys.forEach((k) => {
    const containerId = mapDiscoverKeyToContainer(k.split("_")[0]);
    const cont = document.getElementById(containerId);
    if (!cont) return;
    cont.innerHTML = '<div class="loader">Loading...</div>';
  });

  // Load from cache if present and not forced
  if (!force) {
    const t0 = cacheGet("discover_" + limit);
    if (t0) {
      populateDiscover(t0);
      return;
    }
  }

  try {
    // We'll issue 1 request per section (lightweight queries)
    const trendingQ = `query ($per:Int){ Page(perPage:$per){ media(sort: TRENDING_DESC, type: ANIME){ id title{romaji,english} coverImage{large,extraLarge,medium} episodes averageScore } } }`;
    const popularQ = `query ($per:Int){ Page(perPage:$per){ media(sort: POPULARITY_DESC, type: ANIME){ id title{romaji,english} coverImage{large,extraLarge,medium} episodes averageScore } } }`;
    const newQ = `query ($per:Int){ Page(perPage:$per){ media(sort: START_DATE_DESC, type: ANIME){ id title{romaji,english} coverImage{large,extraLarge,medium} episodes averageScore } } }`;
    const topQ = `query ($per:Int){ Page(perPage:$per){ media(sort: SCORE_DESC, type: ANIME){ id title{romaji,english} coverImage{large,extraLarge,medium} episodes averageScore } } }`;

    // run in parallel but be mindful; small 'per' keeps it lightweight
    const [trending, popular, newer, top] = await Promise.all([
      aniListGraphQL(trendingQ, { per: limit }),
      aniListGraphQL(popularQ, { per: limit }),
      aniListGraphQL(newQ, { per: limit }),
      aniListGraphQL(topQ, { per: limit }),
    ]);

    const payload = {
      trending: trending.Page.media,
      popular: popular.Page.media,
      newer: newer.Page.media,
      top: top.Page.media,
    };
    cacheSet("discover_" + limit, payload);
    populateDiscover(payload);
  } catch (err) {
    console.warn("discover failed", err);
    // try to populate what we can from cache else fail silently
    const c = cacheGet("discover_" + limit);
    if (c) populateDiscover(c);
    else {
      ["trendingGrid", "popularGrid", "newGrid", "topGrid"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="loader">Failed to load</div>';
      });
    }
  }
}

function mapDiscoverKeyToContainer(key) {
  if (key === "trending") return "trendingGrid";
  if (key === "popular") return "popularGrid";
  if (key === "new") return "newGrid";
  if (key === "top") return "topGrid";
  return "";
}

function populateDiscover(payload) {
  // fill grids
  renderDiscoverSection("trendingGrid", payload.trending || []);
  renderDiscoverSection("popularGrid", payload.popular || []);
  renderDiscoverSection("newGrid", payload.newer || []);
  renderDiscoverSection("topGrid", payload.top || []);
}

function renderDiscoverSection(containerId, items) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (!items || items.length === 0) {
    el.innerHTML = '<div class="loader">No items</div>';
    return;
  }
  items.forEach((m) => {
    const card = document.createElement("article");
    card.className = "card";
    const poster = document.createElement("div");
    poster.className = "poster";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = m.title?.romaji || m.title?.english || "cover";
    img.src =
      (m.coverImage &&
        (m.coverImage.extraLarge ||
          m.coverImage.large ||
          m.coverImage.medium)) ||
      unsplashFallback(m.title?.romaji || m.title?.english);
    poster.appendChild(img);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="title">${escape(
      m.title?.romaji || m.title?.english
    )}</div>
      <div class="sub">Episodes: ${m.episodes || "?"} • Score: ${
      m.averageScore || "—"
    }</div>
      <div style="margin-top:auto;display:flex;justify-content:space-between">
        <button class="btn primary" data-id="${
          m.id
        }" data-action="add">Add</button>
        <button class="btn ghost" data-id="${
          m.id
        }" data-action="view">View</button>
      </div>`;
    card.appendChild(poster);
    card.appendChild(meta);
    el.appendChild(card);

    // actions
    meta.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        const act = b.dataset.action;
        if (act === "add") {
          const obj = {
            id: "local_" + uid(),
            title: m.title?.romaji || m.title?.english || "Unknown",
            alt: "",
            image:
              (m.coverImage &&
                (m.coverImage.extraLarge || m.coverImage.large)) ||
              "",
            total: m.episodes || 0,
            watched: 0,
            status: "plan",
            rating: "",
            created: Date.now(),
          };
          state.items.unshift(obj);
          saveState();
          renderTracker();
          toast("Added to your list");
        } else if (act === "view") {
          // open AniList page in new tab
          window.open("https://anilist.co/anime/" + m.id, "_blank", "noopener");
        }
      })
    );
  });
}

/* ========== Search (AniList) ========== */
async function onSearchForm(e) {
  e.preventDefault();
  const q = $("#searchQuery").value.trim();
  const limit = Number($("#searchLimit").value || 8);
  if (!q) return toast("Type a query");
  $("#searchResults").innerHTML = '<div class="loader">Searching...</div>';
  try {
    const query = `query($search:String,$per:Int){ Page(perPage:$per){ media(search:$search,type:ANIME){ id title{romaji,english} coverImage{extraLarge,large,medium} episodes averageScore } } }`;
    const data = await aniListGraphQL(query, { search: q, per: limit });
    const list = data.Page.media || [];
    const container = $("#searchResults");
    container.innerHTML = "";
    list.forEach((m) => {
      const c = document.createElement("article");
      c.className = "card";
      const p = document.createElement("div");
      p.className = "poster";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = m.title?.romaji || m.title?.english;
      img.src =
        (m.coverImage &&
          (m.coverImage.extraLarge ||
            m.coverImage.large ||
            m.coverImage.medium)) ||
        unsplashFallback(m.title?.romaji);
      p.appendChild(img);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<div class="title">${escape(
        m.title?.romaji || m.title?.english
      )}</div><div class="sub">Episodes: ${m.episodes || "?"} • Score: ${
        m.averageScore || "—"
      }</div>
        <div style="margin-top:auto;display:flex;gap:8px"><button class="btn primary" data-id="${
          m.id
        }" data-action="add">Add</button><button class="btn ghost" data-id="${
        m.id
      }" data-action="view">View</button></div>`;
      c.appendChild(p);
      c.appendChild(meta);
      container.appendChild(c);
      meta.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.action === "add") {
            const obj = {
              id: "local_" + uid(),
              title: m.title?.romaji || m.title?.english,
              alt: "",
              image:
                (m.coverImage &&
                  (m.coverImage.extraLarge || m.coverImage.large)) ||
                "",
              total: m.episodes || 0,
              watched: 0,
              status: "plan",
              rating: "",
              created: Date.now(),
            };
            state.items.unshift(obj);
            saveState();
            renderTracker();
            toast("Added to your list");
          } else
            window.open(
              "https://anilist.co/anime/" + m.id,
              "_blank",
              "noopener"
            );
        })
      );
    });
  } catch (err) {
    console.warn(err);
    $("#searchResults").innerHTML = '<div class="loader">Search failed</div>';
  }
}

/* ========== Export / Import ========== */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "a16_export.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Exported JSON");
}
function onImport(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      parsed.forEach((p) => (p.id = p.id || "local_" + uid()));
      state.items = parsed.concat(state.items);
      saveState();
      renderTracker();
      toast("Imported");
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };
  r.readAsText(f);
  e.target.value = "";
}

/* ========== small helpers ========== */
function unsplashFallback(title = "anime poster") {
  return "https://images.unsplash.com/photo-1541562232579-512a21360020?auto=format&fit=crop&w=1200&q=80";
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function debounce(fn, wait = 200, options = {}) {
  let timeoutId;
  let lastArgs;
  let lastThis;
  let lastCallTime;
  let lastInvokeTime = 0;
  let maxWait = options.maxWait;
  let leading = !!options.leading;
  let trailing = "trailing" in options ? !!options.trailing : true;

  function invokeFunc() {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = Date.now();

    if (fn.apply) {
      fn.apply(thisArg, args);
    } else {
      fn(...(args || []));
    }
  }

  function startTimer(pendingFunc, wait) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(pendingFunc, wait);
  }

  function cancelTimer() {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }

  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  }

  function remainingWait(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return maxWait === undefined
      ? timeWaiting
      : Math.min(timeWaiting, maxWait - timeSinceLastInvoke);
  }

  return function (...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === undefined && leading) {
        lastInvokeTime = lastCallTime;
        startTimer(invokeFunc, wait);
        return invokeFunc();
      }
      if (maxWait !== undefined) {
        startTimer(invokeFunc, wait);
        return invokeFunc();
      }
    }
    if (timeoutId === undefined && trailing) {
      startTimer(invokeFunc, wait);
    }
  };
}

/* ========== initial placeholders and utilities ========== */
function bindDiscoverPlaceholders() {
  ["trendingGrid", "popularGrid", "newGrid", "topGrid"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<div class="loader">Loading...</div>';
  });
}
function renderSideStats() {
  const total = state.items.length;
  const watching = state.items.filter((x) => x.status === "watching").length;
  const completed = state.items.filter((x) => x.status === "completed").length;
  const episodes = state.items.reduce(
    (s, x) => s + (Number(x.watched) || 0),
    0
  );
  $(
    "#sideStats"
  ).innerHTML = `<div class="small">Total: <strong>${total}</strong></div><div class="small">Watching: <strong>${watching}</strong></div><div class="small">Completed: <strong>${completed}</strong></div><div class="small">Episodes: <strong>${episodes}</strong></div>`;
}

/* ========== credits: init ========== */
console.info("A16 AnimeTracker initialized — AniList powered (GraphQL).");
renderTracker();
