const state = {
  type: "movie",
  hero: [],
  heroIndex: 0,
  currentItems: [],
  catalogMode: "popular",
  page: 1,
  totalPages: 1,
  searchQuery: "",
  searchType: "movie",
  selected: null,
  favorites: Array.isArray(window.NOVAFLIX?.favorites)
    ? window.NOVAFLIX.favorites
    : [],
  history: Array.isArray(window.NOVAFLIX?.history)
    ? window.NOVAFLIX.history
    : [],
};

const $ = (id) => document.getElementById(id);
const els = {
  heroTitle: $("heroTitle"),
  heroOverview: $("heroOverview"),
  heroBackdrop: $("heroBackdrop"),
  heroBadges: $("heroBadges"),
  heroMeta: $("heroMeta"),
  heroDetails: $("heroDetails"),
  heroFavorite: $("heroFavorite"),
  movieGrid: $("movieGrid"),
  genreGrid: $("genreGrid"),
  continueGrid: $("continueGrid"),
  catalogTitle: $("catalogTitle"),
  resultsSection: $("resultsSection"),
  resultsTitle: $("resultsTitle"),
  resultsGrid: $("resultsGrid"),
  pageLabel: $("pageLabel"),
  prevPage: $("prevPage"),
  nextPage: $("nextPage"),
  historySection: $("historySection"),
  historyGrid: $("historyGrid"),
  detailModal: $("detailModal"),
  detailBackdrop: $("detailBackdrop"),
  detailPoster: $("detailPoster"),
  detailBadges: $("detailBadges"),
  detailTitle: $("detailTitle"),
  detailMeta: $("detailMeta"),
  detailOverview: $("detailOverview"),
  detailTags: $("detailTags"),
  detailFavorite: $("detailFavorite"),
  detailTrailer: $("detailTrailer"),
  castRow: $("castRow"),
  recommendRow: $("recommendRow"),
  toast: $("toast"),
};

const poster = (path, size = "w500") =>
  path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "https://placehold.co/500x750/282a2d/ffffff?text=No+Image";

const backdrop = (path) =>
  path
    ? `https://image.tmdb.org/t/p/original${path}`
    : "https://placehold.co/1400x700/282a2d/ffffff?text=NovaFlix";

const safe = (str = "") =>
  String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const titleOf = (x) => x?.title || x?.name || "Untitled";
const yearOf = (x) =>
  String(x?.release_date || x?.first_air_date || "").slice(0, 4) || "—";
const mediaOf = (x, fallback = "movie") =>
  x?.media_type || (x?.name ? "tv" : fallback);

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error || "Request gagal.");
  return data;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function favoriteKey(item) {
  return `${mediaOf(item, state.type)}-${item.id}`;
}

function isFavorite(item) {
  const key = favoriteKey(item);
  return state.favorites.some((x) => favoriteKey(x) === key);
}

function updateLocalState() {
  state.favorites = state.favorites.slice(0, 60);
  state.history = state.history.slice(0, 12);
  saveContinueGrid();
}

function saveContinueGrid() {
  if (!state.history.length) {
    els.continueGrid.innerHTML = `
            <div class="continue-card placeholder-card"><div class="continue-overlay">
                <div class="continue-title">Open a title</div><div class="continue-sub">Film yang kamu buka akan muncul di sini.</div>
            </div></div>
            <div class="continue-card placeholder-card"><div class="continue-overlay">
                <div class="continue-title">Search something</div><div class="continue-sub">Cari film atau series di atas.</div>
            </div></div>
            <div class="continue-card placeholder-card"><div class="continue-overlay">
                <div class="continue-title">Save favorites</div><div class="continue-sub">Tambahkan film yang ingin disimpan.</div>
            </div></div>
            <div class="continue-card placeholder-card"><div class="continue-overlay">
                <div class="continue-title">Explore genres</div><div class="continue-sub">Cari sesuai genre favoritmu.</div>
            </div></div>`;
    return;
  }

  els.continueGrid.innerHTML = state.history
    .slice(0, 4)
    .map(
      (item) => `
        <article class="continue-card" data-id="${item.id}" data-type="${item.media_type}">
            <img src="${backdrop(item.backdrop_path || item.poster_path)}" alt="">
            <div class="continue-overlay">
                <div class="continue-title">${safe(titleOf(item))}</div>
                <div class="continue-sub">${safe(item.media_type.toUpperCase())} • ${safe(yearOf(item))}</div>
            </div>
        </article>`,
    )
    .join("");

  els.continueGrid.querySelectorAll(".continue-card").forEach((card) => {
    card.addEventListener("click", () =>
      openDetail(card.dataset.type, card.dataset.id),
    );
  });
}

async function mutateFavorite(item) {
  const type = mediaOf(item, state.type);
  const body = new URLSearchParams();
  body.set("type", type);
  body.set("id", item.id);

  const result = await api("index.php?ajax=toggle-favorite", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (result.favorite) {
    state.favorites.unshift({ ...item, media_type: type });
    toast("Added to favorites");
  } else {
    state.favorites = state.favorites.filter(
      (x) => favoriteKey(x) !== `${type}-${item.id}`,
    );
    toast("Removed from favorites");
  }

  if (state.selected) renderDetailFavorite(state.selected);
  renderHero();
  renderCurrentGrid();
}

function renderHero() {
  const item = state.hero[state.heroIndex];
  if (!item) return;

  const type = mediaOf(item, state.type);
  els.heroTitle.textContent = titleOf(item);
  els.heroOverview.textContent = item.overview || "No overview available.";
  els.heroBackdrop.src = backdrop(item.backdrop_path || item.poster_path);
  els.heroBadges.innerHTML = `
        <span class="badge">${type === "tv" ? "TV Series" : "Movie"}</span>
        <span class="badge">${safe(yearOf(item))}</span>
        ${item.vote_average ? `<span class="badge">★ ${Number(item.vote_average).toFixed(1)}</span>` : ""}`;
  els.heroMeta.innerHTML = `
        <span class="rating-dot">TMDB ${item.vote_average ? Number(item.vote_average).toFixed(1) : "—"}</span>
        <span>${safe(String(item.original_language || "").toUpperCase())}</span>
        <span>${type.toUpperCase()}</span>`;
  els.heroFavorite.textContent = isFavorite({ ...item, media_type: type })
    ? "♥ In Favorites"
    : "♡ Add to Favorites";
  els.heroDetails.onclick = () => openDetail(type, item.id);
  els.heroFavorite.onclick = () =>
    mutateFavorite({ ...item, media_type: type });
}

function renderCurrentGrid() {
  els.movieGrid.innerHTML = state.currentItems
    .map((item) => cardHTML(item, state.type))
    .join("");
  bindCards(els.movieGrid);
}

function cardHTML(item, forcedType = null) {
  const type = forcedType || mediaOf(item);
  const fav = isFavorite({ ...item, media_type: type });

  return `
      <article class="movie-card" data-id="${item.id}" data-type="${type}">
        <div class="poster-wrap">
          <img src="${poster(item.poster_path)}" alt="${safe(titleOf(item))}" loading="lazy">
          <div class="poster-fade"></div>
          <span class="card-rating">★ ${item.vote_average ? Number(item.vote_average).toFixed(1) : "—"}</span>
          <button class="card-fav" data-favorite>${fav ? "♥" : "♡"}</button>
        </div>
        <div class="movie-title">${safe(titleOf(item))}</div>
        <div class="movie-sub">${safe(yearOf(item))} • ${type === "tv" ? "TV" : "Movie"}</div>
      </article>`;
}

function bindCards(container) {
  container.querySelectorAll(".movie-card").forEach((card) => {
    card.onclick = () => openDetail(card.dataset.type, card.dataset.id);
    card.querySelector("[data-favorite]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = [
        ...state.currentItems,
        ...state.history,
        ...state.favorites,
        ...state.hero,
      ].find(
        (x) =>
          String(x.id) === String(card.dataset.id) &&
          mediaOf(x, card.dataset.type) === card.dataset.type,
      );
      if (item) mutateFavorite({ ...item, media_type: card.dataset.type });
    });
  });
}

async function loadHome() {
  skeletons(els.movieGrid, 6);

  try {
    const data = await api("index.php?ajax=home");
    state.hero = data.hero || [];
    state.heroIndex = 0;
    state.catalogMode = "popular";
    state.currentItems = data.popular || [];
    els.catalogTitle.textContent = "Popular Movies";
    renderHero();
    renderCurrentGrid();
    renderGenres();
  } catch (error) {
    els.heroTitle.textContent = "NovaFlix";
    els.heroOverview.textContent = error.message;
  }
}

async function loadCatalog(type = "movie", mode = state.catalogMode) {
  state.type = type;
  state.catalogMode = mode;

  skeletons(els.movieGrid, 6);

  try {
    let items = [];
    let title = "";

    if (type === "movie") {
      const data = await api("index.php?ajax=home");

      if (mode === "top") {
        items = data.topRated || [];
        title = "Top Rated Movies";
      } else if (mode === "now") {
        items = data.nowPlaying || [];
        title = "New Releases";
      } else {
        items = data.popular || [];
        title = "Popular Movies";
      }

      state.hero = data.hero || [];
    } else {
      const sort = mode === "top" ? "vote_average.desc" : "popularity.desc";
      const data = await api(
        `index.php?ajax=discover&type=tv&page=1&sort=${encodeURIComponent(sort)}`,
      );
      items = data.results || [];
      title = mode === "top" ? "Top Rated TV Series" : "Popular TV Series";
      state.hero = items.slice(0, 8).map((x) => ({ ...x, media_type: "tv" }));
    }

    state.currentItems = items.slice(0, 12);
    els.catalogTitle.textContent = title;
    renderCurrentGrid();
    renderHero();
    await renderGenres();
  } catch (error) {
    els.movieGrid.innerHTML = `<p style="color:var(--muted)">${safe(error.message)}</p>`;
  }
}

function skeletons(target, count = 6) {
  target.innerHTML = Array.from(
    { length: count },
    () => '<div class="skeleton"></div>',
  ).join("");
}

async function renderGenres() {
  try {
    const data = await api(`index.php?ajax=genres&type=${state.type}`);
    els.genreGrid.innerHTML = (data.genres || [])
      .slice(0, 12)
      .map(
        (g) =>
          `<button class="genre" data-genre="${g.id}">${safe(g.name)}</button>`,
      )
      .join("");

    els.genreGrid.querySelectorAll(".genre").forEach((btn) => {
      btn.onclick = () => discoverGenre(btn.dataset.genre, btn.textContent);
    });
  } catch {
    els.genreGrid.innerHTML = "";
  }
}

async function discoverGenre(id, label) {
  state.page = 1;
  $("genresSection").classList.remove("hidden");
  els.resultsSection.classList.remove("hidden");
  els.historySection.classList.add("hidden");
  els.resultsTitle.textContent = `${label} • ${state.type === "movie" ? "Movies" : "TV Series"}`;
  skeletons(els.resultsGrid, 8);

  try {
    const data = await api(
      `index.php?ajax=discover&type=${state.type}&page=1&genre=${id}&sort=popularity.desc`,
    );
    state.searchType = state.type;
    state.searchQuery = "";
    state.totalPages = Math.min(data.total_pages || 1, 500);
    state.currentSearchResults = data.results || [];
    renderResults();
  } catch (error) {
    els.resultsGrid.innerHTML = `<p style="color:var(--muted)">${safe(error.message)}</p>`;
  }

  els.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function search(query, page = 1) {
  query = query.trim();
  if (!query) return;

  state.searchQuery = query;
  state.page = page;
  state.searchType = state.type;

  els.resultsSection.classList.remove("hidden");
  els.historySection.classList.add("hidden");
  els.resultsTitle.textContent = `Results for “${query}”`;
  skeletons(els.resultsGrid, 8);

  try {
    const data = await api(
      `index.php?ajax=search&type=${state.type}&q=${encodeURIComponent(query)}&page=${page}`,
    );
    state.currentSearchResults = data.results || [];
    state.totalPages = Math.min(data.total_pages || 1, 500);
    renderResults();
  } catch (error) {
    els.resultsGrid.innerHTML = `<p style="color:var(--muted)">${safe(error.message)}</p>`;
  }

  els.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResults() {
  els.resultsGrid.innerHTML = (state.currentSearchResults || [])
    .map((item) => cardHTML(item, state.searchType))
    .join("");
  bindCards(els.resultsGrid);
  els.pageLabel.textContent = `Page ${state.page} / ${state.totalPages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= state.totalPages;
}

async function openDetail(type, id) {
  try {
    const data = await api(`index.php?ajax=detail&type=${type}&id=${id}`);
    state.selected = { ...data, media_type: type };
    state.history = [
      state.selected,
      ...state.history.filter(
        (x) => !(String(x.id) === String(id) && x.media_type === type),
      ),
    ].slice(0, 12);

    renderHistoryCards();
    saveContinueGrid();

    fillDetail(data, type);
    els.detailModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  } catch (error) {
    toast(error.message);
  }
}

function fillDetail(data, type) {
  els.detailBackdrop.src = backdrop(data.backdrop_path || data.poster_path);
  els.detailPoster.src = poster(data.poster_path);
  els.detailTitle.textContent = titleOf(data);
  els.detailBadges.innerHTML = `
        <span class="badge">${type === "tv" ? "TV Series" : "Movie"}</span>
        <span class="badge">${safe(yearOf(data))}</span>
        ${data.status ? `<span class="badge">${safe(data.status)}</span>` : ""}`;
  els.detailMeta.innerHTML = `
        <span class="rating-dot">★ ${data.vote_average ? Number(data.vote_average).toFixed(1) : "—"}</span>
        <span>${data.runtime ? `${data.runtime} min` : data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : "Runtime —"}</span>
        <span>${safe(String(data.original_language || "").toUpperCase())}</span>`;
  els.detailOverview.textContent = data.overview || "No overview available.";
  els.detailTags.innerHTML = (data.genres || [])
    .map((g) => `<span class="detail-tag">${safe(g.name)}</span>`)
    .join("");
  renderDetailFavorite(data);

  els.detailTrailer.onclick = () => {
    const video = (data.videos?.results || []).find(
      (v) =>
        v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
    );

    if (video)
      window.open(
        `https://www.youtube.com/watch?v=${video.key}`,
        "_blank",
        "noopener",
      );
    else toast("Trailer tidak tersedia untuk judul ini.");
  };

  const cast = (data.credits?.cast || []).slice(0, 8);
  els.castRow.innerHTML = cast
    .map(
      (person) => `
        <div class="cast-card" title="${safe(person.name)}">
            <img src="${poster(person.profile_path, "w185")}" alt="${safe(person.name)}">
            <span>${safe(person.name)}</span>
        </div>`,
    )
    .join("");

  const recs = (data.recommendations?.results || []).slice(0, 8);
  els.recommendRow.innerHTML = recs
    .map(
      (item) => `
        <div class="recommend-card" data-id="${item.id}" data-type="${type}">
            <img src="${poster(item.poster_path, "w185")}" alt="${safe(titleOf(item))}">
            <span>${safe(titleOf(item))}</span>
        </div>`,
    )
    .join("");

  els.recommendRow.querySelectorAll(".recommend-card").forEach((card) => {
    card.onclick = () => openDetail(card.dataset.type, card.dataset.id);
  });
}

function renderDetailFavorite(item) {
  els.detailFavorite.textContent = isFavorite({
    ...item,
    media_type: state.selected?.media_type || state.type,
  })
    ? "♥ In Favorites"
    : "♡ Favorite";

  els.detailFavorite.onclick = () =>
    mutateFavorite({
      ...item,
      media_type: state.selected?.media_type || state.type,
    });
}

function renderHistoryCards() {
  if (!state.history.length) {
    els.historyGrid.innerHTML =
      '<p style="color:var(--muted)">Belum ada history.</p>';
    return;
  }
  els.historyGrid.innerHTML = state.history
    .map((x) => cardHTML(x, x.media_type))
    .join("");
  bindCards(els.historyGrid);
}

function showHistory() {
  document
    .querySelectorAll(".nav-link")
    .forEach((x) => x.classList.remove("active"));
  document.querySelector('[data-route="history"]').classList.add("active");

  els.resultsSection.classList.add("hidden");
  $("genresSection").classList.add("hidden");
  els.historySection.classList.remove("hidden");
  renderHistoryCards();

  els.historySection.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const route = btn.dataset.route;
    document
      .querySelectorAll(".nav-link")
      .forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    if (route === "home") {
      els.resultsSection.classList.add("hidden");
      els.historySection.classList.add("hidden");
      $("genresSection").classList.remove("hidden");
      await loadHome();
      scrollTo({ top: 0, behavior: "smooth" });
    } else if (route === "movies") {
      els.resultsSection.classList.add("hidden");
      els.historySection.classList.add("hidden");
      $("genresSection").classList.remove("hidden");
      await loadCatalog("movie", "popular");
      scrollTo({ top: 0, behavior: "smooth" });
    } else if (route === "tv") {
      els.resultsSection.classList.add("hidden");
      els.historySection.classList.add("hidden");
      $("genresSection").classList.remove("hidden");
      await loadCatalog("tv", "popular");
      scrollTo({ top: 0, behavior: "smooth" });
    } else if (route === "animation") {
      els.historySection.classList.add("hidden");
      state.type = "movie";
      await discoverGenre(16, "Animation");
    } else if (route === "history") {
      showHistory();
    }
  });
});

document.querySelectorAll(".seg").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document
      .querySelectorAll(".seg")
      .forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    await loadCatalog(state.type, btn.dataset.mode);
  });
});

$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  search($("searchInput").value, 1);
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.onclick = () => {
    $("searchInput").value = btn.dataset.search;
    search(btn.dataset.search, 1);
  };
});

$("heroPrev").onclick = () => {
  if (!state.hero.length) return;
  state.heroIndex =
    (state.heroIndex - 1 + state.hero.length) % state.hero.length;
  renderHero();
};

$("heroNext").onclick = () => {
  if (!state.hero.length) return;
  state.heroIndex = (state.heroIndex + 1) % state.hero.length;
  renderHero();
};

$("prevPage").onclick = () => {
  if (state.page > 1) search(state.searchQuery, state.page - 1);
};

$("nextPage").onclick = () => {
  if (state.page < state.totalPages) search(state.searchQuery, state.page + 1);
};

$("backHome").onclick = async () => {
  els.resultsSection.classList.add("hidden");
  document
    .querySelectorAll(".nav-link")
    .forEach((x) => x.classList.remove("active"));
  document.querySelector('[data-route="home"]').classList.add("active");
  await loadHome();
  scrollTo({ top: 0, behavior: "smooth" });
};

function closeModal() {
  els.detailModal.classList.add("hidden");
  document.body.style.overflow = "";
}

$("modalClose").onclick = closeModal;
els.detailModal.addEventListener("click", (e) => {
  if (e.target === els.detailModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.detailModal.classList.contains("hidden"))
    closeModal();
});

$("clearHistory").onclick = $("clearHistory2").onclick = async () => {
  await api("index.php?ajax=clear-history");
  state.history = [];
  saveContinueGrid();
  if (!els.historySection.classList.contains("hidden")) renderHistoryCards();
  toast("History dihapus");
};

$("themeBtn").onclick = () => {
  document.body.classList.toggle("night");
  toast(
    document.body.classList.contains("night") ? "Night mode" : "Light mode",
  );
};

loadHome();
