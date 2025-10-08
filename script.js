// =======================================
//     God Tier A16 Anime Tracker v3.1 - FINAL FIXED (V3)
// =======================================

// --- Constants & Utilities ---
const LS_KEY = "a16_v3_data";
const LS_SETTINGS_KEY = "a16_v3_settings";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = () =>
  "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function toast(txt, type = "") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = txt;
  t.className = "toast show" + (type ? " " + type : "");
  setTimeout(() => t.classList.remove("show"), 2500);
}

let state = {
  items: safeParse(localStorage.getItem(LS_KEY), []).map((item) => ({
    id: item.id || uid(),
    title: item.title || "Untitled",
    alt: item.alt || "",
    total: +item.total || 0,
    watched: +item.watched || 0,
    status: item.status || "watching",
    rating: +item.rating || null,
    image: item.image || null,
    anilistId: item.anilistId || null,
    color: item.color || null,
  })),
  settings: safeParse(localStorage.getItem(LS_SETTINGS_KEY), {}),
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
  if ($("#defaultEpisodes"))
    $("#defaultEpisodes").value = getSetting("defaultEpisodes", 12);
  if ($("#episodeDuration"))
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

  $("#clearBtn")?.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to delete ALL tracker data? This cannot be undone."
      )
    ) {
      state.items = [];
      localStorage.removeItem(LS_KEY);
      toast("All tracker data cleared.", "danger");
      renderTracker();
    }
  });

  // Import/Export Logic
  $("#exportBtn")?.addEventListener("click", () => {
    const json = JSON.stringify(state.items, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anime_tracker_data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Data exported successfully!", "success");
  });

  $("#importBtn")?.addEventListener("click", () => {
    $("#importFile").click();
  });

  $("#importFile")?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (Array.isArray(importedData)) {
          state.items = importedData.map((item) => ({
            id: item.id || uid(),
            title: item.title || "Untitled",
            alt: item.alt || "",
            total: +item.total || 0,
            watched: +item.watched || 0,
            status: item.status || "watching",
            rating: +item.rating || null,
            image: item.image || null,
            anilistId: item.anilistId || null,
            color: item.color || null,
          }));
          saveTracker();
          renderTracker();
          toast("Data imported and saved!", "success");
        } else {
          toast("Invalid JSON format. Expected an array.", "danger");
        }
      } catch (error) {
        toast("Failed to parse JSON file.", "danger");
      }
    };
    reader.readAsText(file);
  });
}

// --- Tracker & Stats Functions ---
function saveTracker() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.items));
  renderTracker();
}

function renderStats(items) {
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

  const quickSearch = $("#quickSearch")?.value?.toLowerCase() || "";
  const statusFilter = $("#statusFilter")?.value || "all";
  const sortBy = $("#sortBy")?.value || "created";
  const onlyPoster = $("#onlyPoster")?.checked || false;

  let filteredItems = state.items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(quickSearch) ||
      item.alt.toLowerCase().includes(quickSearch);
    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Sorting logic
  switch (sortBy) {
    case "alpha":
      filteredItems.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "progress":
      filteredItems.sort(
        (a, b) => b.watched / (b.total || 1) - a.watched / (a.total || 1)
      );
      break;
    case "rating":
      filteredItems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case "created":
      filteredItems.sort((a, b) => (a.id > b.id ? -1 : 1));
      break;
  }

  renderStats(filteredItems);

  trackerGrid.innerHTML = filteredItems
    .map((item) => {
      if (onlyPoster && !item.image) return "";

      const isCompleted =
        item.watched >= (item.total || Infinity) && item.status !== "plan";
      const cardClass = `m3-card card ${isCompleted ? "completed-card" : ""}`;

      return `
        <div class="${cardClass}" data-id="${item.id}" data-watched="${
        item.watched
      }" data-total="${item.total}" data-status="${
        item.status
      }" style="--card-color: ${item.color || "#1a1a1a"};">
            <div class="poster">
                ${
                  item.image
                    ? `<img src="${item.image}" alt="${item.title}">`
                    : `<div class="no-poster">${item.title}</div>`
                }
                <div class="card-overlay">${item.watched}/${item.total}</div>
            </div>
            <div class="meta">
                <h4 class="title">${item.title}</h4>
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
    `;
    })
    .join("");

  trackerEmpty.style.display = filteredItems.length === 0 ? "flex" : "none";

  // Attach event listeners
  trackerGrid.querySelectorAll(".action-inc").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateEpisode(btn.dataset.id, 1);
    })
  );
  trackerGrid.querySelectorAll(".action-dec").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateEpisode(btn.dataset.id, -1);
    })
  );
  trackerGrid.querySelectorAll(".action-del").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAnime(btn.dataset.id);
    })
  );
  trackerGrid.querySelectorAll(".poster, .title").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = el.closest(".card");
      if (card) editAnime(card.dataset.id);
    })
  );
  trackerGrid.querySelectorAll(".card").forEach((card) =>
    card.addEventListener("click", (event) => {
      if (
        !event.target.closest(".card-actions") &&
        !event.target.closest(".poster") &&
        !event.target.closest(".title")
      ) {
        card.classList.toggle("selected");
        updateBatchActionsBar();
      }
    })
  );

  updateBatchActionsBar();
}

function updateEpisode(id, change) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  item.watched = Math.max(0, item.watched + change);
  if (
    item.watched >= item.total &&
    item.total > 0 &&
    item.status === "watching"
  ) {
    item.status = "completed";
    toast(`Completed: ${item.title}!`, "success");
  } else if (item.watched < item.total && item.status === "completed") {
    item.status = "watching";
  }
  saveTracker();
}

function deleteAnime(id) {
  if (confirm("Are you sure you want to delete this anime entry?")) {
    state.items = state.items.filter((i) => i.id !== id);
    saveTracker();
    toast("Entry deleted.", "danger");
  }
}

function updateBatchActionsBar() {
  const selected = $$("#trackerGrid .card.selected");
  const batchBar = $(".batch-actions-bar");
  if (batchBar) {
    batchBar.style.display = selected.length > 0 ? "flex" : "none";
    const chip = batchBar.querySelector(".m3-chip");
    if (chip) chip.textContent = `${selected.length} Selected`;
  }
}

$("#batchUpdateBtn")?.addEventListener("click", () => {
  const selectedCards = $$("#trackerGrid .card.selected");
  const status = $("#batchStatus")?.value || "nochange";
  const increment = +($("#batchIncrement")?.value || 0);

  selectedCards.forEach((card) => {
    const id = card.dataset.id;
    const item = state.items.find((i) => i.id === id);
    if (!item) return;

    if (status !== "nochange") {
      item.status = status;
    }
    if (increment > 0) {
      item.watched = Math.min(item.total, item.watched + increment);
    }
  });

  saveTracker();
  toast(`Batch updated ${selectedCards.length} items.`, "success");
  selectedCards.forEach((card) => card.classList.remove("selected"));
  if ($("#batchStatus")) $("#batchStatus").value = "nochange";
  if ($("#batchIncrement")) $("#batchIncrement").value = 0;
});

// --- Modal & Form Handlers ---
$("#addBtn")?.addEventListener("click", () => openModal());
$("#modalClose")?.addEventListener("click", () => closeModal());
$("#cancelBtn")?.addEventListener("click", () => closeModal());

function openModal(item) {
  const modal = $("#modal");
  const form = $("#animeForm");
  if (!modal || !form) return;

  if (item) {
    $("#modalTitle").textContent = "Edit Anime";
    form.dataset.id = item.id;
    $("#title").value = item.title;
    $("#alt").value = item.alt;
    $("#total").value = item.total;
    $("#watched").value = item.watched;
    $("#status").value = item.status;
    $("#rating").value = item.rating || "";
    $("#image").value = item.image || "";
  } else {
    $("#modalTitle").textContent = "Add New Anime";
    form.reset();
    form.dataset.id = "";
    $("#total").value = getSetting("defaultEpisodes", 12);
    $("#watched").value = 0;
    $("#status").value = "watching";
    $("#rating").value = "";
    $("#image").value = "";
    $("#title").value = "";
    $("#alt").value = "";
  }
  if (!modal.open) modal.showModal();
}

function closeModal() {
  const modal = $("#modal");
  const form = $("#animeForm");
  if (modal && modal.open) modal.close();
  if (form) form.reset();
  if ($("#title")) $("#title").value = "";
  if ($("#alt")) $("#alt").value = "";
  if ($("#total")) $("#total").value = getSetting("defaultEpisodes", 12);
  if ($("#watched")) $("#watched").value = 0;
  if ($("#status")) $("#status").value = "watching";
  if ($("#rating")) $("#rating").value = "";
  if ($("#image")) $("#image").value = "";
}

function editAnime(id) {
  const item = state.items.find((i) => i.id === id);
  if (item) openModal(item);
}

$("#animeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const id = form.dataset.id;
  const isEdit = !!id;

  const total = +data.total;
  const watched = +data.watched;
  const rating = +data.rating || null;

  if (watched > total && total > 0) {
    return toast("Watched episodes cannot exceed Total episodes!", "danger");
  }

  const newItem = {
    id: isEdit ? id : uid(),
    title: data.title.trim(),
    alt: data.alt.trim(),
    total: total,
    watched: watched,
    status: data.status,
    rating: rating,
    image: data.image.trim() || null,
    anilistId: isEdit ? state.items.find((i) => i.id === id)?.anilistId : null,
    color: isEdit ? state.items.find((i) => i.id === id)?.color : null,
  };

  if (isEdit) {
    const index = state.items.findIndex((i) => i.id === id);
    if (index !== -1) {
      state.items[index] = newItem;
      toast("Anime updated!", "success");
    }
  } else {
    state.items.push(newItem);
    toast("Anime added!", "success");
  }

  closeModal();
  saveTracker();
});

$("#autoCoverBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const title = $("#title")?.value || "";
  if (!title.trim()) {
    return toast("Enter a title first to auto-fill cover.", "danger");
  }

  const query = `
        query ($search: String) {
            Page(page: 1, perPage: 1) {
                media(search: $search, type: ANIME) {
                    coverImage { large color }
                    id
                }
            }
        }
    `;
  const variables = { search: title };

  try {
    const result = await anilistQuery(query, variables);
    const media = result.data.Page.media[0];

    if (media) {
      $("#image").value = media.coverImage.large;
      const formId = $("#animeForm")?.dataset.id;
      const item = formId ? state.items.find((i) => i.id === formId) : null;
      if (item) {
        item.anilistId = media.id;
        item.color = media.coverImage.color;
      }
      toast("Cover image found and filled!", "success");
    } else {
      toast("No cover image found for that title.", "danger");
    }
  } catch (error) {
    toast("Failed to search AniList for cover.", "danger");
  }
});

// --- AniList API & Caching ---
async function anilistQuery(query, variables = {}, retries = 2) {
  try {
    const cacheKey = `anilist_${JSON.stringify(variables)}`;
    const cache = safeParse(localStorage.getItem(cacheKey), null);
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
    if (data.errors) throw new Error(data.errors[0].message);

    localStorage.setItem(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), data })
    );

    return data;
  } catch (error) {
    const cache = safeParse(
      localStorage.getItem(`anilist_${JSON.stringify(variables)}`),
      null
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
  return {
    limit: +($("#discoverLimit")?.value || 8),
    season: $("#seasonFilter")?.value || "all",
    year: +($("#yearFilter")?.value || 0),
    genre: $("#genreFilter")?.value || "all",
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
          id title { romaji native english } coverImage { large color } 
          episodes status season seasonYear averageScore popularity genres
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

    trendingGrid.innerHTML = "";
    trending.data.Page.media.forEach((item) =>
      renderDiscoverCard(trendingGrid, item)
    );

    popularGrid.innerHTML = "";
    popular.data.Page.media.forEach((item) =>
      renderDiscoverCard(popularGrid, item)
    );

    newGrid.innerHTML = "";
    newAnime.data.Page.media.forEach((item) =>
      renderDiscoverCard(newGrid, item)
    );

    topGrid.innerHTML = "";
    top.data.Page.media.forEach((item) => renderDiscoverCard(topGrid, item));
  } catch (error) {
    [trendingGrid, popularGrid, newGrid, topGrid].forEach((grid) => {
      grid.innerHTML =
        '<div class="empty-state"><p>Failed to load data. Try clearing API cache in Settings.</p></div>';
    });
  }
}

$("#refreshDiscover")?.addEventListener("click", loadDiscover);

function renderDiscoverCard(grid, item) {
  const card = document.createElement("div");
  card.className = "m3-card card discover-card";
  card.dataset.anilistId = item.id;
  card.style.setProperty("--card-color", item.coverImage.color || "#1a1a1a");

  const title = item.title.english || item.title.romaji || item.title.native;
  const score = item.averageScore
    ? `★ ${(item.averageScore / 10).toFixed(1)}`
    : "N/A";
  const subText = `${item.seasonYear || "??"} ${item.season || ""} | ${score}`;

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
          <button class="m3-button primary small discover-add-btn" 
              data-title="${title.replace(/"/g, "&quot;")}" 
              data-image="${item.coverImage.large}" 
              data-anilist-id="${item.id}" 
              data-color="${item.coverImage.color || ""}"
              data-episodes="${
                item.episodes || getSetting("defaultEpisodes", 12)
              }">
              <i class="mdi mdi-plus"></i> Add
          </button>
      </div>
    `;
  grid.appendChild(card);
}

// Use event delegation for discover/search add buttons
document.body.addEventListener("click", function (event) {
  const btn = event.target.closest("button.discover-add-btn");
  if (btn && btn.dataset.anilistId) {
    addFromDiscover(btn);
  }
});

function addFromDiscover(btn) {
  const id = uid();
  const newItem = {
    id: id,
    title: btn.dataset.title,
    alt: "",
    total: +btn.dataset.episodes,
    watched: 0,
    status: "plan",
    rating: null,
    image: btn.dataset.image,
    anilistId: +btn.dataset.anilistId,
    color: btn.dataset.color || null,
  };

  if (state.items.some((i) => i.anilistId === newItem.anilistId)) {
    return toast("This anime is already in your tracker.", "danger");
  }
  state.items.push(newItem);
  saveTracker();
  toast(`Added "${newItem.title}" to 'Plan to Watch'!`, "success");
  // Uncomment below line to open edit modal after adding
  // editAnime(id);
}

function getSearchFilters() {
  return {
    query: $("#searchQuery")?.value || "",
    limit: +($("#searchLimit")?.value || 12),
    season: $("#searchSeason")?.value || "all",
    year: +($("#searchYear")?.value || 0),
    genre: $("#searchGenre")?.value || "all",
  };
}

$("#searchForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const filters = getSearchFilters();
  const searchResults = $("#searchResults");

  if (!filters.query.trim()) {
    searchResults.innerHTML =
      '<div class="empty-state"><p>Enter a query and hit search to find anime on AniList.</p></div>';
    return;
  }

  createSkeletonCards(searchResults, filters.limit);

  function buildFilterStr() {
    let str = "";
    if (filters.season && filters.season !== "all")
      str += ` season: "${filters.season}",`;
    if (filters.year) str += ` seasonYear: ${filters.year},`;
    if (filters.genre && filters.genre !== "all")
      str += ` genre_in: ["${filters.genre}"],`;
    return str;
  }

  const query = `
        query ($search: String, $perPage: Int) {
            Page(page: 1, perPage: $perPage) {
                media(search: $search, type: ANIME, ${buildFilterStr()}) {
                    id title { romaji native english } coverImage { large color } 
                    episodes status season seasonYear averageScore popularity genres
                }
            }
        }
    `;
  const variables = { search: filters.query, perPage: filters.limit };

  try {
    const result = await anilistQuery(query, variables);
    const media = result.data.Page.media;

    searchResults.innerHTML = "";
    if (media.length === 0) {
      searchResults.innerHTML =
        '<div class="empty-state"><p>No results found for your query and filters.</p></div>';
    } else {
      media.forEach((item) => renderDiscoverCard(searchResults, item));
    }
  } catch (error) {
    searchResults.innerHTML =
      '<div class="empty-state"><p>Error fetching search results. Try clearing API cache in Settings.</p></div>';
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
      panel.style.display = isActive ? "block" : "none";
    });

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

  renderTracker();
  $("#tracker")?.classList.add("active");
  $("#trackerTab")?.classList.add("active");

  $("#discoverTab")?.addEventListener("click", loadDiscover, { once: true });

  $("#quickSearch")?.addEventListener("input", renderTracker);
  $("#statusFilter")?.addEventListener("change", renderTracker);
  $("#sortBy")?.addEventListener("change", renderTracker);
  $("#onlyPoster")?.addEventListener("change", renderTracker);
}
initialize();
