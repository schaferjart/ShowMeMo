(() => {
  'use strict';

  const stage = document.getElementById('stage');
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
  // Deep enough to feel unlimited; bounded so hours of browsing can't pile up
  // hundreds of decoded JPEGs on low-memory devices.
  const MAX_LAYERS = 30;

  let meta = null;
  let preloaded = null; // { record, image } fetched ahead of time
  let errorStreak = 0;
  const layers = []; // bottom -> top, mirroring DOM order in #stage
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

  // Same work -> same resting place: a deterministic offset keeps the pile
  // aligned (never rotated) without looking mechanical.
  function settle(el) {
    const h = Math.imul(Number(el.dataset.id) || 1, 2654435761) >>> 0;
    const dx = ((h % 61) - 30) / 10; // ±3% of the work's width
    const dy = (((h >>> 8) % 41) - 20) / 10; // ±2% of the work's height
    el.style.setProperty('--dx', dx + '%');
    el.style.setProperty('--dy', dy + '%');
    el.classList.add('settled');
    el.alt = ''; // the pile is decorative; screen readers get the top work only
  }

  function removeLayer(el) {
    const i = layers.indexOf(el);
    if (i !== -1) layers.splice(i, 1);
    el.remove();
  }

  function show(record, preImg) {
    current = record;

    const image = preImg && preImg.src === record.ImageURL ? preImg : new Image();
    image.className = 'work';
    image.decoding = 'async';
    image.dataset.id = record.ObjectID;
    image.alt = [record.Title, record.Artist].filter(Boolean).join(' — ');
    image.addEventListener('load', () => {
      errorStreak = 0;
      image.classList.add('loaded');
    });
    // Some image URLs will have rotted; silently move on to another work.
    image.addEventListener('error', () => {
      const wasTop = layers[layers.length - 1] === image;
      removeLayer(image);
      if (wasTop && ++errorStreak <= 10) next();
    });
    if (!image.src) image.src = record.ImageURL;

    const prevTop = layers[layers.length - 1];
    if (prevTop) settle(prevTop);
    layers.push(image);
    stage.append(image);
    if (image.complete && image.naturalWidth > 0) {
      // Preloaded and already decoded; the load event fired before we listened.
      errorStreak = 0;
      requestAnimationFrame(() => image.classList.add('loaded'));
    }
    while (layers.length > MAX_LAYERS) {
      const oldest = layers.shift();
      oldest.classList.add('gone');
      setTimeout(() => oldest.remove(), 500);
    }

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
    let candidate = preloaded;
    preloaded = null;
    if (candidate && candidate.image.complete && candidate.image.naturalWidth === 0) {
      candidate = null; // the preloaded URL had rotted; pick fresh
    }
    if (candidate) show(candidate.record, candidate.image);
    else show(await pickRandom());
    preloadNext();
  }

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
