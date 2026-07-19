(() => {
  'use strict';

  const img = document.getElementById('artwork');
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
  const onViewOnly = params.get('onview') === '1';

  let meta = null;
  let preloaded = null; // { record, image } fetched ahead of time
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
      if (onViewOnly) records = records.filter((r) => r.OnView);
      if (records.length) {
        return records[Math.floor(Math.random() * records.length)];
      }
    }
    throw new Error('No works found');
  }

  function show(record) {
    img.classList.remove('loaded');
    img.alt = [record.Title, record.Artist].filter(Boolean).join(' — ');
    img.src = record.ImageURL;

    capTitle.textContent = record.Title;
    capArtist.textContent = record.Artist;
    capDate.textContent = record.Date;
    capMedium.textContent = record.Medium;
    capCredit.textContent = record.CreditLine;
    capLink.parentElement.hidden = !record.URL;
    if (record.URL) capLink.href = record.URL;

    const url = new URL(location);
    url.searchParams.set('id', record.ObjectID);
    history.replaceState(null, '', url);
  }

  function preloadNext() {
    pickRandom().then((record) => {
      const image = new Image();
      image.src = record.ImageURL;
      preloaded = { record, image };
    }, () => {});
  }

  async function next() {
    const candidate = preloaded;
    preloaded = null;
    show(candidate ? candidate.record : await pickRandom());
    preloadNext();
  }

  img.addEventListener('load', () => {
    errorStreak = 0;
    img.classList.add('loaded');
  });

  // Some image URLs will have rotted; silently move on to another work.
  img.addEventListener('error', () => {
    if (!meta || !img.src || ++errorStreak > 10) return;
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
    preloadNext();
  })();
})();
