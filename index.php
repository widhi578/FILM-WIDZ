<?php
session_start();

require_once __DIR__ . '/config.php';

function e(string $value = ''): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

$action = $_GET['action'] ?? 'home';
$type = ($_GET['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';

function tmdbRequest(string $endpoint): array
{
    $url = TMDB_BASE_URL . $endpoint;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Authorization: Bearer ' . TMDB_ACCESS_TOKEN
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || $error) {
        return ['error' => 'Gagal terhubung ke TMDB: ' . $error];
    }

    $data = json_decode($response, true);

    if ($httpCode < 200 || $httpCode >= 300) {
        return ['error' => $data['status_message'] ?? 'TMDB mengembalikan error.'];
    }

    return is_array($data) ? $data : ['error' => 'Response TMDB tidak valid.'];
}

function posterUrl(?string $path, string $size = 'w500'): string
{
    return $path
        ? 'https://image.tmdb.org/t/p/' . $size . $path
        : 'https://placehold.co/500x750/282a2d/ffffff?text=No+Image';
}

function backdropUrl(?string $path, string $size = 'original'): string
{
    return $path
        ? 'https://image.tmdb.org/t/p/' . $size . $path
        : 'https://placehold.co/1400x700/282a2d/ffffff?text=NovaFlix';
}

function titleOf(array $item): string
{
    return $item['title'] ?? $item['name'] ?? 'Untitled';
}

function yearOf(array $item): string
{
    $date = $item['release_date'] ?? $item['first_air_date'] ?? '';
    return $date ? substr($date, 0, 4) : '—';
}

function mediaType(array $item, string $fallback = 'movie'): string
{
    return $item['media_type'] ?? (isset($item['name']) ? 'tv' : $fallback);
}

function favoriteKey(string $type, int $id): string
{
    return $type . '-' . $id;
}

function isFavorite(array $item, string $fallback = 'movie'): bool
{
    $type = mediaType($item, $fallback);
    $favorites = $_SESSION['favorites'] ?? [];

    foreach ($favorites as $fav) {
        if (($fav['media_type'] ?? '') === $type && (int) $fav['id'] === (int) $item['id']) {
            return true;
        }
    }
    return false;
}

function addHistory(array $item, string $type): void
{
    if (!isset($_SESSION['history'])) {
        $_SESSION['history'] = [];
    }

    $entry = [
        'id' => (int) $item['id'],
        'media_type' => $type,
        'title' => $item['title'] ?? null,
        'name' => $item['name'] ?? null,
        'poster_path' => $item['poster_path'] ?? null,
        'backdrop_path' => $item['backdrop_path'] ?? null,
        'vote_average' => $item['vote_average'] ?? null,
        'release_date' => $item['release_date'] ?? null,
        'first_air_date' => $item['first_air_date'] ?? null
    ];

    $_SESSION['history'] = array_values(array_filter(
        $_SESSION['history'],
        fn($x) => !((int) $x['id'] === (int) $entry['id'] && ($x['media_type'] ?? '') === $type)
    ));

    array_unshift($_SESSION['history'], $entry);
    $_SESSION['history'] = array_slice($_SESSION['history'], 0, 12);
}

function currentGenres(string $type): array
{
    $data = tmdbRequest('/genre/' . $type . '/list?language=id-ID');
    return $data['genres'] ?? [];
}

/* AJAX endpoints */
if (isset($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');

    try {
        $ajax = $_GET['ajax'];

        if ($ajax === 'home') {
            $trending = tmdbRequest('/trending/all/week?language=id-ID');
            $popular = tmdbRequest('/movie/popular?language=id-ID&page=1&region=ID');
            $now = tmdbRequest('/movie/now_playing?language=id-ID&page=1&region=ID');
            $top = tmdbRequest('/movie/top_rated?language=id-ID&page=1&region=ID');

            echo json_encode([
                'hero' => array_values(array_filter($trending['results'] ?? [], fn($x) => ($x['media_type'] ?? '') !== 'person')),
                'popular' => $popular['results'] ?? [],
                'nowPlaying' => $now['results'] ?? [],
                'topRated' => $top['results'] ?? []
            ]);
            exit;
        }

        if ($ajax === 'discover') {
            $discoverType = ($_GET['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $page = max(1, min(500, (int) ($_GET['page'] ?? 1)));
            $genre = trim($_GET['genre'] ?? '');
            $sort = $_GET['sort'] ?? 'popularity.desc';

            $endpoint = '/discover/' . $discoverType
                . '?language=id-ID'
                . '&page=' . $page
                . '&include_adult=false'
                . ($genre !== '' ? '&with_genres=' . urlencode($genre) : '')
                . '&sort_by=' . urlencode($sort);

            echo json_encode(tmdbRequest($endpoint));
            exit;
        }

        if ($ajax === 'search') {
            $searchType = ($_GET['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $query = trim($_GET['q'] ?? '');
            $page = max(1, min(500, (int) ($_GET['page'] ?? 1)));

            if ($query === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Query kosong.']);
                exit;
            }

            $endpoint = '/search/' . $searchType
                . '?language=id-ID&page=' . $page
                . '&include_adult=false&query=' . urlencode($query);

            echo json_encode(tmdbRequest($endpoint));
            exit;
        }

        if ($ajax === 'genres') {
            $genreType = ($_GET['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            echo json_encode(['genres' => currentGenres($genreType)]);
            exit;
        }

        if ($ajax === 'detail') {
            $detailType = ($_GET['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $id = (int) ($_GET['id'] ?? 0);

            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'ID tidak valid.']);
                exit;
            }

            $detail = tmdbRequest(
                '/' . $detailType . '/' . $id .
                '?language=id-ID&append_to_response=credits,videos,recommendations'
            );

            echo json_encode($detail);
            exit;
        }

        if ($ajax === 'toggle-favorite') {
            $favType = ($_POST['type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $id = (int) ($_POST['id'] ?? 0);

            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'ID tidak valid.']);
                exit;
            }

            $favorites = $_SESSION['favorites'] ?? [];
            $found = false;

            foreach ($favorites as $index => $fav) {
                if (($fav['media_type'] ?? '') === $favType && (int) $fav['id'] === $id) {
                    unset($favorites[$index]);
                    $found = true;
                    break;
                }
            }

            if (!$found) {
                $detail = tmdbRequest('/' . $favType . '/' . $id . '?language=id-ID');
                if (!isset($detail['error'])) {
                    $detail['media_type'] = $favType;
                    array_unshift($favorites, $detail);
                }
            }

            $_SESSION['favorites'] = array_values(array_slice($favorites, 0, 60));

            echo json_encode([
                'favorite' => !$found,
                'count' => count($_SESSION['favorites'])
            ]);
            exit;
        }

        if ($ajax === 'clear-history') {
            $_SESSION['history'] = [];
            echo json_encode(['success' => true]);
            exit;
        }

        if ($ajax === 'clear-favorites') {
            $_SESSION['favorites'] = [];
            echo json_encode(['success' => true]);
            exit;
        }

        http_response_code(404);
        echo json_encode(['error' => 'Endpoint tidak ditemukan.']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }

    exit;
}

$history = $_SESSION['history'] ?? [];
$favorites = $_SESSION['favorites'] ?? [];

$pageTitle = 'Widhi ny gabut';
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="NovaFlix — website pencarian film dan TV series menggunakan TMDB API, dibuat dengan native PHP.">
    <title><?= e($pageTitle) ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="ambient ambient-a"></div>
<div class="ambient ambient-b"></div>

<div class="page-shell">
    <header class="topbar">
        <a class="brand" href="index.php" aria-label="NovaFlix Home">
            <!-- <div class="brand-mark">N</div> -->
            <div>
                <div class="brand-name">GABUT</div>
                <!-- <div class="brand-sub">DISCOVER • SAVE • WATCH</div> -->
            </div>
        </a>

        <nav class="main-nav">
            <button class="nav-link active" data-route="home">Home</button>
            <button class="nav-link" data-route="movies">Movies</button>
            <button class="nav-link" data-route="tv">TV Series</button>
            <button class="nav-link" data-route="animation">Animation</button>
            <button class="nav-link" data-route="history">History</button>
        </nav>

        <div class="top-actions">
            <button class="icon-btn" id="themeBtn" title="Mode tampilan">◐</button>
            <div class="profile-pill">
                <span class="avatar">W</span>
                <span>
                    <b>WIDHI</b>
                    <small>YG BENER</small>
                </span>
            </div>
        </div>
    </header>

    <section class="search-row">
        <form class="search-box" id="searchForm">
            <span class="search-icon">⌕</span>
            <input type="search" id="searchInput" placeholder="Search movies, series, actors..." autocomplete="off">
            <kbd>ENTER</kbd>
        </form>

        <div class="search-chips">
            <button class="chip" data-search="Interstellar">Interstellar</button>
            <button class="chip" data-search="Spider-Man">Spider-Man</button>
            <button class="chip" data-search="The Last Kingdom">The Last Kingdom</button>
        </div>
    </section>

    <main>
        <section class="hero" id="hero">
            <div class="hero-content">
                <div class="eyebrow"><span class="pulse"></span> NOW TRENDING</div>
                <div class="hero-badges" id="heroBadges"></div>
                <h1 id="heroTitle">Loading...</h1>
                <p id="heroOverview">Mengambil film trending dari TMDB...</p>
                <div class="hero-meta" id="heroMeta"></div>

                <div class="hero-actions">
                    <button class="primary-btn" id="heroDetails">View Details</button>
                    <button class="secondary-btn" id="heroFavorite">♡ Add to Favorites</button>
                    <button class="round-btn" id="heroPrev">‹</button>
                    <button class="round-btn" id="heroNext">›</button>
                </div>
            </div>

            <div class="hero-art">
                <div class="hero-vignette"></div>
                <img id="heroBackdrop" alt="">
            </div>
        </section>

        <section class="section">
            <div class="section-heading">
                <div>
                    <p class="section-kicker">YOUR ACTIVITY</p>
                    <h2>Recently Opened</h2>
                </div>
                <button class="text-btn" id="clearHistory">Clear</button>
            </div>
            <div class="continue-grid" id="continueGrid">
                <?php if ($history): ?>
                    <?php foreach (array_slice($history, 0, 4) as $item): ?>
                        <article class="continue-card" data-id="<?= (int)$item['id'] ?>" data-type="<?= e($item['media_type']) ?>">
                            <img src="<?= e(backdropUrl($item['backdrop_path'] ?? $item['poster_path'] ?? null, 'w780')) ?>" alt="">
                            <div class="continue-overlay">
                                <div class="continue-title"><?= e(titleOf($item)) ?></div>
                                <div class="continue-sub"><?= e(strtoupper($item['media_type'])) ?> • <?= e(yearOf($item)) ?></div>
                            </div>
                        </article>
                    <?php endforeach; ?>
                <?php else: ?>
                    <div class="continue-card placeholder-card">
                        <div class="continue-overlay">
                            <div class="continue-title">Open a title</div>
                            <div class="continue-sub">Film yang kamu buka akan muncul di sini.</div>
                        </div>
                    </div>
                    <div class="continue-card placeholder-card">
                        <div class="continue-overlay">
                            <div class="continue-title">Search something</div>
                            <div class="continue-sub">Cari film atau series di atas.</div>
                        </div>
                    </div>
                    <div class="continue-card placeholder-card">
                        <div class="continue-overlay">
                            <div class="continue-title">Save favorites</div>
                            <div class="continue-sub">Tambahkan film yang ingin disimpan.</div>
                        </div>
                    </div>
                    <div class="continue-card placeholder-card">
                        <div class="continue-overlay">
                            <div class="continue-title">Explore genres</div>
                            <div class="continue-sub">Cari sesuai genre favoritmu.</div>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </section>

        <section class="section" id="catalogSection">
            <div class="section-heading">
                <div>
                    <p class="section-kicker">POPULAR RIGHT NOW</p>
                    <h2 id="catalogTitle">Popular Movies</h2>
                </div>

                <div class="segmented">
                    <button class="seg active" data-mode="popular">Popular</button>
                    <button class="seg" data-mode="top">Top Rated</button>
                    <button class="seg" data-mode="now">New Releases</button>
                </div>
            </div>

            <div class="movie-grid" id="movieGrid"></div>
        </section>

        <section class="section" id="genresSection">
            <div class="section-heading">
                <div>
                    <p class="section-kicker">BROWSE BY MOOD</p>
                    <h2>Genres</h2>
                </div>
            </div>
            <div class="genre-grid" id="genreGrid"></div>
        </section>

        <section class="section hidden" id="resultsSection">
            <div class="section-heading">
                <div>
                    <p class="section-kicker">SEARCH / DISCOVER</p>
                    <h2 id="resultsTitle">Results</h2>
                </div>
                <button class="text-btn" id="backHome">Back to Home</button>
            </div>

            <div class="movie-grid" id="resultsGrid"></div>

            <div class="pager">
                <button class="secondary-light" id="prevPage">← Previous</button>
                <span id="pageLabel">Page 1</span>
                <button class="secondary-light" id="nextPage">Next →</button>
            </div>
        </section>

        <section class="section hidden" id="historySection">
            <div class="section-heading">
                <div>
                    <p class="section-kicker">SESSION HISTORY</p>
                    <h2>Recently Opened</h2>
                </div>
                <button class="text-btn" id="clearHistory2">Clear history</button>
            </div>
            <div class="movie-grid" id="historyGrid"></div>
        </section>
    </main>

    <footer class="site-footer">
        <div>
            <strong>NovaFlix</strong>
            <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">The Movie Database</a>
    </footer>
</div>

<div class="modal-backdrop hidden" id="detailModal">
    <div class="detail-modal">
        <button class="modal-close" id="modalClose">×</button>

        <div class="detail-cover">
            <img id="detailBackdrop" alt="">
            <div class="detail-gradient"></div>
        </div>

        <div class="detail-body">
            <div>
                <img class="detail-poster" id="detailPoster" alt="">
            </div>

            <div class="detail-main">
                <div class="hero-badges" id="detailBadges"></div>
                <h2 id="detailTitle">Title</h2>
                <div class="hero-meta" id="detailMeta"></div>
                <p class="detail-overview" id="detailOverview"></p>
                <div class="detail-tags" id="detailTags"></div>

                <div class="detail-actions">
                    <button class="primary-btn" id="detailFavorite">♡ Favorite</button>
                    <button class="secondary-btn" id="detailTrailer">▶ Trailer</button>
                </div>
            </div>
        </div>

        <div class="detail-lower">
            <div>
                <h3>Cast</h3>
                <div class="cast-row" id="castRow"></div>
            </div>

            <div>
                <h3>Recommended</h3>
                <div class="recommend-row" id="recommendRow"></div>
            </div>
        </div>
    </div>
</div>

<div class="toast" id="toast"></div>
<script>
    window.NOVAFLIX = {
        favorites: <?= json_encode($favorites, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>,
        history: <?= json_encode($history, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>
    };
</script>
<script src="assets/app.js"></script>
</body>
</html>
