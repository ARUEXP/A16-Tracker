/* =======================================
    God Tier A16 Anime Tracker v3.0
    Full functionality with Discover, Search, Tracker, Settings
========================================= */

// --- Constants & Utilities ---
const LS_KEY = "a16_v3_data";
const LS_SETTINGS_KEY = "a16_v3_settings";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const CACHE_TTL = 1000 * 60 * 60;

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
  // Re-render tracker in case settings (like default episode count) affect display
  renderTracker();
}

function initSettings() {
  // Apply saved settings to the form
  $("#defaultEpisodes").value = getSetting("defaultEpisodes", 12);
  $("#episodeDuration").value = getSetting("episodeDuration", 24);

  // Set up form submission handler
  $("#settingsForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    state.settings.defaultEpisodes = +data.defaultEpisodes;
    state.settings.episodeDuration = +data.episodeDuration;

    saveSettings();
  });

  // Clear Cache button
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
  const episodeDuration = getSetting("episodeDuration", 24);

  const stats = {
    total: items.length,
    watching: items.filter((i) => i.status === "watching").length,
    completed: items.filter((i) => i.status === "completed").length,
    episodes: items.reduce((acc, i) => acc + (i.watched || 0), 0),
    avgRating:
      items.filter((i) => i.rating).reduce((acc, i) => acc + +i.rating, 0) /
      (items.filter((i) => i.rating).length || 1),
  };

  // Calculate total hours using the user-defined episode duration
  const totalHours = stats.episodes * (episodeDuration / 60);

  $("#sideStats").innerHTML = `
    <div class="stat-card"><div class="stat-value">${
      stats.total
    }</div><div class="stat-label">Total Anime</div></div>
    <div class="stat-card"><div class="stat-value">${
      stats.watching
    }</div><div class="stat-label">Watching</div></div>
    <div class="stat-card"><div class="stat-value">${
      stats.completed
    }</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-value">${
      stats.episodes
    }</div><div class="stat-label">Episodes Watched</div></div>
    <div class="stat-card"><div class="stat-value">${Math.round(
      totalHours
    )}</div><div class="stat-label">Total Hours</div></div>
    ${
      stats.avgRating
        ? `<div class="stat-card"><div class="stat-value">${stats.avgRating.toFixed(
            1
          )}</div><div class="stat-label">Avg. Rating</div></div>`
        : ""
    }
  `;
}

function renderTracker() {
  const trackerGrid = $("#trackerGrid");
  const trackerEmpty = $("#trackerEmpty");
  if (!trackerGrid || !trackerEmpty) return;

  $$("#trackerGrid .card.selected").forEach((card) =>
    card.classList.remove("selected")
  );

  const status = $("#statusFilter")?.value || "all";
  const sort = $("#sortBy")?.value || "created";
  const onlyPoster = $("#onlyPoster")?.checked;
  const search = $("#quickSearch")?.value?.toLowerCase() || "";

  let items = Array.isArray(state.items) ? [...state.items] : [];

  items = items.filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (onlyPoster && !item.image) return false;
    if (
      search &&
      !(
        item.title?.toLowerCase().includes(search) ||
        item.alt?.toLowerCase().includes(search)
      )
    )
      return false;
    return true;
  });

  items.sort((a, b) => {
    switch (sort) {
      case "alpha":
        return a.title.localeCompare(b.title);
      case "progress":
        return b.watched / (b.total || 1) - a.watched / (a.total || 1);
      case "rating":
        return (b.rating || 0) - (a.rating || 0);
      default:
        return b.id.localeCompare(a.id);
    }
  });

  trackerGrid.innerHTML = "";

  if (!items.length) {
    trackerEmpty.style.display = "flex";
    trackerEmpty.innerHTML = `<div class="empty"><i class="mdi mdi-movie-search"></i><h3>No anime found</h3><p>Try adjusting your filters or add anime to your list</p></div>`;
    $("#sideStats").innerHTML = "";
    return;
  }

  trackerEmpty.style.display = "none";
  renderStats(items);

  items.forEach((item) => {
    const progress = item.total
      ? Math.min(100, (item.watched / item.total) * 100)
      : 0;
    const card = document.createElement("div");
    card.className = "card animate__animated animate__fadeIn";
    card.dataset.id = item.id;

    card.classList.add(`status-${item.status}`);

    card.innerHTML = `
      <div class="poster">
        <img src="${item.image || ""}" alt="${
      item.title
    }" loading="lazy" onerror="this.onerror=null; this.src='';">
      </div>
      <div class="meta">
        <div class="title" title="${item.title}">${item.title}</div>
        <div class="sub">${item.alt || ""}</div>
        <div class="pbar-text">
            <span>${item.status}</span>
            <span>${item.watched}/${item.total || "?"} Ep.</span>
        </div>
        <div class="pbar"><i style="width:${progress}%"></i></div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) {
        card.classList.toggle("selected");
        toast(
          card.classList.contains("selected")
            ? "Selected for batch action."
            : "Deselected."
        );
      } else if (e.shiftKey) {
        item.watched = Math.min(item.total || Infinity, item.watched + 1);
        if (item.watched === item.total && item.total > 0) {
          item.status = "completed";
          toast(`Completed ${item.title}! 🎉`, "success");
        } else {
          toast(`Watched Episode ${item.watched} of ${item.title}.`);
        }
        saveTracker();
      } else {
        editAnime(item.id);
      }
    });

    trackerGrid.appendChild(card);
  });
}

// --- Batch Update Functions (New Feature) ---

$("#batchUpdateBtn")?.addEventListener("click", () => {
  const selectedCards = $$("#trackerGrid .card.selected");
  const status = $("#batchStatus")?.value;
  const increment = +$("#batchIncrement")?.value || 0;

  if (!selectedCards.length) {
    toast("Select items first!", "danger");
    return;
  }

  selectedCards.forEach((card) => {
    const item = state.items.find((x) => x.id === card.dataset.id);
    if (!item) return;

    // Update Status
    if (status && status !== "nochange") {
      item.status = status;
    }

    // Increment Episodes
    if (increment > 0) {
      item.watched = Math.min(item.total || Infinity, item.watched + increment);
      // Auto-complete if finished after increment
      if (item.watched === item.total && item.total > 0) {
        item.status = "completed";
      }
    }
  });

  saveTracker();
  toast(`Updated ${selectedCards.length} items!`);

  // Reset batch increment input
  $("#batchIncrement").value = 0;
});

// --- Modal Functions ---

function showModal(item) {
  const modal = $("#modal");
  const form = $("#animeForm");
  if (!modal || !form) return;

  modal.showModal();

  form.reset();

  if (item) {
    form.dataset.id = item.id;
    form.dataset.anilistId = item.anilistId || "";
    $("#modalTitle").textContent = "Edit Anime";

    Object.entries(item).forEach(([k, v]) => {
      const input = form.elements.namedItem(k);
      if (input) input.value = v;
    });
    form.elements.namedItem("total").value = +item.total || "";
    form.elements.namedItem("watched").value = +item.watched || 0;
    form.elements.namedItem("rating").value = +item.rating || "";
  } else {
    // New item defaults, pull from settings
    const defaultEpisodes = getSetting("defaultEpisodes", 12);
    form.dataset.id = uid();
    form.dataset.anilistId = "";
    $("#modalTitle").textContent = "Add Anime";
    form.elements.namedItem("total").value = defaultEpisodes; // Use setting
  }
}

function hideModal() {
  $("#modal")?.close();
}
function editAnime(id) {
  const item = state.items.find((x) => x.id === id);
  if (item) showModal(item);
}

// --- Event Listeners: Tracker Actions ---

$("#addBtn")?.addEventListener("click", () => showModal());
$("#cancelBtn")?.addEventListener("click", hideModal);
$("#modalClose")?.addEventListener("click", hideModal);

$("#animeForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));

  const newItem = {
    id: form.dataset.id,
    title: data.title.trim(),
    alt: data.alt.trim(),
    total: +data.total || 0,
    watched: Math.min(+data.watched || 0, +data.total || Infinity),
    status: data.status,
    rating: +data.rating || null,
    image: data.image.trim(),
    anilistId: form.dataset.anilistId || null,
  };

  const index = state.items.findIndex((x) => x.id === newItem.id);

  if (index > -1) {
    state.items[index] = newItem;
    toast(`Updated ${newItem.title}!`);
  } else {
    state.items.push(newItem);
    toast(`Added ${newItem.title}!`);
  }

  saveTracker();
  hideModal();
});

// Auto-fill Cover functionality
$("#autoCoverBtn")?.addEventListener("click", async () => {
  const title = $("#animeForm").elements.namedItem("title").value;
  const form = $("#animeForm");

  if (!title.trim()) {
    toast("Enter a Title first!", "danger");
    return;
  }

  const query = `
        query ($search: String) {
            Media(search: $search, type: ANIME, isAdult: false) {
                id
                coverImage { large }
                episodes
                title { english romaji }
            }
        }
    `;

  try {
    const res = await anilistQuery(query, { search: title });
    const media = res.data?.Media;

    if (media) {
      form.elements.namedItem("image").value = media.coverImage?.large || "";
      form.elements.namedItem("alt").value =
        media.title?.english || media.title?.romaji || "";

      const currentTotal = +form.elements.namedItem("total").value;
      const defaultEpisodes = getSetting("defaultEpisodes", 12);

      // Only update total episodes if the current one is the default/empty/0
      if (currentTotal === defaultEpisodes || currentTotal === 0) {
        form.elements.namedItem("total").value =
          media.episodes || defaultEpisodes;
      }
      form.dataset.anilistId = media.id;
      toast("Cover and details auto-filled!", "success");
    } else {
      toast("No cover found on AniList.", "danger");
    }
  } catch (error) {
    toast("Error fetching cover.", "danger");
  }
});

// Import/Export functionality
$("#exportBtn")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.items)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "a16_anime_tracker.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Data exported successfully!");
});

$("#importBtn")?.addEventListener("click", () => $("#importFile")?.click());
$("#importFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedData = JSON.parse(reader.result);
      if (Array.isArray(importedData)) {
        const existingIds = new Set(state.items.map((item) => item.id));
        const newItems = importedData.filter(
          (item) => !existingIds.has(item.id)
        );
        state.items = [...state.items, ...newItems];
        saveTracker();
        toast(`Imported ${newItems.length} new items!`, "success");
      } else {
        throw new Error("Invalid format");
      }
    } catch (e) {
      toast("Invalid file or format!", "danger");
    }
  };
  reader.readAsText(file);
});

$("#clearBtn")?.addEventListener("click", () => {
  if (
    confirm(
      "🚨 WARNING: This will permanently clear ALL tracked anime data. Are you sure?"
    )
  ) {
    state.items = [];
    saveTracker();
    toast("All tracker data cleared.", "danger");
  }
});

// --- Filter/Sort Event Listeners ---

$("#quickSearch")?.addEventListener("input", () => renderTracker());
$("#clearQuick")?.addEventListener("click", () => {
  $("#quickSearch").value = "";
  renderTracker();
});

["statusFilter", "sortBy", "onlyPoster"].forEach((id) => {
  const el = $("#" + id);
  if (el) {
    el.addEventListener(el.type === "checkbox" ? "change" : "input", () =>
      renderTracker()
    );
  }
});

// --- AniList API & Caching ---

async function anilistQuery(query, variables = {}, retries = 2) {
  try {
    const cacheKey = `anilist_${JSON.stringify(variables)}`;
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "null");

    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return cache.data;
    }

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

    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );

    return data;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return anilistQuery(query, variables, retries - 1);
    }

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
  if (container.parentElement.classList.contains("active")) {
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const skeleton = document.createElement("div");
      skeleton.className = "card skeleton animate__animated animate__fadeIn";
      skeleton.innerHTML = `
          <div class="poster"></div>
          <div class="meta">
            <div class="title-skeleton"></div>
            <div class="sub-skeleton"></div>
          </div>
        `;
      container.appendChild(skeleton);
    }
  }
}

function getDiscoverFilters() {
  const yearInput = $("#yearFilter");
  const currentYear = new Date().getFullYear();
  if (!yearInput.value) {
    yearInput.value = currentYear;
  }

  return {
    season: $("#seasonFilter").value,
    year: yearInput.value,
    genre: $("#genreFilter").value,
    limit: +$("#discoverLimit").value || 8,
  };
}

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

  function buildFilterStr(extra = "") {
    let str = extra;
    // Only apply year/season filter if it's set to a value other than 'all'
    if (season && season !== "all") str += ` season: ${season},`;
    if (year) str += ` seasonYear: ${year},`;
    if (genre && genre !== "all") str += ` genre_in: ["${genre}"],`;
    return str;
  }

  const baseQuery = (sort) =>
    `query ($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:[${sort}],${buildFilterStr()}){id title{romaji native english} coverImage{large extraLarge color} bannerImage episodes status season seasonYear averageScore popularity genres studios{nodes{name}}}}}`;
  const variables = { page: 1, perPage: limit };

  try {
    const [trending, popular, newAnime, top] = await Promise.all([
      anilistQuery(baseQuery("TRENDING_DESC"), variables),
      anilistQuery(baseQuery("POPULARITY_DESC"), variables),
      anilistQuery(baseQuery("START_DATE_DESC"), variables),
      anilistQuery(baseQuery("SCORE_DESC"), variables),
    ]);

    trendingGrid.innerHTML = "";
    trending.data.Page.media.forEach(renderDiscoverCard(trendingGrid));

    popularGrid.innerHTML = "";
    popular.data.Page.media.forEach(renderDiscoverCard(popularGrid));

    newGrid.innerHTML = "";
    newAnime.data.Page.media.forEach(renderDiscoverCard(newGrid));

    topGrid.innerHTML = "";
    top.data.Page.media.forEach(renderDiscoverCard(topGrid));
  } catch (error) {
    // Error toast handled in anilistQuery
    [trendingGrid, popularGrid, newGrid, topGrid].forEach((grid) => {
      if (grid.innerHTML.includes('<div class="loader">Searching...</div>')) {
        grid.innerHTML = '<div class="empty">Failed to load data.</div>';
      }
    });
  }
}

function renderDiscoverCard(grid) {
  return function (a) {
    const c = document.createElement("div");
    c.className = "card animate__animated animate__fadeIn";
    const imgUrl = a.coverImage?.large || "";
    const studios =
      a.studios?.nodes
        ?.map((n) => n.name)
        .slice(0, 2)
        .join(", ") || "Unknown Studio";
    const title =
      a.title?.romaji || a.title?.english || a.title?.native || "Untitled";

    c.addEventListener("click", () =>
      showModal({
        id: uid(),
        title: title,
        alt: a.title?.english || "",
        total: a.episodes || getSetting("defaultEpisodes", 12),
        watched: 0,
        status: "plan",
        rating: null,
        image: a.coverImage?.large || a.coverImage?.medium || "",
        anilistId: a.id,
      })
    );

    c.innerHTML = `
      <div class="poster" style="background-color: ${
        a.coverImage?.color || "#1a1a1a"
      }">
        <img src="${imgUrl}" alt="${title}"
             loading="lazy"
             onerror="this.onerror=null; this.src='';">
        <div class="card-overlay">
          <div class="card-stats">
            <span class="score"><i class="mdi mdi-star"></i>${
              a.averageScore ? (a.averageScore / 10).toFixed(1) : "??"
            }</span>
            <span class="episodes"><i class="mdi mdi-play-circle"></i>${
              a.episodes || "??"
            } Ep</span>
          </div>
          ${
            a.genres
              ? `<div class="genres">${a.genres.slice(0, 2).join(" · ")}</div>`
              : ""
          }
        </div>
      </div>
      <div class="meta">
        <div class="title" title="${title}">${title}</div>
        <div class="sub">${studios}</div>
      </div>`;

    grid.appendChild(c);
  };
}

// --- Discover & Search Controls ---

$("#refreshDiscover")?.addEventListener("click", () => loadDiscover());

["discoverLimit", "seasonFilter", "yearFilter", "genreFilter"].forEach((id) => {
  const el = $("#" + id);
  if (el) el.addEventListener("change", loadDiscover);
});

function getSearchFilters() {
  return {
    season: $("#searchSeason").value,
    year: $("#searchYear").value,
    genre: $("#searchGenre").value,
    limit: +$("#searchLimit").value || 8,
  };
}

$("#searchForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#searchQuery").value.trim();
  const { limit, season, year, genre } = getSearchFilters();

  const searchResults = $("#searchResults");
  if (!q) {
    searchResults.innerHTML =
      '<div class="empty">Please enter a search query.</div>';
    return;
  }

  searchResults.innerHTML = '<div class="loader">Searching...</div>';

  let filterStr = "";
  if (season && season !== "all") filterStr += `season: ${season},`;
  if (year) filterStr += `seasonYear: ${year},`;
  if (genre && genre !== "all") filterStr += `genre_in: ["${genre}"],`;

  const query = `
    query ($search:String,$page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){
      media(type:ANIME,search:$search,${filterStr}){
        id title{romaji english native} episodes coverImage{medium large}
      }}}`;

  try {
    const res = await anilistQuery(query, {
      search: q,
      page: 1,
      perPage: limit,
    });
    searchResults.innerHTML = "";

    if (!res.data.Page.media.length) {
      searchResults.innerHTML =
        '<div class="empty">No results found for your query.</div>';
      return;
    }

    res.data.Page.media.forEach((a) => {
      const c = document.createElement("div");
      c.className = "card animate__animated animate__fadeIn";
      const title =
        a.title?.romaji || a.title?.english || a.title?.native || "Untitled";

      c.innerHTML = `
            <div class="poster">
                <img src="${
                  a.coverImage?.medium || a.coverImage?.large || ""
                }" alt="${title}">
            </div>
            <div class="meta">
                <div class="title" title="${title}">${title}</div>
            </div>`;

      c.addEventListener("click", () =>
        showModal({
          id: uid(),
          title: title,
          alt: a.title?.english || "",
          total: a.episodes || getSetting("defaultEpisodes", 12),
          watched: 0,
          status: "plan",
          rating: null,
          image: a.coverImage?.large || a.coverImage?.medium || "",
          anilistId: a.id,
        })
      );
      searchResults.appendChild(c);
    });
  } catch (error) {
    searchResults.innerHTML = `<div class="empty">Error searching. Please try again.</div>`;
  }
});

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
  renderTracker();
  // Set current season/year for discover on startup
  const now = new Date();
  const month = now.getMonth();
  let season;
  if (month >= 2 && month <= 4) season = "SPRING";
  else if (month >= 5 && month <= 7) season = "SUMMER";
  else if (month >= 8 && month <= 10) season = "FALL";
  else season = "WINTER";

  if ($("#seasonFilter")) $("#seasonFilter").value = season;
  if ($("#yearFilter")) $("#yearFilter").value = now.getFullYear();

  // Default to 'Tracker' tab if no tab is specified (i.e., on initial load)
  $("#trackerTab")?.click();
}

initialize();
