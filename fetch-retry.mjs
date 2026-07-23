// Fetch + full-body read with retry, for museum APIs that rate-limit (429),
// hiccup (5xx), refuse the connection, or drop the socket mid-download. Because
// the body is read INSIDE the retry, a socket that dies partway through a large
// response (SMK's ~23 MB pages) is retried too — not just connection failures.
//
// Genuine 4xx pass straight through (returned, not thrown) so the caller's own
// `!ok` handling still runs; a persistent 429/5xx is likewise returned on the
// final attempt. Returns { ok, status, text }; the caller parses the text.
import { fileURLToPath } from 'node:url';

export async function fetchText(url, opts, { attempts = 6, baseMs = 1000, maxMs = 30000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, opts);
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text(); // body read here → mid-download drops are retried
      return { ok: res.ok, status: res.status, text };
    } catch (err) {
      if (i >= attempts - 1) throw err;
      const wait = Math.min(maxMs, baseMs * 2 ** i);
      console.error(`  retry ${i + 1}/${attempts - 1} in ${wait}ms — ${err.message} (${url.slice(0, 70)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ponytail: one runnable check — retries a socket drop then a 429, then reads
// the body on the third try.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error('socket drop');
    if (calls === 2) return { status: 429, ok: false, text: async () => '' };
    return { status: 200, ok: true, text: async () => 'payload' };
  };
  const r = await fetchText('http://example/api', undefined, { baseMs: 1 });
  globalThis.fetch = orig;
  if (!r.ok || r.text !== 'payload' || calls !== 3) {
    throw new Error(`self-check failed: ok=${r.ok} text=${r.text} calls=${calls}`);
  }
  console.log(`fetch-retry self-check ok (${calls} calls, body read on retry)`);
}
