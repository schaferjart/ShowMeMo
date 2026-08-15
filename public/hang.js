// The hang: fitting a set of artworks onto whatever screen showed up.
//
// Rows of works, each row spanning the full width at the works' true
// proportions — the justified layout every picture gallery uses. The twist is
// that this one also has to end exactly at the bottom of the viewport, with no
// scrolling and no leftover band of background.
//
// For a row of k works with aspect ratios r (width/height) and a gap g,
// spanning width W exactly fixes the row's height:
//
//     h = (W - (k-1)g) / Σr
//
// So once the works are dealt into rows, the wall's natural height is decided
// for us — and it will not match the viewport's. Three things can close the
// gap, in ascending order of violence:
//
//   1. Open or tighten the space *between* rows. Free: the works are untouched.
//   2. Stretch every row's height by a factor s, leaving the widths alone so
//      each row still spans W. Every tile then differs from its work's true
//      proportions by the same s, and `object-fit: cover` trims one identical
//      sliver off every work — a passe-partout, not a mistake. Under a percent
//      or two nobody can see it.
//   3. Give up on filling the screen: scale the whole wall down until it fits
//      untouched and centre it, the way a small show gets a big room.
//
// The solver searches how many works to hang, how many rows to deal them into
// and how wide the gaps are, then scores each candidate on how little damage
// it has to do. Usually (1) is enough on its own.
(function (root) {
  'use strict';

  // A work whose proportions we don't know yet gets this until its pixels
  // arrive: a modest portrait, the collection's most common shape.
  const FALLBACK_RATIO = 0.78;
  // Panoramas and scrolls would otherwise swallow a row whole.
  const MIN_RATIO = 0.18;
  const MAX_RATIO = 6;
  // How many works a screen wants, from its area in CSS pixels. Sublinear on
  // purpose: a phone gets ~8 and a 27-inch display ~28, so a screen four times
  // the size shows twice the work at twice the size rather than the same work
  // enormous or four times as much postage-stamped. Calibrated by eye against
  // the real thing.
  const tilesForArea = (area) => Math.pow(area, 0.47) / 43;
  const MAX_ROWS = 16;
  // How far the space between rows may drift from the space within one.
  const ROW_GAP_MIN = 0.7;
  const ROW_GAP_MAX = 2.4;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  // Measured beats catalogued beats guessed: `trueRatio` is what the picture
  // turned out to be, `ratio` what the museum's centimetres implied, and
  // `fallback` this artist's median when the record had no dimensions at all.
  function ratioOf(item) {
    const r = item.trueRatio || item.ratio || item.fallback || FALLBACK_RATIO;
    return clamp(r, MIN_RATIO, MAX_RATIO);
  }

  // An order in which to pick works out of a list: both ends first, then the
  // middle, then the middles of what is left. Any prefix of it is spread
  // evenly across the whole list — so a chronological hang runs from the first
  // work to the last however few fit — and, crucially, each prefix *contains*
  // the one before it. That nesting is what makes asking for one more work add
  // a work rather than reshuffle the wall.
  function spreadOrder(length) {
    const order = [];
    const taken = new Uint8Array(length);
    const push = (i) => {
      if (i >= 0 && i < length && !taken[i]) {
        taken[i] = 1;
        order.push(i);
      }
    };
    push(0);
    push(length - 1);
    const queue = [[0, length - 1]];
    for (let at = 0; at < queue.length && order.length < length; at++) {
      const [lo, hi] = queue[at];
      if (hi - lo < 2) continue;
      const mid = (lo + hi) >> 1;
      push(mid);
      queue.push([lo, mid], [mid, hi]);
    }
    for (let i = 0; i < length && order.length < length; i++) push(i);
    return order;
  }

  // The first n of that order, put back into the list's own sequence.
  function spread(list, n, order) {
    if (n >= list.length) return list.slice();
    const picks = (order || spreadOrder(list.length)).slice(0, n).sort((a, b) => a - b);
    return picks.map((i) => list[i]);
  }

  // Skiena's linear partition: deal a sequence into contiguous groups so that
  // the largest group's sum of aspect ratios is as small as possible.
  // Balanced aspect sums mean rows of similar height — the even hang.
  // Contiguous groups mean the chosen order (chronology, shape, chance)
  // survives the dealing.
  //
  // One pass answers every row count up to maxRows, which matters because the
  // solver asks for all of them: partitionAll(r, 16)[3] is the best three-row
  // deal. Index 0 and any count above the number of works are null.
  function partitionAll(ratios, maxRows) {
    const n = ratios.length;
    const limit = Math.min(maxRows, n);
    const answers = [null];
    if (limit < 1) return answers;
    answers[1] = [n];

    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + ratios[i];

    // prev[i] = smallest achievable max-sum for the first i works in j-1 rows.
    let prev = Float64Array.from(prefix);
    const cuts = [];
    for (let j = 2; j <= limit; j++) {
      const cur = new Float64Array(n + 1).fill(Infinity);
      const where = new Int32Array(n + 1);
      for (let i = j; i <= n; i++) {
        for (let x = j - 1; x < i; x++) {
          const worst = Math.max(prev[x], prefix[i] - prefix[x]);
          if (worst < cur[i]) {
            cur[i] = worst;
            where[i] = x;
          }
        }
      }
      cuts[j] = where;
      prev = cur;

      const sizes = [];
      let i = n;
      for (let back = j; back > 1; back--) {
        const x = cuts[back][i];
        sizes.unshift(i - x);
        i = x;
      }
      sizes.unshift(i);
      answers[j] = sizes;
    }
    return answers;
  }

  function partition(ratios, rows) {
    return partitionAll(ratios, rows)[rows] || null;
  }

  // Geometry for one candidate: works dealt into `sizes` rows across a
  // width x height box with gap g between works in a row.
  function measure(ratios, sizes, width, height, gap) {
    const rows = sizes.length;
    const heights = new Array(rows);
    let stack = 0;
    let at = 0;
    for (let j = 0; j < rows; j++) {
      let sum = 0;
      for (let i = 0; i < sizes[j]; i++) sum += ratios[at + i];
      at += sizes[j];
      const inner = width - (sizes[j] - 1) * gap;
      if (inner <= 1) return null;
      heights[j] = inner / sum;
      stack += heights[j];
    }

    // 1. Absorb what we can in the space between rows.
    const slack = rows > 1 ? (height - stack) / (rows - 1) : gap;
    const rowGap = clamp(slack, gap * ROW_GAP_MIN, gap * ROW_GAP_MAX);
    const room = height - (rows - 1) * rowGap;
    if (room <= 1) return null;

    // 2. Whatever is left becomes a uniform stretch, and so a uniform crop.
    const scale = room / stack;
    // 3. Or, refusing to crop, a uniform shrink that leaves a margin. Note
    //    that shrinking narrows the wall as well as shortening it, so the
    //    margin has to be counted as area — measuring only the height would
    //    call a wall that gives back a third of its width nearly perfect.
    const shrink = Math.min(1, scale);
    const wallHeight = shrink * (stack + (rows - 1) * rowGap);
    const waste = 1 - (shrink * width * wallHeight) / (width * height);

    // The smallest side any work would be shown at, which is what decides
    // whether this reads as a wall or as gravel.
    let fillMin = Infinity;
    let containMin = Infinity;
    at = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < sizes[j]; i++) {
        const w = ratios[at + i] * heights[j];
        fillMin = Math.min(fillMin, heights[j] * scale, w);
        containMin = Math.min(containMin, heights[j] * shrink, w * shrink);
      }
      at += sizes[j];
    }

    return {
      heights,
      rowGap,
      scale,
      shrink,
      crop: Math.abs(1 - scale),
      waste: Math.max(0, waste),
      fillMin,
      containMin,
    };
  }

  // Filling the screen is the point, so a little cropping beats a margin — but
  // the cost climbs steeply once the stretch becomes visible.
  function fillCost(crop) {
    const over = Math.max(0, crop - 0.05);
    return crop * 40 + over * over * 4000;
  }

  // A wall that keeps every proportion but leaves the room half empty.
  function containCost(waste) {
    const over = Math.max(0, waste - 0.25);
    return 2 + waste * 25 + over * over * 400;
  }

  // Below the comfortable size a tile stops being a work and starts being a
  // thumbnail; below the floor it is not worth hanging at all.
  function sizeCost(smallest, minTile, floor) {
    if (!(smallest > floor)) return Infinity;
    if (smallest >= minTile) return 0;
    const short = (minTile - smallest) / minTile;
    return short * short * 22;
  }

  // items: [{ ratio, fallback, ... }] in the order they should hang.
  function solve(items, options) {
    const opt = options || {};
    const width = opt.width;
    const height = opt.height;
    const density = opt.density || 1;
    const floor = opt.minTileFloor || 48;
    const gaps = opt.gaps || [8, 11, 14, 18, 23, 29];

    if (!items.length || !(width > 0) || !(height > 0)) return null;

    const wanted = clamp(
      Math.round(density * tilesForArea(width * height)),
      opt.minTiles || 3,
      opt.maxTiles || 48
    );
    const target = Math.min(wanted, items.length);
    // "Too small" is relative to the wall being asked for, not to the screen:
    // no work should come out much under half the average tile. Tying it to
    // the target rather than a fixed number is what lets the density control
    // actually reach a dense wall instead of being vetoed by a floor.
    const minTile =
      opt.minTile || clamp(Math.sqrt((width * height) / Math.max(target, 1)) * 0.42, 40, 190);
    // Rehanging a wall that is already up (the settle, a window resize) should
    // move the works, not swap them out: leaning towards the count already
    // showing keeps the same pictures on the wall unless the geometry really
    // has changed underneath them.
    const nearCount = opt.nearCount || 0;
    // A generous window around what the screen asks for; the scoring decides.
    const lo = Math.max(1, target - 10);
    const hi = Math.min(items.length, target + 10);

    const order = spreadOrder(items.length);
    let winner = null;
    for (let n = lo; n <= hi; n++) {
      const chosen = spread(items, n, order);
      const ratios = chosen.map(ratioOf);
      const deals = partitionAll(ratios, MAX_ROWS);
      // Straying from the number of works the screen asked for costs real
      // points — otherwise a marginally neater arrangement would quietly
      // override the viewer turning the density up or down. Showing fewer than
      // asked costs more: an empty-looking room is the worse sin.
      const missing = (Math.max(0, target - n) / Math.max(target, 1)) * 9;
      const extra = (Math.max(0, n - target) / Math.max(target, 1)) * 6;
      const churn = nearCount ? (Math.abs(n - nearCount) / nearCount) * 8 : 0;

      for (let rows = 1; rows < deals.length; rows++) {
        const sizes = deals[rows];
        if (!sizes) continue;
        // Wildly uneven row lengths read as an accident rather than a hang.
        const even = n / rows;
        const ragged = sizes.reduce((sum, k) => sum + Math.abs(k - even), 0) / n;

        for (const gap of gaps) {
          const fit = measure(ratios, sizes, width, height, gap);
          if (!fit) continue;
          const common = missing + extra + churn + ragged + gaps.indexOf(gap) * 0.04;

          const fill = fillCost(fit.crop) + sizeCost(fit.fillMin, minTile, floor) + common;
          const contain =
            containCost(fit.waste) + sizeCost(fit.containMin, minTile, floor) + common;
          const mode = fill <= contain ? 'fill' : 'contain';
          const score = Math.min(fill, contain);

          if (score < Infinity && (!winner || score < winner.score)) {
            winner = { score, mode, n, rows, gap, sizes, chosen, ratios, fit };
          }
        }
      }
    }

    return winner ? place(winner, width, height) : null;
  }

  function place(winner, width, height) {
    const { sizes, chosen, ratios, fit, mode } = winner;
    // Filling stretches heights only; containing scales the whole composition.
    const vScale = mode === 'fill' ? fit.scale : fit.shrink;
    const hScale = mode === 'fill' ? 1 : fit.shrink;
    const gap = winner.gap * hScale;
    const rowGap = fit.rowGap * (mode === 'fill' ? 1 : fit.shrink);

    const rows = [];
    let at = 0;
    let y = 0;
    for (let j = 0; j < sizes.length; j++) {
      const boxHeight = fit.heights[j] * vScale;
      const tiles = [];
      let x = 0;
      for (let i = 0; i < sizes[j]; i++) {
        // Widths are the row's natural widths, which is why the row still
        // spans its full measure after the vertical stretch.
        const w = ratios[at + i] * fit.heights[j] * hScale;
        tiles.push({ item: chosen[at + i], x, y, w, h: boxHeight, row: j, col: i });
        x += w + gap;
      }
      // Floating-point dust, pushed onto the last tile so the row ends flush.
      const overshoot = x - gap - width * hScale;
      if (tiles.length) tiles[tiles.length - 1].w -= overshoot;
      rows.push({ height: boxHeight, tiles });
      y += boxHeight + rowGap;
      at += sizes[j];
    }

    const wallWidth = width * hScale;
    const wallHeight = y - rowGap;
    const offsetX = (width - wallWidth) / 2;
    const offsetY = (height - wallHeight) / 2;
    const tiles = [];
    for (const row of rows) {
      for (const tile of row.tiles) {
        tile.x += offsetX;
        tile.y += offsetY;
        tiles.push(tile);
      }
    }

    // Reveal from the middle outwards: the wall grows rather than scans.
    tiles
      .map((t) => ({ t, d: Math.hypot(t.x + t.w / 2 - width / 2, t.y + t.h / 2 - height / 2) }))
      .sort((a, b) => a.d - b.d)
      .forEach((entry, i) => {
        entry.t.order = i;
      });

    return {
      rows,
      tiles,
      items: chosen,
      mode,
      count: winner.n,
      rowCount: sizes.length,
      gap,
      rowGap,
      // How much of each work the tiles trim off, and how much of the screen
      // the wall gives back. One of the two is always zero.
      crop: mode === 'fill' ? fit.crop : 0,
      waste: mode === 'fill' ? 0 : fit.waste,
      smallest: mode === 'fill' ? fit.fillMin : fit.containMin,
      wallWidth,
      wallHeight,
      width,
      height,
    };
  }

  root.Hang = { solve, partition, partitionAll, spread, spreadOrder, ratioOf, FALLBACK_RATIO };
})(typeof globalThis === 'object' ? globalThis : this);
