const axios = require('axios');
const cheerio = require('cheerio');
const { SOURCES, GAME_SOURCE_MAPPINGS, SOURCE_ORDER } = require('./sources');

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildProxyUrl(url) {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) return null;
  return `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=us&render=false`;
}

async function fetchUrl(url, sourceId) {
  const config = SOURCES[sourceId];
  const proxyUrl = buildProxyUrl(url);
  const targetUrl = proxyUrl || url;

  const headers = {
    'User-Agent': getUA(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  const res = await axios.get(targetUrl, {
    headers,
    httpsAgent: agent,
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'text',
  });

  return res.data;
}

async function searchSource(sourceId, query) {
  const config = SOURCES[sourceId];
  const searchUrl = `${config.baseUrl}${config.searchUrl.replace('{query}', encodeURIComponent(query))}`;
  const results = [];

  try {
    await delay(config.rateLimit);
    const html = await fetchUrl(searchUrl, sourceId);
    const $ = cheerio.load(html);

    $(config.selectors.list).each((i, el) => {
      if (i >= 5) return false;
      const $el = $(el);
      const title = $el.find(config.selectors.title).text().trim();
      let link = $el.find(config.selectors.link).attr('href') || '';
      let icon = $el.find(config.selectors.icon).attr('src') || $el.find(config.selectors.icon).attr('data-src') || '';
      const version = $el.find(config.selectors.version).text().trim() || '';
      const size = $el.find(config.selectors.size).text().trim() || '';

      if (!title || !link) return;

      if (link.startsWith('/')) link = config.baseUrl + link;
      else if (!link.startsWith('http')) link = config.baseUrl + '/' + link;
      if (icon && icon.startsWith('/')) icon = config.baseUrl + icon;
      else if (icon && !icon.startsWith('http')) icon = config.baseUrl + '/' + icon;

      results.push({
        id: `${sourceId}-${Buffer.from(title).toString('base64').slice(0, 12)}`,
        title,
        icon: icon || '',
        source: sourceId,
        sourceName: config.name,
        url: link,
        version,
        size,
        score: 0,
      });
    });
  } catch (err) {
    console.error(`[${sourceId}] search error:`, err.message);
  }

  return results;
}

async function searchAllSources(query) {
  const sources = GAME_SOURCE_MAPPINGS[query.toLowerCase()] || SOURCE_ORDER;

  const promises = sources.map(sid => searchSource(sid, query).catch(() => []));
  const results = await Promise.allSettled(promises);

  const all = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  deduplicate(all);
  return all.sort((a, b) => b.score - a.score);
}

function deduplicate(items) {
  const seen = new Set();
  for (let i = items.length - 1; i >= 0; i--) {
    const key = items[i].title.toLowerCase().trim();
    if (seen.has(key)) { items.splice(i, 1); continue; }
    seen.add(key);
    let matches = 0;
    for (let j = 0; j < items.length; j++) {
      if (i !== j && items[j].title.toLowerCase().trim().includes(key)) matches++;
    }
    items[i].score = matches;
  }
}

async function getGameDetail(sourceId, gameUrl) {
  const config = SOURCES[sourceId];
  const detail = { downloadLinks: [], screenshots: [] };

  try {
    await delay(config.rateLimit + 500);
    const html = await fetchUrl(gameUrl, sourceId);
    const $ = cheerio.load(html);

    $('a[href$=".apk"], a[href*="download"], a[href*="dl/"], .download-btn a, .download-link a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) detail.downloadLinks.push(href.startsWith('http') ? href : new URL(href, config.baseUrl).href);
    });

    $('img[src*="screenshot"], img[src*="screen"], .screenshot img, .gallery img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) detail.screenshots.push(src.startsWith('http') ? src : new URL(src, config.baseUrl).href);
    });

    $('.mod-features li, .mod-list li, .features li').each((i, el) => {
      const text = $(el).text().trim();
      if (text) detail.modFeatures.push(text);
    });

    const descSelectors = [
      '.description', '.post-content', '.entry-content',
      '.app-description', '.game-description', '.content',
    ];
    for (const sel of descSelectors) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 50) { detail.description = text; break; }
    }
  } catch (err) {
    console.error(`[${sourceId}] detail error:`, err.message);
  }

  return detail;
}

async function proxyDownload(downloadUrl) {
  const response = await axios.get(downloadUrl, {
    responseType: 'stream',
    httpsAgent: agent,
    timeout: 30000,
    maxRedirects: 10,
    headers: { 'User-Agent': getUA(), Referer: new URL(downloadUrl).origin + '/' },
  });
  return response;
}

module.exports = { searchAllSources, searchSource, getGameDetail, proxyDownload };
