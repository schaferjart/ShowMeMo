(() => {
  'use strict';

  const img = document.getElementById('artwork');
  const refreshBtn = document.getElementById('refresh');
  const downloadBtn = document.getElementById('download');
  const caption = document.getElementById('caption');
  const capSummary = document.getElementById('cap-summary');
  const capDetails = document.getElementById('cap-details');
  const capClose = document.getElementById('cap-close');
  const capTitle = document.getElementById('cap-title');
  const capMeta = document.getElementById('cap-meta');
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

  let current = null;

  function show(record) {
    current = record;
    img.classList.remove('loaded');
    img.alt = [record.Title, record.Artist].filter(Boolean).join(' — ');
    img.src = record.ImageURL;

    capTitle.textContent = record.Title || 'Untitled';
    const meta = [record.Artist, record.Date].filter(Boolean).join(', ');
    capMeta.textContent = meta ? ', ' + meta : '';
    capMedium.textContent = record.Medium;
    capCredit.textContent = record.CreditLine;
    capLink.hidden = !record.URL;
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

  function setDetailsOpen(open) {
    capDetails.hidden = !open;
    caption.classList.toggle('open', open);
    capSummary.setAttribute('aria-expanded', String(open));
  }

  let downloading = false;
  async function downloadImage() {
    if (!current || downloading) return;
    downloading = true;
    try {
      const res = await fetch(current.ImageURL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blobURL = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobURL;
      a.download = `moma-${current.ObjectID}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobURL), 10000);
    } catch {
      open(current.ImageURL, '_blank', 'noopener');
    } finally {
      downloading = false;
    }
  }

  refreshBtn.addEventListener('click', next);
  downloadBtn.addEventListener('click', downloadImage);
  capSummary.addEventListener('click', () => {
    if (capDetails.hidden) setDetailsOpen(true);
  });
  capClose.addEventListener('click', () => setDetailsOpen(false));

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'r') {
      e.preventDefault();
      next();
    } else if (key === 'i') {
      setDetailsOpen(capDetails.hidden);
    } else if (key === 'escape') {
      setDetailsOpen(false);
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
