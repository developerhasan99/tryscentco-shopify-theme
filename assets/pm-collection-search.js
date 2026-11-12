/**
 * Collection toolbar (sections/main-collection-product-grid.liquid): loaded once by the section
 * when the pill toolbar or the search bar is on.
 *
 * 1. Pill dropdowns (snippets/facets.liquid, filter_type 'pills'): native <details>, one open at a
 *    time, closed by a click outside, Escape (wherever focus is), picking a sort option or scrolling
 *    the pill under the sticky header (an open toolbar is level with the header); a
 *    panel that would run past the right edge of the window opens leftwards (class
 *    pm-facets__pill--end, from 750px; below that the panel is a full-width sheet under the row).
 *    Filtering and sorting themselves stay with Dawn's facets.js.
 *
 * 2. Search (snippets/pm-collection-search.liquid), port of magyx.co assets/collection-search.js
 *    (mgx-* renamed to pm-*): filters the product grid by scent name, number, brand, inspiration,
 *    scent family, season, occasion and tags. Each product <li> carries data-pm-hay
 *    ("title | inspiration | family | season | wearing season | occasion"), data-pm-tags ("tag|tag") and
 *    data-pm-ref (the product handle, for its reference number). The first use loads every
 *    remaining page (window.pmCollectionGrid.loadAll from assets/pm-collection-grid-loader.js),
 *    so the whole collection is searched, and the query is re-applied after every page load and
 *    after Dawn's filters or sort replace the grid.
 */
(() => {
  if (window.pmCollectionToolbar) return;
  window.pmCollectionToolbar = true;

  /* ---------- 1. Pill dropdowns ---------- */
  const PILL = '.pm-facets__pill';
  const wide = window.matchMedia('(min-width: 750px)');

  const place = (details) => {
    details.classList.remove('pm-facets__pill--end');
    if (!wide.matches) return;
    const panel = details.querySelector('.pm-facets__panel');
    if (!panel) return;
    const edge = document.documentElement.clientWidth - 8;
    if (panel.getBoundingClientRect().right > edge) details.classList.add('pm-facets__pill--end');
  };

  // toggle does not bubble: listen in the capture phase.
  document.addEventListener(
    'toggle',
    (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.matches(PILL)) return;
      const summary = details.querySelector(':scope > summary');
      if (summary) summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      if (!details.open) {
        details.classList.remove('pm-facets__pill--end');
        return;
      }
      document.querySelectorAll(`${PILL}[open]`).forEach((other) => {
        if (other !== details) other.open = false;
      });
      place(details);
    },
    true
  );

  // A click outside the open pill closes it; a click on another pill closes this one first, then
  // the browser opens the other.
  document.addEventListener('click', (event) => {
    document.querySelectorAll(`${PILL}[open]`).forEach((details) => {
      if (!details.contains(event.target)) details.open = false;
    });
  });

  // Picking a sort option closes the dropdown; facets.js re-renders the grid.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio' || input.name !== 'sort_by') return;
    const details = input.closest(PILL);
    if (details) details.open = false;
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll(`${PILL}[open]`).forEach(place);
  });

  // Escape closes the open pill wherever focus is (a click on the panel's padding moves focus to
  // <main>, and Safari never focuses a clicked <summary>). Focus goes back to the pill's summary
  // unless the shopper is typing in a field outside it (the search box).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll(`${PILL}[open]`).forEach((details) => {
      const focus = document.activeElement;
      const typing =
        focus && !details.contains(focus) && focus.matches('input, textarea, select, [contenteditable="true"]');
      details.open = false;
      const summary = details.querySelector(':scope > summary');
      if (!typing && summary) summary.focus({ preventScroll: true });
    });
  });

  // While a pill is open the toolbar sits one layer up (assets/pm-collection.css) so its panel covers
  // the card badges, which also puts it level with the sticky header. Once the page scrolls the
  // toolbar's top (its padding takes clicks too) under the header, close the pill, so the toolbar
  // never paints over the header or catches its clicks.
  const headerLimit = () => {
    const header = document.querySelector('.section-header');
    if (!header) return 0;
    const bottom = header.getBoundingClientRect().bottom;
    // A sticky header in view (or sliding back into view) ends at its own height from the top.
    const sticky =
      header.classList.contains('shopify-section-header-sticky') &&
      !header.classList.contains('shopify-section-header-hidden');
    return sticky ? Math.max(bottom, header.offsetHeight) : Math.max(0, bottom);
  };
  let scrollQueued = false;
  window.addEventListener(
    'scroll',
    () => {
      if (scrollQueued || !document.querySelector(`${PILL}[open]`)) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        const limit = headerLimit();
        document.querySelectorAll(`${PILL}[open]`).forEach((details) => {
          const box = details.closest('.pm-ctoolbar') || details;
          if (box.getBoundingClientRect().top < limit) details.open = false;
        });
      });
    },
    { passive: true }
  );

  /* ---------- 2. Search ---------- */
  const DEBOUNCE_MS = 120;
  // "prefix:value" tags contribute their value (marke:tom-ford -> "tom ford", note:tonka-bean ->
  // "tonka bean"), except these prefixes. tryscent.eu: season, occasion and character tags are German
  // category words a Polish shopper does not type.
  const SKIP_PREFIXES = ['gender', 'saison', 'anlass', 'charakter', 'scent'];
  // Plain tags that say nothing a shopper would type, folded (tryscent.eu tag set: German / Polish
  // gender, season and occasion tags included).
  const SKIP_TAGS = new Set([
    'men', 'women', 'unisex', 'for men', 'for women', 'fuer maenner', 'fuer frauen', 'fur manner',
    'fur frauen', 'manner', 'frauen', 'dla kobiet', 'dla mezczyzn', 'mezczyzni', 'dfw active', 'en',
    'new', 'new arrival', 'bundle', 'bundle price show', 'giftbox ghost product', 'hide bundle',
    'usa test', 'bundle test', 'man', 'kvinna', 'herr', 'dam', 'mystery box', 'hidden', 'onsale', '25 edp', 'bestseller',
    'local image', 'herbst winter', 'fruhling sommer', 'ganzjahrig', 'jesien zima',
    'besonderer anlass', 'alltag', 'casual', 'specjalna okazja',
  ]);
  const SKIP_TAG_RES = [/^test [a-z] \d+$/, /^tier [a-z0-9]+$/];
  // Names shoppers use for the same house or note. When one phrase is in a product's text, the
  // others are added too. Folded, whole phrases.
  const SYNONYMS = [
    ['jean paul gaultier', 'jpgaultier', 'jp gaultier', 'jpg', 'gaultier'],
    ['yves saint laurent', 'ysl', 'saint laurent'],
    ['maison francis kurkdjian', 'mfk', 'kurkdjian'],
    ['dolce gabbana', 'dolce and gabbana', 'dg', 'd g'],
    ['louis vuitton', 'lv'],
    ['thierry mugler', 'mugler'],
    ['paco rabanne', 'rabanne'],
    ['giorgio armani', 'emporio armani', 'armani'],
    ['hugo boss', 'boss'],
    ['christian dior', 'dior'],
    ['bvlgari', 'bulgari'],
    ['calvin klein', 'ck'],
    ['viktor rolf', 'viktor and rolf', 'viktor'],
    ['by kilian', 'kilian'],
    ['escentric molecules', 'molecules'],
    ['carolina herrera', 'herrera'],
    ['tom ford', 'tomford'],
    ['vanilla', 'vanille', 'wanilia', 'vanilj'],
  ];

  const fold = (value) => {
    let text = String(value == null ? '' : value).toLowerCase();
    try {
      text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {}
    return text
      .replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/ø/g, 'o')
      .replace(/ł/g, 'l')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };

  const tagWords = (raw) =>
    String(raw || '')
      .split('|')
      .map((tag) => {
        const colon = tag.indexOf(':');
        if (colon > -1) {
          const prefix = fold(tag.slice(0, colon));
          if (SKIP_PREFIXES.includes(prefix)) return '';
          return tag.slice(colon + 1);
        }
        const folded = fold(tag);
        return SKIP_TAGS.has(folded) || SKIP_TAG_RES.some((re) => re.test(folded)) ? '' : tag;
      })
      .join(' ');

  // Every number in the title, without and with leading zeros: "034" -> 34, 034; "219M" -> 219.
  // Reference numbers (5+ digits, in the title or the handle) also give the bottle number, their
  // last three digits: "Ref. 120436" -> 120436, 436; handle "...-100007" -> 100007, 7, 007.
  const numberWords = (foldedTitle, foldedRef) => {
    const words = [];
    const add = (digits) => {
      const bare = digits.replace(/^0+(?=\d)/, '');
      words.push(bare, bare.padStart(3, '0'));
    };
    (foldedTitle.match(/\d+/g) || []).forEach(add);
    `${foldedTitle} ${foldedRef}`.split(' ').forEach((word) => {
      if (!/^\d{5,}$/.test(word)) return;
      add(word);
      add(word.slice(-3));
    });
    return words;
  };

  const cache = new WeakMap();
  const hayFor = (li) => {
    const cached = cache.get(li);
    if (cached) return cached;
    const [title = '', ...rest] = (li.dataset.pmHay || '').split(' | ');
    const foldedTitle = fold(title);
    const words = numberWords(foldedTitle, fold(li.dataset.pmRef));
    let hay = ` ${fold([title, rest.join(' '), tagWords(li.dataset.pmTags)].join(' '))} ${words.join(' ')} `;
    SYNONYMS.forEach((group) => {
      if (group.some((phrase) => hay.includes(` ${phrase} `))) hay += `${group.join(' ')} `;
    });
    const entry = { hay, compact: hay.replace(/ /g, '') };
    cache.set(li, entry);
    return entry;
  };

  const parseQuery = (raw) => {
    const folded = fold(raw);
    const terms = folded ? folded.split(' ').map((term) => (/^\d+$/.test(term) ? term.replace(/^0+(?=\d)/, '') : term)) : [];
    return { terms, compact: folded.replace(/ /g, '') };
  };

  // Numbers match a whole word ("21" is not "219m"); words up to 3 letters match the start of a
  // word, so "di" already finds "dior" while typing and "man" skips "gourmand"; longer terms match
  // anywhere.
  const termHit = (hay, term) => {
    if (/^\d+$/.test(term)) return hay.includes(` ${term} `);
    if (term.length <= 3) return hay.includes(` ${term}`);
    return hay.includes(term);
  };

  const matches = (li, query) => {
    const { hay, compact } = hayFor(li);
    // Fallback for words typed together ("tomford", "no247"); from 4 characters, so "man" stays a
    // word start and doesn't hit "gourmand".
    return query.terms.every((term) => termHit(hay, term)) || (query.compact.length >= 4 && compact.includes(query.compact));
  };

  const fill = (template, values) =>
    String(template || '').replace(/\[(count|query)\]/g, (_, key) => values[key]);

  const init = (root) => {
    if (root.dataset.pmReady) return;
    root.dataset.pmReady = '1';
    const input = root.querySelector('.pm-csearch__input');
    const clear = root.querySelector('.pm-csearch__clear');
    const status = root.querySelector('.pm-csearch__status');
    const field = root.querySelector('.pm-csearch__field');
    // "N products" under the search (pill toolbar only) would contradict a search result line.
    const toolbar = root.closest('.pm-ctoolbar');
    const total = toolbar ? toolbar.querySelector('.pm-ctoolbar__count') : null;
    if (!input || !status) return;
    const text = root.dataset;
    let query = parseQuery('');
    let raw = '';
    let timer = null;

    const loader = () => window.pmCollectionGrid;
    const complete = () => {
      const grid = loader();
      return !grid || grid.isComplete() || !grid.isLoading();
    };

    let statusKey = '';
    const setStatus = (key, build) => {
      if (key === statusKey) return;
      statusKey = key;
      status.textContent = '';
      if (build) build();
    };
    const renderStatus = (count, grid) => {
      const loading = query.terms.length > 0 && !complete();
      if (grid) {
        if (loading) grid.setAttribute('aria-busy', 'true');
        else grid.removeAttribute('aria-busy');
      }
      if (!query.terms.length) return setStatus('', null);
      const shown = raw.trim();
      if (loading) return setStatus('loading', () => status.append(text.loadingText || ''));
      if (count === 0) {
        return setStatus(`empty:${shown}`, () => {
          status.append(fill(text.emptyText, { query: shown }), ' ');
          const reset = document.createElement('button');
          reset.type = 'button';
          reset.className = 'pm-csearch__reset';
          reset.textContent = text.clearLabel || 'Wyczyść wyszukiwanie';
          reset.addEventListener('click', () => {
            setQuery('');
            input.focus();
          });
          status.append(reset);
        });
      }
      const line = fill(count === 1 ? text.resultText : text.resultsText, { count, query: shown });
      return setStatus(line, () => status.append(line));
    };

    const apply = () => {
      const grid = document.getElementById('product-grid');
      if (!grid || grid.tagName !== 'UL') {
        setStatus('', null);
        return;
      }
      const active = query.terms.length > 0;
      if (total) total.hidden = active;
      let count = 0;
      [...grid.children].forEach((li) => {
        if (!li.classList.contains('grid__item')) return;
        const isProduct = !!li.dataset.pmPid;
        const hide = active && (!isProduct || !matches(li, query));
        if (hide) {
          li.hidden = true;
          li.dataset.pmCsHidden = '';
        } else if ('pmCsHidden' in li.dataset) {
          li.hidden = false;
          delete li.dataset.pmCsHidden;
        }
        if (active && isProduct && !hide) count += 1;
      });
      renderStatus(count, grid);
    };

    const loadAll = () => {
      const grid = loader();
      if (grid && !grid.isComplete()) grid.loadAll().then(apply);
    };

    function setQuery(value) {
      clearTimeout(timer);
      raw = value;
      if (input.value !== value) input.value = value;
      query = parseQuery(value);
      if (clear) clear.hidden = !value;
      if (query.terms.length) loadAll();
      apply();
    }

    input.addEventListener('input', () => {
      if (clear) clear.hidden = !input.value;
      clearTimeout(timer);
      timer = setTimeout(() => setQuery(input.value), DEBOUNCE_MS);
    });
    // Start loading the rest of the collection as soon as the shopper is about to type.
    input.addEventListener('focus', loadAll, { once: true });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        setQuery('');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setQuery(input.value);
        input.blur();
      }
    });
    if (clear) {
      clear.addEventListener('click', () => {
        setQuery('');
        input.focus();
      });
    }
    if (field) {
      field.addEventListener('click', (event) => {
        if (event.target === field) input.focus();
      });
    }
    // Page-level listeners stop with this bar: the theme editor re-renders the section.
    const listeners = new AbortController();
    const live = (handler) => (...args) => (root.isConnected ? handler(...args) : listeners.abort());
    const opts = { signal: listeners.signal };
    document.addEventListener('pm:grid:append', live(apply), opts);
    document.addEventListener('pm:grid:complete', live(apply), opts);
    document.addEventListener(
      'pm:grid:replace',
      live(() => {
        if (query.terms.length) loadAll();
        apply();
      }),
      opts
    );
    // Back/forward cache or browser autofill can leave text in the box.
    window.addEventListener(
      'pageshow',
      live(() => {
        if (input.value !== raw) setQuery(input.value);
      }),
      opts
    );
    if (input.value) setQuery(input.value);
  };

  const start = () => document.querySelectorAll('[data-pm-csearch]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('shopify:section:load', start);

  window.pmCollectionSearch = {
    fold,
    parseQuery,
    // QA: does a product with this title, tags and handle match the query?
    matchText: (title, tags, raw, handle) => {
      const li = document.createElement('li');
      li.dataset.pmHay = `${title} | `;
      li.dataset.pmTags = Array.isArray(tags) ? tags.join('|') : tags || '';
      li.dataset.pmRef = handle || '';
      return matches(li, parseQuery(raw));
    },
  };
})();
