/**
 * Infinite scroll for sections/main-collection-product-grid.liquid, shared with the collection
 * search (assets/pm-collection-search.js) through window.pmCollectionGrid. FM's interface
 * (pm-* names, events, #loading-indicator.is-loading) on the tryscent.eu loader:
 * - one request at a time; the next page is read from #load-more-btn on every call;
 * - re-armed when facets.js swaps #ProductGridContainer (filters, sort), which used to stop
 *   loading for good, and after every load, so it keeps going while the button stays in view;
 * - starts loading 1500px before the sentinel and also on scroll once the sentinel is above the
 *   viewport (a fast scroll past the guarantee and FAQ sections below the grid never intersects it);
 * - loadAll() fetches the remaining pages 4 at a time and appends them in page order, and on a
 *   ?page=N link also the pages before it, put on top, so the search covers the whole collection.
 *
 * Pages are fetched by the grid's own section id (#product-grid data-id, #load-more-btn
 * data-section-id), never the file name: the file name renders the section with schema defaults,
 * so the page size and settings of a template that differs would drift. The grid's quiz and
 * featured tiles render on page one only for the same reason.
 *
 * Events on document: pm:grid:append (detail.items), pm:grid:complete, pm:grid:replace.
 */
(() => {
  if (window.pmCollectionGrid) return;

  const CONCURRENCY = 4;

  let gen = 0;
  let ctrl = new AbortController();
  let inflight = null;
  let allPromise = null;
  let seen = new Set();
  // False while pages before the one the grid was rendered for (?page=N) are not in it yet.
  let headDone = true;
  let io = null;
  let containerObserver = null;

  const grid = () => document.getElementById('product-grid');
  const button = () => document.getElementById('load-more-btn');
  const isComplete = () => {
    const btn = button();
    return headDone && !(btn && btn.dataset.nextUrl);
  };
  const showIndicator = (on) => {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.classList.toggle('is-loading', on);
  };
  const firstPage = () => {
    const target = grid();
    return (target && Number(target.dataset.pmPage)) || 1;
  };

  const rebuildSeen = () => {
    seen = new Set();
    const target = grid();
    if (target) target.querySelectorAll(':scope > li[data-pm-pid]').forEach((li) => seen.add(li.dataset.pmPid));
    headDone = firstPage() <= 1;
  };

  const sectionId = () => {
    const target = grid();
    const btn = button();
    return (target && target.dataset.id) || (btn && btn.dataset.sectionId) || '';
  };

  const pageUrl = (url, page) => {
    const next = new URL(url, location.origin);
    if (page) next.searchParams.set('page', page);
    next.searchParams.set('section_id', sectionId());
    return next.pathname + next.search;
  };

  const fetchPage = (url, signal) =>
    fetch(url, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const next = doc.getElementById('load-more-btn');
        return {
          items: [...doc.querySelectorAll('#product-grid > li.grid__item')],
          next: (next && next.dataset.nextUrl) || '',
        };
      });

  // Skips products already in the grid (the sort can shift between page requests) and keeps
  // images lazy: the first cards of every fetched page come back eager. With `before`, the cards
  // go in front of that element instead of at the end.
  const append = (items, target, before) => {
    const added = [];
    const batch = document.createDocumentFragment();
    items.forEach((li) => {
      const pid = li.dataset.pmPid;
      if (pid) {
        if (seen.has(pid)) return;
        seen.add(pid);
      }
      li.querySelectorAll('img:not([loading="lazy"])').forEach((img) => {
        img.loading = 'lazy';
      });
      batch.appendChild(li);
      added.push(li);
    });
    target.insertBefore(batch, before && before.parentNode === target ? before : null);
    if (added.length) document.dispatchEvent(new CustomEvent('pm:grid:append', { detail: { items: added } }));
    return added.length;
  };

  const setNext = (next) => {
    const btn = button();
    if (!btn) return;
    if (next) {
      btn.dataset.nextUrl = next;
      return;
    }
    btn.remove();
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.remove();
  };

  const rearm = () => {
    if (!io) return;
    io.disconnect();
    const btn = button();
    if (btn) io.observe(btn);
  };

  const loadNext = () => {
    if (inflight) return inflight;
    const btn = button();
    const url = btn && btn.dataset.nextUrl;
    const target = grid();
    if (!url || !target) return Promise.resolve(0);
    const myGen = gen;
    let advanced = false;
    showIndicator(true);
    inflight = fetchPage(pageUrl(url), ctrl.signal)
      .then(({ items, next }) => {
        if (myGen !== gen || grid() !== target) return 0;
        advanced = next !== url;
        const added = append(items, target);
        setNext(next);
        return added;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Collection grid: could not load more products', error);
        return 0;
      })
      .finally(() => {
        if (myGen === gen) inflight = null;
        showIndicator(false);
        // Re-observing fires at once while the button is in view, so only after a page that moved
        // on: a failing page waits for the next scroll instead of retrying in a loop.
        if (advanced) rearm();
      });
    return inflight;
  };

  const loadMore = () => (allPromise ? allPromise.then(() => 0) : loadNext());

  const nextUrl = () => {
    const btn = button();
    return (btn && btn.dataset.nextUrl) || '';
  };
  const loadSequential = (myGen) => {
    const before = nextUrl();
    return loadNext().then(() => {
      const after = nextUrl();
      return myGen === gen && after && after !== before ? loadSequential(myGen) : undefined;
    });
  };

  // Pages 1 to N-1 of a ?page=N link, put in front of the first card in page order.
  const loadHead = (myGen) => {
    const target = grid();
    const first = firstPage();
    if (headDone || first <= 1 || !target) return Promise.resolve();
    const anchor = target.firstElementChild;
    const pages = [];
    for (let page = 1; page < first; page += 1) pages.push(page);
    return Promise.all(pages.map((page) => fetchPage(pageUrl(location.href, page), ctrl.signal))).then((results) => {
      if (myGen !== gen || grid() !== target) return;
      results.forEach((result) => append(result.items, target, anchor));
      headDone = true;
    });
  };

  const loadAll = () => {
    if (allPromise) return allPromise;
    const myGen = gen;
    allPromise = Promise.resolve(inflight)
      .then(() => {
        showIndicator(true);
        return Promise.all([loadHead(myGen), loadTail(myGen)]);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Collection grid: could not load every page', error);
      })
      .then(() => {
        if (myGen !== gen) return;
        allPromise = null;
        showIndicator(false);
        rearm();
        document.dispatchEvent(new CustomEvent('pm:grid:complete'));
      });
    return allPromise;
  };

  const loadTail = (myGen) =>
    Promise.resolve()
      .then(() => {
        const btn = button();
        const url = btn && btn.dataset.nextUrl;
        const target = grid();
        if (myGen !== gen || !url || !target) return undefined;
        const start = Number(new URL(url, location.origin).searchParams.get('page')) || 0;
        const last = Number(btn.dataset.pmPages) || 0;
        // The section id renders the template's own page size, so page numbers line up.
        if (!start || last < start) return loadSequential(myGen);

        const pages = [];
        for (let page = start; page <= last; page += 1) pages.push(page);
        const ready = new Map();
        let cursor = 0;
        let nextPage = start;
        let failed = false;
        const flush = () => {
          while (ready.has(nextPage)) {
            const result = ready.get(nextPage);
            ready.delete(nextPage);
            if (myGen !== gen || grid() !== target) return;
            append(result.items, target);
            setNext(result.next);
            nextPage += 1;
          }
        };
        const attempt = (page, retries) =>
          fetchPage(pageUrl(url, page), ctrl.signal).catch((error) => {
            if (retries > 0 && error.name !== 'AbortError') return attempt(page, retries - 1);
            throw error;
          });
        // A page that fails twice stops the run; #load-more-btn still points at it, so scrolling
        // picks up from there.
        const worker = () => {
          if (failed || myGen !== gen || cursor >= pages.length) return undefined;
          const page = pages[cursor];
          cursor += 1;
          return attempt(page, 1).then(
            (result) => {
              ready.set(page, result);
              flush();
              return worker();
            },
            (error) => {
              failed = true;
              throw error;
            }
          );
        };
        return Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker)).then(() =>
          myGen === gen && !failed && nextUrl() ? loadSequential(myGen) : undefined
        );
      });

  // facets.js replaces the container's children on every filter and sort.
  const onReplace = () => {
    gen += 1;
    ctrl.abort();
    ctrl = new AbortController();
    inflight = null;
    allPromise = null;
    rebuildSeen();
    rearm();
    document.dispatchEvent(new CustomEvent('pm:grid:replace'));
  };

  // Sections under the grid (guarantee, FAQ) mean a fast scroll can jump past the sentinel without
  // it ever intersecting, so the next page also loads once the sentinel is above the viewport.
  const PRELOAD = 1500;
  let scrollTick = false;
  const onScroll = () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const btn = button();
      if (btn && btn.dataset.nextUrl && btn.getBoundingClientRect().top < window.innerHeight + PRELOAD) loadMore();
    });
  };

  const attach = () => {
    rebuildSeen();
    if (!io && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      }, { rootMargin: `0px 0px ${PRELOAD}px 0px` });
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    rearm();
    if (containerObserver) containerObserver.disconnect();
    const container = document.getElementById('ProductGridContainer');
    if (container && 'MutationObserver' in window) {
      containerObserver = new MutationObserver(onReplace);
      containerObserver.observe(container, { childList: true });
    }
  };

  window.pmCollectionGrid = { loadMore, loadAll, isComplete, isLoading: () => !!(inflight || allPromise) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  // Theme editor re-renders the section with a new container.
  document.addEventListener('shopify:section:load', () => {
    onReplace();
    attach();
  });
})();
