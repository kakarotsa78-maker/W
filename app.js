let currentLang = localStorage.getItem('modhub-lang') || 'en';
let currentTheme = localStorage.getItem('modhub-theme') || 'light';
let currentRoute = 'home';
let searchState = { query: '', results: [], page: 1, loading: false };

function t(key) { return LANG[currentLang][key] || key; }

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return ctx.querySelectorAll(sel); }

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  applyLang(currentLang);
  setupEventListeners();
  handleRoute();
  window.addEventListener('hashchange', handleRoute);
});

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('modhub-theme', theme);
}

function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem('modhub-lang', lang);
  document.title = t('app.title');
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
}

/* ─── EVENTS ─── */
function setupEventListeners() {
  $('#theme-toggle').addEventListener('click', () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'));
  $('#lang-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.lang-btn');
    if (btn && btn.dataset.lang !== currentLang) applyLang(btn.dataset.lang);
  });
  $('#header-search-form').addEventListener('submit', e => { e.preventDefault(); doHeaderSearch(); });
  $('#hero-search-form').addEventListener('submit', e => { e.preventDefault(); doHeroSearch(); });
  $('#hero-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doHeroSearch(); });
  $('#header-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doHeaderSearch(); });
  $('#mobile-menu-btn').addEventListener('click', () => document.body.classList.toggle('mobile-menu-open'));
  $$('.nav-link').forEach(el => el.addEventListener('click', () => document.body.classList.remove('mobile-menu-open')));
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-nav]');
    if (link) { e.preventDefault(); navigate(link.dataset.nav); }
  });
}

function doHeaderSearch() {
  const q = $('#header-search-input').value.trim();
  if (q) navigate('search', { q });
}
function doHeroSearch() {
  const q = $('#hero-search-input').value.trim();
  if (q) navigate('search', { q });
}

/* ─── ROUTER ─── */
function navigate(route, params = {}) {
  const hash = route === 'home' ? '/' : `/${route}${params.q ? '?q=' + encodeURIComponent(params.q) : ''}${params.id ? '?id=' + encodeURIComponent(params.id) : ''}`;
  history.pushState(null, '', '#' + hash);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const [path, queryString] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(queryString || ''));

  $$('.nav-link').forEach(el => el.classList.toggle('active', el.getAttribute('href') === '#' + (path === '/' ? '' : path)));

  if (path === '/' || path === '') renderHome(params);
  else if (path === '/search') renderSearch(params);
  else if (path === '/game') renderGameDetail(params);
  else if (path === '/trending') renderTrending();
  else renderHome(params);
}

/* ─── HOME ─── */
function renderHome(params) {
  showHero();
  if (params.q) navigate('search', { q: params.q });
}

function showHero() {
  $('#hero-section').style.display = '';
  $('#content-area').style.display = 'none';
}

function showContent() {
  $('#hero-section').style.display = 'none';
  $('#content-area').style.display = '';
}

/* ─── SEARCH ─── */
async function renderSearch(params) {
  showContent();
  const q = (params.q || '').trim();
  if (!q) { renderEmptySearch(); return; }

  searchState.query = q;
  document.title = `${q} - ${t('app.name')}`;
  $('#dynamic-content').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${t('search.results')} &ldquo;${escapeHtml(q)}&rdquo;</h2>
    </div>
    <div class="loading" id="search-loading">
      <div class="spinner"></div>
      <span class="loading-text">${t('search.loading')}</span>
    </div>
    <div id="search-results"></div>
  `;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    $('#search-loading').style.display = 'none';
    renderSearchResults(data.results || [], q);
  } catch (err) {
    $('#search-loading').style.display = 'none';
    renderError();
  }
}

function renderEmptySearch() {
  showContent();
  $('#dynamic-content').innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <h2>${t('search.placeholder')}</h2>
      <p>${t('search.tryDiff')}</p>
    </div>
  `;
}

function renderSearchResults(results, query) {
  const container = $('#search-results');
  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h2>${t('search.noResults')}</h2>
        <p>${t('search.tryDiff')}</p>
      </div>`;
    return;
  }

  const sources = [...new Set(results.map(r => r.sourceName))];

  container.innerHTML = `
    <div class="search-meta">${results.length} ${t('search.results')} ${t('search.from')} ${sources.length} ${t('search.sources')}</div>
    <div class="search-filters" id="search-filters">
      <button class="filter-btn active" data-filter="all">${t('search.filterAll')}</button>
      <button class="filter-btn" data-filter="mod">${t('search.filterMods')}</button>
      <button class="filter-btn" data-filter="official">${t('search.filterOfficial')}</button>
    </div>
    <div class="games-grid" id="games-grid">
      ${results.map(game => renderGameCard(game)).join('')}
    </div>
  `;

  $$('#search-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#search-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.filter, results);
    });
  });
}

function applyFilter(filter, results) {
  const grid = $('#games-grid');
  const filtered = filter === 'all' ? results :
    filter === 'mod' ? results.filter(r => {
      const modSrc = ['happymod','moddroid','an1','platinmods','sbenny','revdl','rexdl','apkdone','nullsgg','latestmodapks','getmodsapk','modyolo','liteapks','modsmaniac','modzmania'];
      return modSrc.includes(r.source) || r.title.toLowerCase().includes('mod');
    }) :
    results.filter(r => {
      const offSrc = ['playstore','apkmirror','apkpure','uptodown','aptoide','mobogenie'];
      return offSrc.includes(r.source);
    });
  grid.innerHTML = filtered.map(game => renderGameCard(game)).join('');
}

function renderGameCard(game) {
  return `
    <div class="game-card" data-href="#/game?source=${encodeURIComponent(game.source)}&url=${encodeURIComponent(game.url)}">
      <a class="game-card-link" href="#/game?source=${encodeURIComponent(game.source)}&url=${encodeURIComponent(game.url)}">
        <div class="game-card-top">
          <img class="game-card-icon" src="${escapeHtml(game.icon || '/images/placeholder.svg')}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.src='/images/placeholder.svg'" />
          <div class="game-card-info">
            <div class="game-card-title">${escapeHtml(game.title)}</div>
            <div class="game-card-meta">
              ${game.version ? `<span class="game-card-badge">${escapeHtml(game.version)}</span>` : ''}
              <span class="game-card-source" title="${escapeHtml(game.sourceName)}">${escapeHtml(game.sourceName)}</span>
            </div>
          </div>
        </div>
        <div class="game-card-bottom">
          <span class="game-card-size">${game.size || t('game.size')}</span>
          <span class="game-card-action">${t('game.download')}</span>
        </div>
      </a>
    </div>`;
}

/* ─── GAME DETAIL ─── */
async function renderGameDetail(params) {
  showContent();
  const source = params.source;
  const url = decodeURIComponent(params.url || '');
  if (!source || !url) { renderGameNotFound(); return; }

  $('#dynamic-content').innerHTML = `
    <div class="game-detail">
      <a href="#/search?q=" class="back-link" style="display:inline-flex;align-items:center;gap:6px;color:var(--text-secondary);margin-bottom:16px;font-size:.9rem" onclick="history.back();return false">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        ${t('game.backToSearch')}
      </a>
      <div class="loading" id="detail-loading">
        <div class="spinner"></div>
        <span class="loading-text">${t('common.loading')}</span>
      </div>
      <div id="detail-content"></div>
    </div>
  `;

  try {
    const res = await fetch(`/api/detail?source=${encodeURIComponent(source)}&url=${encodeURIComponent(url)}`);
    const data = await res.json();
    $('#detail-loading').style.display = 'none';
    renderGameDetailContent(data, source, url);
  } catch (err) {
    $('#detail-loading').style.display = 'none';
    renderError();
  }
}

function renderGameDetailContent(data, source, url) {
  const container = $('#detail-content');
  if (!data.success) { renderGameNotFound(); return; }

  const sourceName = data.sourceName || source;
  const title = url.split('/').pop().replace(/-/g, ' ').replace(/\.html?$/, '') || 'Game';

  container.innerHTML = `
    <div class="game-detail-header">
      ${data.screenshots && data.screenshots[0] ? `<img class="game-detail-icon" src="${escapeHtml(data.screenshots[0])}" alt="${escapeHtml(title)}" />` : `<div class="game-detail-icon" style="background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-size:2rem">🎮</div>`}
      <div class="game-detail-info">
        <h1 class="game-detail-title">${escapeHtml(title)}</h1>
        <div class="game-detail-meta">
          <span>${escapeHtml(sourceName)}</span>
          ${data.modFeatures && data.modFeatures.length ? `<span class="badge-mod">MOD</span>` : ''}
        </div>
        ${data.description ? `<p class="game-detail-desc">${escapeHtml(data.description).slice(0, 500)}${data.description.length > 500 ? '...' : ''}</p>` : `<p class="game-detail-desc" style="color:var(--text-muted)">${t('common.noDesc')}</p>`}
      </div>
    </div>

    ${data.downloadLinks && data.downloadLinks.length ? `
    <div class="game-detail-section">
      <h3>${t('game.downloads')}</h3>
      <div class="download-list">
        ${data.downloadLinks.map((link, i) => `
          <div class="download-item">
            <div class="download-info">
              <span class="download-source">${escapeHtml(sourceName)}</span>
              <span class="download-meta">${t('game.download')} #${i + 1}</span>
            </div>
            <button class="download-btn" data-url="${escapeHtml(link)}" onclick="handleDownload(this)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              ${t('game.download')}
            </button>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    ${data.modFeatures && data.modFeatures.length ? `
    <div class="game-detail-section">
      <h3>${t('game.modFeatures')}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${data.modFeatures.map(f => `<span class="tag" style="background:var(--primary-50);color:var(--primary-700);border-color:var(--primary-200)">${escapeHtml(f)}</span>`).join('')}
      </div>
    </div>` : ''}

    ${data.screenshots && data.screenshots.length > 1 ? `
    <div class="game-detail-section">
      <h3>${t('game.screenshots')}</h3>
      <div class="screenshots-grid">
        ${data.screenshots.map(src => `<img src="${escapeHtml(src)}" alt="Screenshot" loading="lazy" onclick="window.open(this.src)" />`).join('')}
      </div>
    </div>` : ''}
  `;
}

async function handleDownload(btn) {
  const url = btn.dataset.url;
  if (!url) return;
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></div>${t('game.downloading')}`;

  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Download failed');

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = url.split('/').pop().split('?')[0] || 'download.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Download started!', 'success');
  } catch (err) {
    showToast('Download failed. Opening in new tab...', 'error');
    window.open(url, '_blank');
  }

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>${t('game.download')}`;
}

/* ─── TRENDING ─── */
function renderTrending() {
  showContent();
  const trending = ['Brawl Stars', 'Clash Royale', 'GTA 5', 'Minecraft', 'Free Fire', 'Subway Surfers', 'PUBG Mobile', 'Call of Duty Mobile', 'Among Us', 'Roblox'];
  document.title = `${t('trending.title')} - ${t('app.name')}`;

  $('#dynamic-content').innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">${t('trending.title')}</h2>
        <p style="color:var(--text-secondary);font-size:.9rem">${t('trending.subtitle')}</p>
      </div>
    </div>
    <div class="games-grid">
      ${trending.map(name => `
        <div class="game-card">
          <a class="game-card-link" href="#/search?q=${encodeURIComponent(name)}">
            <div class="game-card-top">
              <div class="game-card-icon" style="background:linear-gradient(135deg,var(--primary-100),var(--primary-200));display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--primary-600)">🎮</div>
              <div class="game-card-info">
                <div class="game-card-title">${escapeHtml(name)}</div>
                <div class="game-card-meta">
                  <span class="game-card-badge">Trending</span>
                </div>
              </div>
            </div>
            <div class="game-card-bottom">
              <span class="game-card-size">${t('search.btn')}</span>
              <span class="game-card-action">${t('common.viewAll')}</span>
            </div>
          </a>
        </div>
      `).join('')}
    </div>
  `;
}

function renderGameNotFound() {
  $('#detail-content').innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/></svg>
      <h2>${t('game.notFound')}</h2>
      <a href="#/" class="retry-btn" style="margin-top:8px">${t('common.retry')}</a>
    </div>
  `;
}

function renderError() {
  const container = $('#detail-content') || $('#search-results');
  if (!container) return;
  container.innerHTML = `
    <div class="error-state">
      <h2>${t('common.error')}</h2>
      <button class="retry-btn" onclick="location.reload()">${t('common.retry')}</button>
    </div>
  `;
}

/* ─── UTILS ─── */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, type = 'success') {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ─── PLACEHOLDER SVG ─── */
// Generate placeholder SVG on demand
(function() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="12" cy="12" r="4"/><circle cx="16" cy="8" r="1.5" fill="#94a3b8"/></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
})();
