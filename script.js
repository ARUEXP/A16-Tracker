// ===============================================
// God Tier A16 Anime Tracker v4.0 - FULL GOD TIER
// ===============================================
document.addEventListener("DOMContentLoaded", () => {
  // ---------- Initial Tab Setup ----------
  const tabPanels = {
    tracker: "#tracker",
    discover: "#discover",
    search: "#search",
    settings: "#settings",
  };

  function activateTab(tab) {
    // Update tab buttons state
    $$("nav .tab").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    const btn = $(`nav .tab[data-tab='${tab}']`);
    if (btn) {
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
    }

    // Update panel visibility
    Object.values(tabPanels).forEach((sel) => {
      const panel = $(sel);
      if (panel) {
        panel.classList.remove("active");
        panel.style.display = "none";
      }
    });
    const activePanel = $(tabPanels[tab]);
    if (activePanel) {
      activePanel.classList.add("active");
      activePanel.style.display = "block";
    }

    // Handle panel-specific initialization
    if (tab === "tracker") renderTracker();
    if (tab === "discover") loadDiscoverCategory();
    if (tab === "search")
      $("#searchResults").innerHTML =
        '<div class="empty-state"><p>Enter a query and hit search to find anime.</p></div>';
  }

  // Initialize tracker tab on load
  activateTab("tracker");
  // ---------- Tab Navigation ----------
  $$("nav .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      activateTab(tab);
    });
  });

  // ---------- Multi-Category Discover ----------
  function buildJikanQuery({ season, year, genre, limit, orderBy, sort }) {
    let url = `https://api.jikan.moe/v4/anime?limit=${limit}`;
    if (season && season !== "all") url += `&season=${season.toLowerCase()}`;
    if (year) url += `&year=${year}`;
    if (genre && genre !== "all") url += `&genres=${encodeURIComponent(genre)}`;
    if (orderBy) url += `&order_by=${orderBy}`;
    if (sort) url += `&sort=${sort}`;
    return url;
  }

  function renderDiscoverCardGrid(grid, item) {
    const card = document.createElement("div");
    card.className = "m3-card card discover-card";
    card.innerHTML = `<img src="${item.image}" alt="${item.title}"><h4>${item.title}</h4><p>${item.episodes} eps | ${item.score} ★</p><button class="addBtn">Add</button>`;
    card.querySelector(".addBtn")?.addEventListener("click", () => {
      state.items.push({
        id: uid(),
        title: item.title,
        alt: "",
        total: item.episodes,
        watched: 0,
        status: "watching",
        rating: null,
        image: item.image,
        color: "#1a1a1a",
      });
      saveTracker();
      toast("Added to tracker!", "success");
    });
    grid.appendChild(card);
  }

  function loadDiscoverCategory() {
    const filters = {
      season: $("#seasonFilter")?.value || "all",
      year: +$("#yearFilter")?.value || 0,
      genre: $("#genreFilter")?.value || "all",
      limit: +$("#discoverLimit")?.value || 8,
    };
    const trendingGrid = $("#trendingGrid");
    const popularGrid = $("#popularGrid");
    const newGrid = $("#newGrid");
    const topGrid = $("#topGrid");
    [trendingGrid, popularGrid, newGrid, topGrid].forEach(
      (grid) => (grid.innerHTML = "")
    );
    // Trending: popularity desc, airing
    fetch(buildJikanQuery({ ...filters, orderBy: "popularity", sort: "desc" }))
      .then((r) => r.json())
      .then((r) => {
        trendingGrid.innerHTML = "";
        r.data
          .filter((i) => i.status === "Currently Airing")
          .forEach((item) =>
            renderDiscoverCardGrid(trendingGrid, normalizeJikan(item))
          );
      });
    // Popular: popularity desc
    fetch(buildJikanQuery({ ...filters, orderBy: "popularity", sort: "desc" }))
      .then((r) => r.json())
      .then((r) => {
        popularGrid.innerHTML = "";
        r.data.forEach((item) =>
          renderDiscoverCardGrid(popularGrid, normalizeJikan(item))
        );
      });
    // New Releases: start_date desc
    fetch(buildJikanQuery({ ...filters, orderBy: "start_date", sort: "desc" }))
      .then((r) => r.json())
      .then((r) => {
        newGrid.innerHTML = "";
        r.data.forEach((item) =>
          renderDiscoverCardGrid(newGrid, normalizeJikan(item))
        );
      });
    // Top Rated: score desc
    fetch(buildJikanQuery({ ...filters, orderBy: "score", sort: "desc" }))
      .then((r) => r.json())
      .then((r) => {
        topGrid.innerHTML = "";
        r.data.forEach((item) =>
          renderDiscoverCardGrid(topGrid, normalizeJikan(item))
        );
      });
  }

  $("#refreshDiscover")?.addEventListener("click", loadDiscoverCategory);

  // ---------- Search Feature ----------
  $("#searchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const filters = {
      query: $("#searchQuery")?.value || "",
      limit: +$("#searchLimit")?.value || 12,
      season: $("#searchSeason")?.value || "all",
      year: +$("#searchYear")?.value || 0,
      genre: $("#searchGenre")?.value || "all",
    };
    const searchResults = $("#searchResults");
    if (!filters.query.trim()) {
      searchResults.innerHTML =
        '<div class="empty-state"><p>Enter a query and hit search to find anime.</p></div>';
      return;
    }
    searchResults.innerHTML = "";
    let url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(
      filters.query
    )}&limit=${filters.limit}`;
    if (filters.season && filters.season !== "all")
      url += `&season=${filters.season.toLowerCase()}`;
    if (filters.year) url += `&year=${filters.year}`;
    if (filters.genre && filters.genre !== "all")
      url += `&genres=${encodeURIComponent(filters.genre)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Jikan API error");
      const data = await resp.json();
      const media = data.data || [];
      if (media.length === 0) {
        searchResults.innerHTML =
          '<div class="empty-state"><p>No results found for your query and filters.</p></div>';
      } else {
        media.forEach((item) =>
          renderDiscoverCardGrid(searchResults, normalizeJikan(item))
        );
      }
    } catch (error) {
      searchResults.innerHTML =
        '<div class="empty-state"><p>Error fetching search results from Jikan.</p></div>';
    }
  });
  const LS_KEY = "a16_v4_data";
  const LS_SETTINGS_KEY = "a16_v4_settings";
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const uid = () => crypto.randomUUID();

  const safeParse = (json, fallback) => {
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  };

  const toast = (txt, type = "") => {
    const t = $("#toast");
    if (!t) return;
    t.textContent = txt;
    t.className = "toast show" + (type ? " " + type : "");
    setTimeout(() => t.classList.remove("show"), 2500);
  };

  let state = {
    items: safeParse(localStorage.getItem(LS_KEY), []).map((i) => ({
      id: i.id || uid(),
      title: i.title || "Untitled",
      alt: i.alt || "",
      total: +i.total || 0,
      watched: +i.watched || 0,
      status: i.status || "watching",
      rating: +i.rating || null,
      image: i.image || null,
      anilistId: i.anilistId || null,
      color: i.color || "#1a1a1a",
    })),
    settings: safeParse(localStorage.getItem(LS_SETTINGS_KEY), {}),
  };

  // ---------- Settings ----------
  const getSetting = (key, def) =>
    state.settings[key] !== undefined ? state.settings[key] : def;
  const saveSettings = () => {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(state.settings));
    toast("Settings saved!", "success");
    renderTracker();
  };

  const initSettings = () => {
    if ($("#defaultEpisodes"))
      $("#defaultEpisodes").value = getSetting("defaultEpisodes", 12);
    if ($("#episodeDuration"))
      $("#episodeDuration").value = getSetting("episodeDuration", 24);

    $("#settingsForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      state.settings.defaultEpisodes = +data.defaultEpisodes;
      state.settings.episodeDuration = +data.episodeDuration;
      saveSettings();
    });

    $("#clearCacheBtn")?.addEventListener("click", () => {
      let count = 0;
      for (const key in localStorage)
        if (key.startsWith("jikan_")) {
          localStorage.removeItem(key);
          count++;
        }
      toast(`Cleared ${count} cache entries.`, "success");
    });

    $("#clearBtn")?.addEventListener("click", () => {
      if (!confirm("Delete ALL tracker data? This cannot be undone.")) return;
      state.items = [];
      localStorage.removeItem(LS_KEY);
      toast("All tracker data cleared.", "danger");
      renderTracker();
    });

    $("#exportBtn")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], {
        type: "application/json",
      });
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

    $("#importBtn")?.addEventListener("click", () => $("#importFile").click());
    $("#importFile")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (!Array.isArray(imported)) throw new Error();
          state.items = imported.map((i) => ({
            ...i,
            id: i.id || uid(),
            color: i.color || "#1a1a1a",
          }));
          saveTracker();
          toast("Data imported!", "success");
        } catch {
          toast("Invalid JSON!", "danger");
        }
      };
      reader.readAsText(file);
    });
  };

  // ---------- Tracker ----------
  const saveTracker = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(state.items));
    renderTracker();
  };

  const renderStats = (items) => {
    const s = $("#sideStats");
    if (!s) return;
    const total = items.length;
    const completed = items.filter((i) => i.status === "completed").length;
    const watching = items.filter((i) => i.status === "watching").length;
    const totalEp = items.reduce((a, i) => a + i.total, 0);
    const watchedEp = items.reduce((a, i) => a + i.watched, 0);
    const dur = getSetting("episodeDuration", 24);
    const timeStr = (min) =>
      min < 60
        ? `${min} min`
        : min < 1440
        ? `${(min / 60).toFixed(1)} hr`
        : `${(min / 1440).toFixed(1)} days`;
    s.innerHTML = `
      <h3><i class="mdi mdi-chart-donut"></i> Tracker Summary</h3>
      <p>Total Titles: ${total}</p>
      <p>Completed: ${completed}</p>
      <p>Watching: ${watching}</p>
      <hr>
      <p>Total Episodes: ${totalEp}</p>
      <p>Watched Episodes: ${watchedEp}</p>
      <p>Time Spent: ${timeStr(watchedEp * dur)}</p>
      <p>Time Remaining: ${timeStr((totalEp - watchedEp) * dur)}</p>`;
  };

  const renderTracker = () => {
    const grid = $("#trackerGrid");
    const empty = $("#trackerEmpty");
    if (!grid || !empty) return;
    const qs = $("#quickSearch")?.value?.toLowerCase() || "";
    const statusF = $("#statusFilter")?.value || "all";
    const sortBy = $("#sortBy")?.value || "created";
    const onlyPoster = $("#onlyPoster")?.checked || false;
    let filtered = state.items.filter(
      (i) =>
        (i.title.toLowerCase().includes(qs) ||
          i.alt.toLowerCase().includes(qs)) &&
        (statusF === "all" || i.status === statusF)
    );

    switch (sortBy) {
      case "alpha":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "progress":
        filtered.sort(
          (a, b) => b.watched / (b.total || 1) - a.watched / (a.total || 1)
        );
        break;
      case "rating":
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "created":
        filtered.sort((a, b) => (a.id > b.id ? -1 : 1));
        break;
    }

    renderStats(filtered);

    const frag = document.createDocumentFragment();
    filtered.forEach((item) => {
      if (onlyPoster && !item.image) return;
      const card = document.createElement("div");
      card.className = `m3-card card ${
        item.watched >= item.total && item.status !== "plan"
          ? "completed-card"
          : ""
      }`;
      card.dataset.id = item.id;
      card.style.setProperty("--card-color", item.color || "#1a1a1a");
      card.innerHTML = `
        <div class="poster">${
          item.image
            ? `<img src="${item.image}" alt="${item.title}">`
            : `<div class="no-poster">${item.title}</div>`
        }<div class="card-overlay">${item.watched}/${item.total}</div></div>
        <div class="meta">
          <h4 class="title">${item.title}</h4>
          <p class="sub">${item.status.toUpperCase()} ${
        item.rating ? `| ★ ${item.rating}` : ""
      }</p>
          <div class="pbar-text"><span>Progress</span><span>${(
            (item.watched / (item.total || 1)) *
            100
          ).toFixed(0)}%</span></div>
          <div class="pbar"><i style="width:${Math.min(
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
        </div>`;
      frag.appendChild(card);
    });
    grid.innerHTML = "";
    grid.appendChild(frag);
    empty.style.display = filtered.length === 0 ? "flex" : "none";

    grid.querySelectorAll(".action-inc").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateEpisode(btn.dataset.id, 1);
      })
    );
    grid.querySelectorAll(".action-dec").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateEpisode(btn.dataset.id, -1);
      })
    );
    grid.querySelectorAll(".action-del").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteAnime(btn.dataset.id);
      })
    );
    grid.querySelectorAll(".poster, .title").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        editAnime(el.closest(".card").dataset.id);
      })
    );
  };

  const updateEpisode = (id, change) => {
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
    } else if (item.watched < item.total && item.status === "completed")
      item.status = "watching";
    saveTracker();
  };

  const deleteAnime = (id) => {
    if (confirm("Delete this anime?")) {
      state.items = state.items.filter((i) => i.id !== id);
      saveTracker();
      toast("Entry deleted.", "danger");
    }
  };

  // ---------- Modal ----------
  const openModal = (item) => {
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
  };

  const closeModal = () => {
    const modal = $("#modal");
    if (modal && modal.open) modal.close();
    $("#animeForm")?.reset();
  };

  const editAnime = (id) => {
    const item = state.items.find((i) => i.id === id);
    if (item) openModal(item);
  };

  $("#animeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const id = form.dataset.id;
    const isEdit = !!id;
    const total = +data.total;
    const watched = +data.watched;
    const rating = +data.rating || null;
    if (watched > total && total > 0)
      return toast("Watched episodes cannot exceed Total!", "danger");
    const newItem = {
      id: isEdit ? id : uid(),
      title: data.title.trim(),
      alt: data.alt.trim(),
      total,
      watched,
      status: data.status,
      rating,
      image: data.image.trim() || null,
      anilistId: isEdit
        ? state.items.find((i) => i.id === id)?.anilistId
        : null,
      color: isEdit ? state.items.find((i) => i.id === id)?.color : "#1a1a1a",
    };
    if (isEdit) {
      const idx = state.items.findIndex((i) => i.id === id);
      if (idx !== -1) {
        state.items[idx] = newItem;
        toast("Anime updated!", "success");
      }
    } else {
      state.items.push(newItem);
      toast("Anime added!", "success");
    }
    closeModal();
    saveTracker();
  });

  // ---------- Discover & Search ----------
  const cacheGet = (k) => {
    const c = safeParse(localStorage.getItem(k), null);
    return c && Date.now() - c.time < CACHE_TTL ? c.data : null;
  };
  const cacheSet = (k, d) =>
    localStorage.setItem(k, JSON.stringify({ time: Date.now(), data: d }));

  const createSkeletonCards = (container, count) => {
    container.innerHTML = Array(count)
      .fill(0)
      .map((_) => `<div class="skeleton-card"></div>`)
      .join("");
  };

  const normalizeJikan = (item) => ({
    id: item.mal_id,
    title: item.title,
    image: item.images?.jpg?.large_image_url || "",
    status: item.status || "N/A",
    episodes: item.episodes || getSetting("defaultEpisodes", 12),
    score: item.score || 0,
    season: item.season || "",
    year: item.year || "",
  });

  const fetchJikan = (query, limit = 12) =>
    cacheGet(`jikan_${query}`)
      ? Promise.resolve(cacheGet(`jikan_${query}`))
      : fetch(
          `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(
            query
          )}&limit=${limit}`
        )
          .then((r) => r.json())
          .then((r) => {
            const arr = r.data.map(normalizeJikan);
            cacheSet(`jikan_${query}`, arr);
            return arr;
          });

  const renderDiscoverCard = (item) => {
    const grid = $("#discoverGrid");
    if (!grid) return;
    const card = document.createElement("div");
    card.className = "discover-card";
    card.innerHTML = `<img src="${item.image}" alt="${item.title}"><h4>${item.title}</h4><p>${item.episodes} eps | ${item.score} ★</p><button class="addBtn">Add</button>`;
    card.querySelector(".addBtn")?.addEventListener("click", () => {
      state.items.push({
        id: uid(),
        title: item.title,
        alt: "",
        total: item.episodes,
        watched: 0,
        status: "watching",
        rating: null,
        image: item.image,
        color: "#1a1a1a",
      });
      saveTracker();
      toast("Added to tracker!", "success");
    });
    grid.appendChild(card);
  };

  const loadDiscover = (query) => {
    const grid = $("#discoverGrid");
    if (!grid) return;
    grid.innerHTML = "";
    createSkeletonCards(grid, 6);
    fetchJikan(query).then((arr) => {
      grid.innerHTML = "";
      arr.forEach(renderDiscoverCard);
    });
  };

  $("#discoverSearchBtn")?.addEventListener("click", () =>
    loadDiscover($("#discoverSearch")?.value || "")
  );

  // ---------- Keyboard shortcuts ----------
  document.addEventListener("keydown", (e) => {
    const modal = $("#modal");
    if (modal?.open) {
      const watchedInput = $("#watched");
      if (watchedInput)
        if (e.key === "ArrowUp") {
          watchedInput.value = +watchedInput.value + 1;
          e.preventDefault();
        } else if (e.key === "ArrowDown") {
          watchedInput.value = Math.max(0, +watchedInput.value - 1);
          e.preventDefault();
        } else if (e.key === "Escape") closeModal();
    }
  });

  // ---------- Init ----------
  initSettings();
  renderTracker();
});
