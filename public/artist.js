// One artist at a time, hung across the whole screen.
//
// Same machine as the single-work page — pick at random, fill the viewport,
// press Space for another — except the unit of chance is an artist rather than
// a work, and what fills the viewport is their whole hand at once. hang.js
// works out the geometry; this file gets the data, puts the pixels in the
// boxes, and lets you walk around.
(() => {
  'use strict';

  const wall = document.getElementById('wall');
  const cardName = document.getElementById('card-name');
  const cardBio = document.getElementById('card-bio');
  const card = document.getElementById('card');
  const cardSummary = document.getElementById('card-summary');
  const cardDetails = document.getElementById('card-details');
  const cardHoldings = document.getElementById('card-holdings');
  const cardLink = document.getElementById('card-link');
  const cardClose = document.getElementById('card-close');
  const hangName = document.getElementById('hang-name');
  const densityLabel = document.getElementById('density-label');
  const driftToggle = document.getElementById('drift-toggle');
  const search = document.getElementById('search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const zoom = document.getElementById('zoom');
  const zoomImg = document.getElementById('zoom-img');
  const zoomTitle = document.getElementById('zoom-title');
  const zoomDate = document.getElementById('zoom-date');
  const zoomLink = document.getElementById('zoom-link');
  const zoomDownload = document.getElementById('zoom-download');
  const zoomClose = document.getElementById('zoom-close');

  const params = new URLSearchParams(location.search);
  // The long tail: every artist with more than one work, picked evenly, rather
  // than the 2,000-odd with enough work to fill a wall comfortably.
  const deepMode = params.get('deep') === '1';

  const HANGS = [
    { key: 'salon', label: 'Salon hang' },
    { key: 'chronology', label: 'Chronological hang' },
    { key: 'shapes', label: 'Hung by shape' },
  ];
  const DENSITIES = [0.5, 0.7, 1, 1.4, 1.9];
  const STORE = 'merci.wall.';
  // Slow enough that a wall left open changes without ever catching the eye.
  const DRIFT_MS = 15_000;
  const IDLE_BEFORE_DRIFT_MS = 9_000;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const link = navigator.connection || {};
  const thrifty = !!link.saveData || /(^|-)2g$/.test(link.effectiveType || '');
  // A wall is a lot of JPEGs; load a few at a time so the middle of the screen
  // arrives first and the browser is never decoding a dozen at once.
  const MAX_PARALLEL = thrifty ? 2 : 6;

  let meta = null;
  let artist = null;
  let pool = []; // the artist's works in the current hang's order
  let hang = null;
  const tiles = new Map(); // ObjectID -> element
  const shardCache = new Map();
  let generation = 0; // guards against a slow load landing after a newer one
  let inflight = 0;
  let settleTimer = 0;
  let names = null; // the search index, fetched on first use

  let densityIndex = restore('density', 2, DENSITIES.length);
  let hangIndex = restore('hang', 0, HANGS.length);
  let drifting = read('drift') !== 'off' && !reduceMotion.matches;

  function read(key) {
    try {
      return localStorage.getItem(STORE + key);
    } catch {
      return null;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(STORE + key, value);
    } catch {
      /* private browsing; the preference just won't stick */
    }
  }
  function restore(key, fallback, length) {
    const stored = read(key);
    if (stored === null) return fallback; // Number(null) is 0, which is a real index
    const n = Number(stored);
    return Number.isInteger(n) && n >= 0 && n < length ? n : fallback;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function getShard(n) {
    if (!shardCache.has(n)) {
      shardCache.set(
        n,
        fetchJSON(`data/artists/shard-${n}.json`).catch((err) => {
          shardCache.delete(n);
          throw err;
        })
      );
    }
    return shardCache.get(n);
  }

  // --- the records -------------------------------------------------------

  // MoMA's media URLs are one template with the file id and its signature
  // swapped in; build.mjs stores just those two. See the note there.
  function mediaURL(fileID, sha) {
    const payload = `[["f","${fileID}"],["p","convert","-resize 1024x1024\\u003e"]]`;
    const b64 = btoa(payload).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `https://www.moma.org/media/${b64}.jpg?sha=${sha}`;
  }

  function toWork(tuple, fallback) {
    const [id, image, sha, ratio, title, date, onView] = tuple;
    return {
      id,
      url: typeof image === 'string' ? image : mediaURL(image, sha),
      ratio: ratio || 0,
      fallback,
      title: title || 'Untitled',
      date: date || '',
      onView: !!onView,
      page: `https://www.moma.org/collection/works/${id}`,
      state: 'idle', // idle -> loading -> ok | error
    };
  }

  function toArtist(id, record) {
    const works = record.w.map((tuple) => toWork(tuple, record.r));
    return {
      id: Number(id),
      name: record.n,
      bio: record.b || '',
      count: record.c,
      fallback: record.r,
      works,
      // Big oeuvres arrive as a sample that spans the career; the rest follows.
      partial: record.c > works.length,
    };
  }

  async function getArtist(id) {
    try {
      const shard = await getShard(id % meta.shardCount);
      const record = shard[String(id)];
      return record ? toArtist(id, record) : null;
    } catch {
      return null;
    }
  }

  // Pick a shard in proportion to the artists it holds, then an artist inside
  // it — a fair draw over everyone in the collection without ever downloading
  // an index of them. Weighting by the square root of an artist's holdings
  // leans towards substantial bodies of work without silencing the long tail.
  function pickShard() {
    const column = deepMode ? 1 : 2;
    let total = 0;
    for (const stats of meta.shards) total += stats[column];
    let ticket = Math.random() * total;
    for (let n = 0; n < meta.shards.length; n++) {
      ticket -= meta.shards[n][column];
      if (ticket <= 0) return n;
    }
    return meta.shards.length - 1;
  }

  async function pickArtist() {
    const floor = deepMode ? meta.minWorksDeep : meta.minWorksRandom;
    for (let attempt = 0; attempt < 15; attempt++) {
      let shard;
      try {
        shard = await getShard(pickShard());
      } catch {
        continue;
      }
      const entries = Object.entries(shard).filter(([, a]) => a.c >= floor);
      if (!entries.length) continue;
      let total = 0;
      const weights = entries.map(([, a]) => {
        const w = deepMode ? 1 : Math.sqrt(a.c);
        total += w;
        return w;
      });
      let ticket = Math.random() * total;
      for (let i = 0; i < entries.length; i++) {
        ticket -= weights[i];
        if (ticket <= 0) return toArtist(entries[i][0], entries[i][1]);
      }
      return toArtist(entries[0][0], entries[0][1]);
    }
    throw new Error('No artist found');
  }

  // The wall sample spans the career; this is the rest of it, fetched once the
  // first screenful is up so that rehanging can reach the whole oeuvre.
  async function loadRest(which) {
    const mine = generation;
    let all;
    try {
      all = await fetchJSON(`data/artists/works/${which.id}.json`);
    } catch {
      return;
    }
    if (generation !== mine || artist !== which) return;
    const known = new Map(which.works.map((w) => [w.id, w]));
    which.works = all.map((tuple) => known.get(tuple[0]) || toWork(tuple, which.fallback));
    which.partial = false;
    orderPool();
  }

  // --- the hang ----------------------------------------------------------

  const yearCache = new Map();
  function yearOf(work) {
    if (!yearCache.has(work.id)) {
      const found = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(work.date);
      yearCache.set(work.id, found ? Number(found[1]) : Infinity);
    }
    return yearCache.get(work.id);
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function orderPool() {
    const works = artist.works.filter((w) => w.state !== 'error');
    const mode = HANGS[hangIndex].key;
    if (mode === 'chronology') {
      works.sort((a, b) => yearOf(a) - yearOf(b) || a.id - b.id);
    } else if (mode === 'shapes') {
      works.sort((a, b) => shapeOf(a) - shapeOf(b) || a.id - b.id);
    } else {
      shuffle(works);
    }
    pool = works;
  }

  const shapeOf = (work) => work.trueRatio || Hang.ratioOf(work);

  // The wall stops exactly where the artist's name begins. Measuring the bar
  // rather than guessing at it keeps the two from overlapping whatever the
  // font, the language or the phone decides the line height should be.
  const bottom = document.getElementById('bottom');
  function measureLabel() {
    if (!cardDetails.hidden) return; // the open panel is allowed to overlap
    const height = Math.round(bottom.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--wall-label', `${height}px`);
  }

  function box() {
    const rect = wall.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function density() {
    // Someone on a metered connection gets a sparser, lighter wall.
    return DENSITIES[densityIndex] * (thrifty ? 0.7 : 1);
  }

  // One path for every rehang: the pool is already in the order this hang
  // wants, so re-solving it is what happens on a resize, a density change and
  // the settle alike. Because the choice of which works to show is a pure
  // function of how many fit, a settle that lands on the same count keeps the
  // same works and only moves them.
  function relayout(options) {
    const opts = options || {};
    const size = box();
    if (!pool.length) return;
    const solved = Hang.solve(pool, {
      width: size.width,
      height: size.height,
      density: density(),
      // A settle or a resize adjusts the wall that is up; a rehang starts over.
      nearCount: opts.steady && hang ? hang.count : 0,
    });
    if (!solved) return;
    hang = solved;
    paint(opts.animate !== false);
  }

  function paint(animate) {
    wall.classList.toggle('settling', !!animate && !reduceMotion.matches);
    const present = new Set();
    for (const tile of hang.tiles) {
      present.add(tile.item.id);
      let el = tiles.get(tile.item.id);
      if (!el) {
        el = build(tile.item);
        wall.append(el);
        tiles.set(tile.item.id, el);
      }
      position(el, tile);
    }
    for (const [id, el] of tiles) {
      if (present.has(id)) continue;
      tiles.delete(id);
      retire(el);
    }
    wall.setAttribute('aria-busy', 'false');
    pump();
  }

  function position(el, tile) {
    el.tile = tile;
    el.style.left = `${tile.x}px`;
    el.style.top = `${tile.y}px`;
    el.style.width = `${tile.w}px`;
    el.style.height = `${tile.h}px`;
  }

  function retire(el) {
    // A tile pulled off the wall mid-download hands its slot in the queue back.
    if (el.queued) {
      el.queued = false;
      inflight = Math.max(0, inflight - 1);
      if (el.work && el.work.state === 'loading') el.work.state = 'idle';
      pump();
    }
    // Leave no entry pointing at an element on its way out, or the next hang
    // that wants this work would style a node that is no longer in the page.
    if (el.work && tiles.get(el.work.id) === el) tiles.delete(el.work.id);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 420);
  }

  // `quiet` marks a tile that should not make the wall think again when it
  // arrives — a work that drifted in on its own has been fitted to a box that
  // already exists, and re-solving around it would just undo the drift.
  function build(work, quiet) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.work = work;
    el.quiet = !!quiet;
    const img = document.createElement('img');
    img.decoding = 'async';
    img.alt = work.title + (work.date ? `, ${work.date}` : '');
    img.addEventListener('load', () => arrived(work, el, img), { once: true });
    img.addEventListener('error', () => failed(work, el), { once: true });
    el.append(img);
    el.addEventListener('click', () => openZoom(work));
    el.addEventListener('pointerenter', () => label(work));
    el.addEventListener('pointerleave', () => label(null));
    el.addEventListener('focus', () => label(work));
    el.addEventListener('blur', () => label(null));
    // A work already seen this session is in the browser's cache: no queue.
    if (work.state === 'ok') img.src = work.url;
    return el;
  }

  // --- loading -----------------------------------------------------------

  function pump() {
    while (inflight < MAX_PARALLEL) {
      const tile = hang && hang.tiles.find((t) => t.item.state === 'idle' && tiles.has(t.item.id));
      if (!tile) return;
      const work = tile.item;
      const el = tiles.get(work.id);
      work.state = 'loading';
      el.queued = true;
      inflight++;
      // The middle of the wall is what the eye lands on first.
      el.firstChild.fetchPriority = tile.order < 4 ? 'high' : 'low';
      el.firstChild.src = work.url;
    }
  }

  function release(el) {
    if (!el.queued) return false;
    el.queued = false;
    inflight = Math.max(0, inflight - 1);
    pump();
    return true;
  }

  function arrived(work, el, img) {
    if (img.naturalWidth && img.naturalHeight) {
      work.trueRatio = img.naturalWidth / img.naturalHeight;
    }
    img.classList.add('shown');
    el.classList.add('filled');
    if (work.state !== 'error') work.state = 'ok';
    if (release(el) && !el.quiet) {
      // Debounced so the wall settles once, after the rush, not per picture.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 450);
    }
  }

  function failed(work, el) {
    work.state = 'error';
    release(el);
    // A rotted image URL leaves a hole; fill it with something the same shape
    // rather than re-solving the whole wall around the gap.
    const tile = el.tile;
    if (tiles.get(work.id) === el) tiles.delete(work.id);
    el.remove();
    const stand = tile && understudy(tile);
    if (stand) swapIn(tile, stand, false);
  }

  // The work in the artist's holdings whose proportions best match a box that
  // is already on the wall — so it can be dropped in without redrawing. With a
  // tolerance given, only a work that really does fit the box will do; without
  // one, the closest thing beats leaving a hole.
  function understudy(tile, tolerance) {
    if (!tile) return null;
    const wanted = tile.w / tile.h;
    const taken = new Set(hang.items.map((w) => w.id));
    let best = null;
    let closest = tolerance || Infinity;
    for (const work of artist.works) {
      if (taken.has(work.id) || work.state === 'error' || work.state === 'loading') continue;
      const off = Math.abs(Math.log(shapeOf(work) / wanted));
      if (off < closest) {
        closest = off;
        best = work;
      }
    }
    return best;
  }

  // Put `next` in `tile`'s box. Crossfading leaves the old picture up until
  // the new one has arrived, so the wall dissolves rather than blinks.
  function swapIn(tile, next, crossfade) {
    const outgoing = crossfade ? tiles.get(tile.item.id) : null;
    const index = hang.items.indexOf(tile.item);
    if (index !== -1) hang.items[index] = next;
    tile.item = next;

    const el = build(next, crossfade);
    position(el, tile);
    if (outgoing) el.style.zIndex = '2';
    wall.append(el);
    tiles.set(next.id, el);
    if (outgoing) {
      const done = () => {
        if (tiles.get(next.id) === el) retire(outgoing);
      };
      el.firstChild.addEventListener('load', done, { once: true });
      el.firstChild.addEventListener('error', done, { once: true });
    }
    pump();
  }

  // The wall was hung from the catalogue's measurements of the objects. Now
  // that the pictures themselves have arrived and reported their real
  // proportions, hang it again — and let it visibly move into place.
  function settle() {
    if (!hang) return;
    const before = hang.tiles.map((t) => `${t.item.id}:${Math.round(t.x)}:${Math.round(t.y)}`).join();
    relayout({ animate: true, steady: true });
    const after = hang.tiles.map((t) => `${t.item.id}:${Math.round(t.x)}:${Math.round(t.y)}`).join();
    describe();
    if (before !== after && window.posthog) {
      posthog.capture('wall_settled', { crop: round(hang.crop), waste: round(hang.waste) });
    }
  }

  const round = (n) => Math.round(n * 1000) / 1000;

  // --- the label ---------------------------------------------------------

  // The bar under the wall names the artist; pointing at a work borrows it to
  // name that work instead.
  function label(work) {
    cardBio.textContent = work
      ? `${work.title}${work.date ? ', ' + work.date : ''}`
      : artist
        ? artist.bio
        : '';
    cardBio.classList.toggle('work-title', !!work);
  }

  function describe() {
    cardName.textContent = artist.name;
    label(null);
    cardLink.href = `https://www.moma.org/artists/${artist.id}`;
    const shown = hang ? hang.count : 0;
    const onView = hang ? hang.items.filter((w) => w.onView).length : 0;
    cardHoldings.textContent =
      `${artist.count.toLocaleString()} work${artist.count === 1 ? '' : 's'} with images ` +
      `in the collection · ${shown} on this wall` +
      (onView ? `, ${onView} of them on view at MoMA` : '');
    hangName.textContent = HANGS[hangIndex].label;
    densityLabel.textContent = shown ? `${shown} works` : 'works';
    driftToggle.textContent = drifting ? 'drifting' : 'still';
    driftToggle.setAttribute('aria-pressed', String(drifting));
  }

  function setDetailsOpen(open) {
    cardDetails.hidden = !open;
    card.classList.toggle('open', open);
    cardSummary.setAttribute('aria-expanded', String(open));
    if (open) describe();
  }

  // --- one work, close up ------------------------------------------------

  let zoomed = null;

  function openZoom(work) {
    zoomed = work;
    zoomImg.src = work.url;
    zoomImg.alt = work.title;
    zoomTitle.textContent = work.title;
    const credit = [artist.name, work.date].filter(Boolean).join(', ');
    zoomDate.textContent = credit ? `, ${credit}` : '';
    zoomLink.href = work.page;
    zoom.hidden = false;
    zoomClose.focus();
    if (window.posthog) {
      posthog.capture('wall_work_opened', {
        object_id: work.id,
        title: work.title,
        artist: artist.name,
        constituent_id: artist.id,
      });
    }
  }

  function closeZoom() {
    zoom.hidden = true;
    zoomImg.removeAttribute('src');
    const el = zoomed && tiles.get(zoomed.id);
    zoomed = null;
    if (el) el.focus();
  }

  function stepZoom(delta) {
    if (!zoomed || !hang) return;
    const order = hang.tiles.map((t) => t.item);
    const at = order.indexOf(zoomed);
    if (at === -1) return;
    openZoom(order[(at + delta + order.length) % order.length]);
  }

  let downloading = false;
  async function download() {
    if (!zoomed || downloading) return;
    downloading = true;
    const work = zoomed;
    try {
      const res = await fetch(work.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blobURL = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobURL;
      a.download = `moma-${work.id}.jpg`;
      a.click();
      if (window.posthog) {
        posthog.capture('artwork_downloaded', {
          object_id: work.id,
          title: work.title,
          artist: artist.name,
        });
      }
      setTimeout(() => URL.revokeObjectURL(blobURL), 10000);
    } catch {
      open(work.url, '_blank', 'noopener');
    } finally {
      downloading = false;
    }
  }

  // --- finding an artist by name -----------------------------------------

  let picked = -1;
  let matches = [];

  async function openSearch() {
    search.hidden = false;
    searchInput.value = '';
    searchInput.focus();
    searchResults.replaceChildren();
    if (!names) {
      searchInput.placeholder = 'Loading the index…';
      try {
        names = await fetchJSON('data/artists/names.json');
      } catch {
        searchInput.placeholder = 'The index could not be loaded';
        return;
      }
    }
    searchInput.placeholder = `Find one of ${names.length.toLocaleString()} artists`;
    runSearch(); // in case they started typing while the index was in flight
    if (window.posthog) posthog.capture('wall_search_opened');
  }

  function closeSearch() {
    search.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function runSearch() {
    const query = searchInput.value.trim().toLowerCase();
    matches = [];
    if (names && query) {
      const scored = [];
      for (const entry of names) {
        const at = entry[1].toLowerCase().indexOf(query);
        if (at === -1) continue;
        // Whoever's name starts with what you typed comes first, then whoever
        // has a word starting with it, then everyone else — holdings breaking
        // every tie.
        const rank = at === 0 ? 0 : /\s|-/.test(entry[1][at - 1]) ? 1 : 2;
        scored.push([rank, -entry[2], entry]);
        if (scored.length > 4000) break;
      }
      scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      matches = scored.slice(0, 40).map((s) => s[2]);
    }
    picked = matches.length ? 0 : -1;
    searchInput.setAttribute('aria-expanded', String(matches.length > 0));
    searchResults.replaceChildren(
      ...matches.map((entry, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === picked));
        const name = document.createElement('span');
        name.textContent = entry[1];
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = `${entry[2].toLocaleString()} work${entry[2] === 1 ? '' : 's'}`;
        li.append(name, count);
        li.addEventListener('click', () => choose(i));
        return li;
      })
    );
  }

  function movePick(delta) {
    if (!matches.length) return;
    picked = (picked + delta + matches.length) % matches.length;
    [...searchResults.children].forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === picked))
    );
    searchResults.children[picked].scrollIntoView({ block: 'nearest' });
  }

  function choose(index) {
    const entry = matches[index];
    if (!entry) return;
    closeSearch();
    if (window.posthog) posthog.capture('wall_search_chose', { constituent_id: entry[0] });
    go(() => getArtist(entry[0]));
  }

  // --- the wall drifting -------------------------------------------------

  let lastTouch = 0;
  const touched = () => {
    lastTouch = performance.now();
  };

  function mayDrift() {
    return (
      drifting &&
      hang &&
      artist &&
      !document.hidden &&
      zoom.hidden &&
      search.hidden &&
      !reduceMotion.matches &&
      artist.works.length > hang.count &&
      performance.now() - lastTouch > IDLE_BEFORE_DRIFT_MS &&
      !inflight
    );
  }

  function drift() {
    if (!mayDrift()) return;
    const settled = hang.tiles.filter((t) => t.item.state === 'ok');
    if (!settled.length) return;
    const tile = settled[Math.floor(Math.random() * settled.length)];
    // Only a work that genuinely fits the box may drift into it; the
    // composition stays put and the pictures rotate through it.
    const next = understudy(tile, 0.12);
    if (next) swapIn(tile, next, true);
  }

  // --- moving between artists --------------------------------------------

  let busy = false;

  async function go(loader, event) {
    if (busy) return;
    busy = true;
    generation++;
    const fade = !reduceMotion.matches && !!artist;
    if (fade) {
      wall.style.opacity = '0';
      await new Promise((done) => setTimeout(done, 320));
    }
    let next = null;
    try {
      next = await loader();
    } catch {
      next = null;
    }
    if (!next) {
      // A permalink to nobody, or a shard that would not load: fall back to
      // chance rather than leaving an empty room.
      try {
        next = await pickArtist();
      } catch {
        wall.style.opacity = '';
        busy = false;
        fail('Nothing could be loaded. Try again in a moment.');
        return;
      }
    }
    clearWall();
    show(next, event);
    wall.style.opacity = '';
    busy = false;
  }

  function clearWall() {
    for (const el of tiles.values()) el.remove();
    tiles.clear();
    for (const el of wall.querySelectorAll('.tile')) el.remove();
    inflight = 0;
    clearTimeout(settleTimer);
    hang = null;
  }

  function fail(message) {
    const p = document.createElement('p');
    p.className = 'wall-error';
    p.textContent = message;
    wall.replaceChildren(p);
    wall.setAttribute('aria-busy', 'false');
  }

  function show(next, event) {
    artist = next;
    cardName.textContent = next.name;
    cardBio.textContent = next.bio;
    measureLabel();
    orderPool();
    relayout({ animate: false });
    describe();
    lastTouch = performance.now();

    const url = new URL(location);
    url.searchParams.set('artist', String(artist.id));
    history.replaceState(null, '', url);
    document.title = `${artist.name} — Merci: MoMA`;

    if (artist.partial) {
      const later = () => loadRest(artist);
      if (window.requestIdleCallback) requestIdleCallback(later, { timeout: 4000 });
      else setTimeout(later, 1200);
    }

    if (window.posthog && hang) {
      posthog.capture('artist_wall_viewed', {
        constituent_id: artist.id,
        artist: artist.name,
        works_total: artist.count,
        works_shown: hang.count,
        rows: hang.rowCount,
        hang: HANGS[hangIndex].key,
        density: DENSITIES[densityIndex],
        crop: round(hang.crop),
        waste: round(hang.waste),
        mode: hang.mode,
        viewport: `${Math.round(innerWidth)}x${Math.round(innerHeight)}`,
        source: event || 'load',
      });
    }
  }

  function rehang(reason) {
    if (!artist) return;
    orderPool();
    relayout({ animate: true });
    describe();
    lastTouch = performance.now();
    if (window.posthog) {
      posthog.capture('wall_rehung', {
        constituent_id: artist.id,
        reason,
        hang: HANGS[hangIndex].key,
        density: DENSITIES[densityIndex],
        works_shown: hang ? hang.count : 0,
      });
    }
  }

  // --- wiring ------------------------------------------------------------

  document.getElementById('another').addEventListener('click', () => go(pickArtist, 'button'));
  document.getElementById('reshuffle').addEventListener('click', () => rehang('button'));
  document.getElementById('hang-mode').addEventListener('click', () => cycleHang());
  document.getElementById('find').addEventListener('click', openSearch);
  hangName.addEventListener('click', () => cycleHang());
  driftToggle.addEventListener('click', () => {
    drifting = !drifting;
    write('drift', drifting ? 'on' : 'off');
    describe();
  });

  function cycleHang() {
    hangIndex = (hangIndex + 1) % HANGS.length;
    write('hang', String(hangIndex));
    rehang('hang');
  }

  function step(delta) {
    const next = densityIndex + delta;
    if (next < 0 || next >= DENSITIES.length) return;
    densityIndex = next;
    write('density', String(densityIndex));
    relayout({ animate: true });
    describe();
    lastTouch = performance.now();
    if (window.posthog) {
      posthog.capture('wall_density_changed', {
        density: DENSITIES[densityIndex],
        works_shown: hang ? hang.count : 0,
      });
    }
  }

  for (const button of document.querySelectorAll('.density button')) {
    button.addEventListener('click', () => step(Number(button.dataset.step)));
  }

  cardSummary.addEventListener('click', () => {
    if (cardDetails.hidden) setDetailsOpen(true);
  });
  cardClose.addEventListener('click', () => setDetailsOpen(false));
  cardLink.addEventListener('click', () => {
    if (window.posthog) {
      posthog.capture('artist_moma_link_clicked', {
        constituent_id: artist && artist.id,
        artist: artist && artist.name,
      });
    }
  });

  zoom.addEventListener('click', (e) => {
    if (e.target === zoom || e.target === zoomImg) closeZoom();
  });
  zoomClose.addEventListener('click', closeZoom);
  zoomDownload.addEventListener('click', download);

  searchInput.addEventListener('input', runSearch);
  search.addEventListener('click', (e) => {
    if (e.target === search) closeSearch();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      movePick(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      movePick(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(picked);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!search.hidden) return; // the search field owns the keyboard
    const key = e.key.toLowerCase();
    if (!zoom.hidden) {
      if (key === 'escape') closeZoom();
      else if (e.key === 'ArrowRight') stepZoom(1);
      else if (e.key === 'ArrowLeft') stepZoom(-1);
      return;
    }
    if (key === ' ' || key === 'r') {
      e.preventDefault();
      go(pickArtist, key === ' ' ? 'space' : 'r');
    } else if (key === 's') {
      rehang('keyboard');
    } else if (key === 'h') {
      cycleHang();
    } else if (key === '/') {
      e.preventDefault();
      openSearch();
    } else if (key === 'i') {
      setDetailsOpen(cardDetails.hidden);
    } else if (key === 'escape') {
      setDetailsOpen(false);
    } else if (e.key === '+' || e.key === '=') {
      step(1);
    } else if (e.key === '-' || e.key === '_') {
      step(-1);
    }
  });

  // The screen is half the problem: rotate the phone, drag the window, and the
  // wall is solved again for the shape it now has.
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measureLabel();
      if (!artist) return;
      relayout({ animate: true, steady: true });
      describe();
    }, 180);
  };
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);

  wall.addEventListener('pointermove', touched);
  addEventListener('keydown', touched);
  setInterval(drift, DRIFT_MS);

  (async function init() {
    try {
      meta = await fetchJSON('data/artists/meta.json');
    } catch (err) {
      if (window.posthog) {
        posthog.captureException(err, { additional_properties: { context: 'wall_meta_load' } });
      }
      fail('The collection index could not be loaded.');
      return;
    }
    const asked = params.get('artist') || params.get('a');
    go(() => (/^\d+$/.test(asked || '') ? getArtist(Number(asked)) : pickArtist()), 'load');
  })();
})();
