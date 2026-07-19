(() => {
  'use strict';

  const viewer = document.getElementById('artwork');
  const refreshBtn = document.getElementById('refresh');
  const captionBtn = document.getElementById('toggle-caption');
  const caption = document.getElementById('caption');
  const capTitle = document.getElementById('cap-title');
  const capArtist = document.getElementById('cap-artist');
  const capDate = document.getElementById('cap-date');
  const capMedium = document.getElementById('cap-medium');
  const capCredit = document.getElementById('cap-credit');
  const capLink = document.getElementById('cap-link');

  const params = new URLSearchParams(location.search);

  let meta = null;
  let errorStreak = 0;
  const shardCache = new Map();

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function getShard(n) {
    if (!shardCache.has(n)) {
      shardCache.set(n, await fetchJSON(`data/shard-${n}.json`));
    }
    return shardCache.get(n);
  }

  async function pickRandom() {
    for (let attempt = 0; attempt < 25; attempt++) {
      const n = Math.floor(Math.random() * meta.shardCount);
      let records;
      try {
        records = await getShard(n);
      } catch {
        continue;
      }
      if (records.length) {
        return records[Math.floor(Math.random() * records.length)];
      }
    }
    throw new Error('No objects found');
  }

  function show(record) {
    viewer.classList.remove('loaded');
    viewer.alt = record.Title;
    if (record.PosterURL) viewer.poster = record.PosterURL;
    viewer.src = record.GlbURL;

    capTitle.textContent = record.Title;
    capArtist.textContent = '';
    capDate.textContent = '';
    capMedium.textContent =
      record.Medium && record.Medium !== record.Title ? record.Medium : '';
    capCredit.textContent = record.CreditLine;
    capLink.parentElement.hidden = !record.URL;
    if (record.URL) capLink.href = record.URL;

    const url = new URL(location);
    url.searchParams.set('id', record.ObjectID);
    history.replaceState(null, '', url);
  }

  async function next() {
    show(await pickRandom());
  }

  viewer.addEventListener('load', () => {
    errorStreak = 0;
    viewer.classList.add('loaded');
  });

  // Some packages will have rotted; silently move on to another object.
  viewer.addEventListener('error', () => {
    if (!meta || ++errorStreak > 10) return;
    next();
  });

  function toggleCaption() {
    caption.hidden = !caption.hidden;
    captionBtn.setAttribute('aria-expanded', String(!caption.hidden));
  }

  refreshBtn.addEventListener('click', next);
  captionBtn.addEventListener('click', toggleCaption);

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'r') {
      e.preventDefault();
      next();
    } else if (key === 'i') {
      toggleCaption();
    }
  });

  (async function init() {
    meta = await fetchJSON('data/meta.json');
    let record = null;
    const idParam = params.get('id');
    if (idParam && /^\d+$/.test(idParam)) {
      const id = Number(idParam);
      try {
        const records = await getShard(id % meta.shardCount);
        record = records.find((r) => r.ObjectID === id) || null;
      } catch {}
    }
    show(record || (await pickRandom()));
  })();
})();
