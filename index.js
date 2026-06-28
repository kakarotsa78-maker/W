const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { searchAllSources, getGameDetail, proxyDownload } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.json({ success: true, results: [], total: 0 });

    const cached = getCached(`search:${query.toLowerCase()}`);
    if (cached) return res.json(cached);

    const results = await searchAllSources(query);
    const response = { success: true, results, total: results.length };
    setCache(`search:${query.toLowerCase()}`, response);
    res.json(response);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

app.get('/api/detail', async (req, res) => {
  try {
    const { source, url } = req.query;
    if (!source || !url) return res.status(400).json({ success: false, error: 'Missing source or url' });

    const cacheKey = `detail:${source}:${url}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const detail = await getGameDetail(source, decodeURIComponent(url));
    const response = { success: true, ...detail };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ success: false, error: 'Failed to get details' });
  }
});

app.get('/api/proxy', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ success: false, error: 'Missing url' });

    const stream = await proxyDownload(decodeURIComponent(url));
    const filename = url.split('/').pop().split('?')[0] || 'download.apk';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (stream.headers['content-type']) {
      res.setHeader('Content-Type', stream.headers['content-type']);
    }
    stream.data.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ success: false, error: 'Download failed' });
  }
});

app.get('/api/sources', (req, res) => {
  const { SOURCES } = require('./sources');
  res.json({
    success: true,
    sources: Object.entries(SOURCES).map(([id, s]) => ({
      id, name: s.name, baseUrl: s.baseUrl,
    })),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`⚡ ModHub server running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/search?q=brawl+stars`);
});
