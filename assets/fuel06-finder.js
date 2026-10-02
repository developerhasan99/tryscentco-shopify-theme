/* FUEL_06 Search & Compare designer fragrance finder.

   One custom element, no libraries, in the style of the theme's own assets.
   It holds the states drawn in Figma: the search state (empty, and with the
   typeahead over it once somebody types), loading, result and added-to-bag,
   plus a no-result state that the design does not draw and whose wording
   therefore comes from a setting.

   Everything is hidden by assets/fuel06-finder.css until the test is revealed,
   so this file can run on every homepage load without changing a single pixel.

   Nothing here touches Searchanise or the native /search. The finder matches
   what a shopper types against its own feed (templates/collection.fuel06-index
   .liquid), which is keyed on the designer fragrance name each perfume is
   inspired by. That field is a direct 1:1 lookup, so "Dior Sauvage" resolves
   without guesswork, and neither live search system is modified or competed
   with.

   Every price, saving and percentage comes from that feed, which builds them
   with the theme's money filter in the market the request came in on. This
   file does no currency maths and carries no amounts.

   Remove this file with the FUEL_06 cleanup. */

(() => {
  if (window.fuel06FinderReady) return;
  window.fuel06FinderReady = true;

  // QA and preview reveal, the same shape as fuel03 and fuel05. On any theme
  // that is not the live one, #f06 in the address turns the test on so it can
  // be checked without running Intelligems. Shopify.theme.role is 'main' on
  // the live theme, so this can never fire there. The hash is read again on
  // every hashchange, because typing #f06 into the bar of a page that is
  // already open never reloads it.
  // The switch only ever adds the class on #f06 and removes it on #f06-off. It
  // must not toggle on every other address, because the testing tool's preview
  // puts the same class on the page without any hash, and a toggle would take
  // that straight back off on any theme that is not the live one.
  if (window.Shopify && Shopify.theme && Shopify.theme.role !== 'main') {
    const applyHashReveal = () => {
      if (window.location.hash === '#f06') document.documentElement.classList.add('ab-f06-finder');
      else if (window.location.hash === '#f06-off') document.documentElement.classList.remove('ab-f06-finder');
    };

    applyHashReveal();
    window.addEventListener('hashchange', applyHashReveal);
  }

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  // The design draws exactly two widths. Everything that differs between them
  // reads this, so the counts and the layout never disagree.
  const NARROW = '(max-width: 749px)';

  // Diacritics are stripped on both sides, so "Hermes" finds "Hermès" and a
  // shopper does not have to be exact about accents.
  const normalise = (value) =>
    (value || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const tokens = (value) => normalise(value).split(' ').filter(Boolean);

  const escapeHtml = (value) =>
    (value || value === 0 ? value : '')
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const ICON_SEARCH =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.5"/><path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const ICON_CLOCK =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8L10.25 9.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  // The 12x12 stroked glyph the frame puts at the end of every suggestion row:
  // the arrow that lifts the suggestion into the field.
  const ICON_GO =
    '<svg class="fuel06-finder__row-go" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M9.5 9.5L2.5 2.5M2.5 2.5H7.5M2.5 2.5V7.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>';
  const ICON_X =
    '<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const ICON_STAR =
    '<svg viewBox="0 0 13 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M6.5 0L8.28 3.94L12.5 4.44L9.37 7.32L10.22 11.5L6.5 9.42L2.78 11.5L3.63 7.32L0.5 4.44L4.72 3.94L6.5 0Z"/></svg>';
  const ICON_PLUS =
    '<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  class Fuel06Finder extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;

      this.entry = this.querySelector('[data-f06-entry]');
      this.modal = this.querySelector('[data-f06-modal]');
      if (!this.modal) return;

      this.dialog = this.modal.querySelector('[data-f06-dialog]');
      this.input = this.modal.querySelector('[data-f06-input]');
      this.body = this.modal.querySelector('.fuel06-finder__body');
      this.states = {};
      this.modal.querySelectorAll('[data-f06-state]').forEach((node) => {
        this.states[node.dataset.f06State] = node;
      });

      // The strings arrive twice: as data attributes, and as text in the
      // hidden copy block. The text wins, because the store's translation app
      // translates text on the page and leaves data attributes in Swedish.
      this.copy = Object.assign({}, this.dataset);
      this.querySelectorAll('[data-f06-copy-key]').forEach((node) => {
        const text = node.textContent.trim();
        if (text) this.copy[node.dataset.f06CopyKey] = text;
      });
      this.index = null;
      this.indexPromise = null;
      this.recent = this.readRecent();
      this.lastQuery = '';
      this.debounce = 0;
      this.opener = null;
      this.isOpen = false;
      this.suppressOpen = false;
      this.ready = true;

      // The band sits below the fold on the homepage, so nothing binds until
      // it is near the viewport. Nothing is fetched here either: the feed is
      // only pulled on the first open.
      if ('IntersectionObserver' in window && this.entry) {
        const observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            this.bindHandlers();
          },
          { rootMargin: '200px' }
        );
        observer.observe(this.entry);
      } else {
        this.bindHandlers();
      }
    }

    el(name) {
      return this.querySelector(`[data-f06-${name}]`);
    }

    narrow() {
      return window.matchMedia(NARROW).matches;
    }

    bindHandlers() {
      if (this.handlersBound) return;
      this.handlersBound = true;

      this.querySelectorAll('[data-f06-open]').forEach((node) => {
        node.addEventListener('click', (event) => {
          event.preventDefault();
          this.open(node, this.entryValue());
        });
        // The band's own input is a doorway, not a real field: focusing it
        // opens the modal and hands the typing over to the modal's input. A
        // tap fires focus and then click, so open() runs twice and has to be
        // idempotent; the guard inside it is what keeps the second call from
        // capturing the scroll lock the first one just applied.
        if (node.tagName === 'INPUT') {
          node.addEventListener('focus', () => {
            if (this.suppressOpen) return;
            this.open(node, this.entryValue());
          });
        }
      });

      // Product page entry (snippets/fuel06-pdp-link.liquid). It sits under the
      // buy button, outside this element, and ships with the hidden attribute
      // so a template that carries no dialog never shows a dead link. Only this
      // code, which runs when the dialog is on the page, makes it visible; the
      // stylesheet still keeps it off until the test class arrives.
      document.querySelectorAll('[data-f06-open-external]').forEach((node) => {
        node.hidden = false;
        node.addEventListener('click', (event) => {
          event.preventDefault();
          this.open(node, '');
        });
      });

      this.modal.querySelectorAll('[data-f06-close]').forEach((node) => {
        node.addEventListener('click', () => this.close());
      });

      this.modal.addEventListener('keydown', (event) => this.onKeydown(event));

      this.input.addEventListener('input', () => {
        this.syncQueryClass();
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.onType(), 150);
      });

      this.input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        clearTimeout(this.debounce);
        this.search(this.input.value);
      });

      const clearInput = this.el('clear-input');
      if (clearInput) {
        clearInput.addEventListener('click', () => {
          this.input.value = '';
          this.syncQueryClass();
          this.renderTypeahead('');
          this.input.focus();
        });
      }

      const clearRecent = this.el('clear-recent');
      if (clearRecent) {
        clearRecent.addEventListener('click', () => {
          this.recent = [];
          this.writeRecent();
          this.renderTypeahead(this.input.value.trim());
        });
      }

      // Everything below the search field is rebuilt on every search, so its
      // controls are handled by delegation rather than rebound each time.
      this.modal.addEventListener('click', (event) => {
        const forget = event.target.closest('[data-f06-forget]');
        if (forget) {
          event.preventDefault();
          this.forgetRecent(forget.dataset.f06Forget);
          return;
        }

        const pick = event.target.closest('[data-f06-pick]');
        if (pick) {
          this.input.value = pick.dataset.f06Pick;
          this.syncQueryClass();
          this.search(pick.dataset.f06Pick);
          return;
        }

        const again = event.target.closest('[data-f06-again]');
        if (again) {
          event.preventDefault();
          this.resetSearch();
          return;
        }

        const add = event.target.closest('[data-f06-add]');
        if (add) {
          event.preventDefault();
          this.addToCart(add);
        }
      });
    }

    entryValue() {
      const field = this.querySelector('[data-f06-entry-input]');
      return field ? field.value : '';
    }

    syncQueryClass() {
      this.classList.toggle('fuel06-finder--has-query', this.input.value.trim() !== '');
    }

    /* ------------------------------------------------------------ open/close */

    // Idempotent on purpose. A tap on the band's input fires focus and then
    // click, both of which open the finder, and the body's own overflow has to
    // be read exactly once or the second read captures the 'hidden' the first
    // call just wrote and close() restores a locked page.
    open(opener, seed) {
      if (this.isOpen) return;
      this.isOpen = true;
      this.opener = opener;

      this.modal.classList.add('is-open');
      this.modal.removeAttribute('aria-hidden');

      this.prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      this.show('search');
      this.loadIndex();

      // The loading frame's looping GIF is lazy so that the control arm and
      // every product page never fetch it. Once the finder is open the shopper
      // is a few seconds away from picking a scent, which is what the download
      // needs on an ordinary line, so it starts now instead of at the pick,
      // when a two second hold was too short and the frame showed an empty box.
      const loadingImg = this.modal.querySelector('.fuel06-finder__loading-img');
      if (loadingImg && loadingImg.loading === 'lazy') loadingImg.loading = 'eager';

      const clean = (seed || '').trim();
      if (clean) {
        this.input.value = clean;
        this.syncQueryClass();
        this.search(clean);
      }
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;

      this.modal.classList.remove('is-open');
      this.modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = this.prevOverflow || '';
      this.prevOverflow = '';

      // The band's field is a doorway that seeds the finder on open, so a
      // query left in it would re-run the whole search the next time the
      // shopper touches it. Clearing it here is what makes every reopen land
      // on the empty search state the frames draw.
      const entryInput = this.querySelector('[data-f06-entry-input]');
      if (entryInput) entryInput.value = '';

      const opener = this.opener;
      this.opener = null;
      if (opener && typeof opener.focus === 'function') {
        // Focus goes back to the control that opened the finder, which on the
        // band is the input that opens the finder on focus. The flag is set
        // for that one synchronous call and cleared on the next tick, so the
        // shopper's next real focus on the field still opens the dialog.
        this.suppressOpen = true;
        opener.focus({ preventScroll: true });
        setTimeout(() => {
          this.suppressOpen = false;
        }, 0);
      }
    }

    // "Search again" and "Keep exploring" both go back to the drawn state 1,
    // which is the empty one: the query leaves the field, the has-query class
    // goes with it so the typeahead and the filled field treatment drop away,
    // and the chips and the how-it-works card come back.
    resetSearch() {
      clearTimeout(this.debounce);
      this.lastQuery = '';
      this.input.value = '';
      this.syncQueryClass();
      this.renderTypeahead('');
      this.clearErrors();
      this.show('search');
    }

    onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = Array.from(this.dialog.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Focus follows the state: back on the field whenever the field is on
    // screen, otherwise on the dialog itself, so a keyboard never ends up
    // parked on an element the shopper cannot see. The dialog also carries the
    // state name, because the frames paint the shell a different colour on the
    // loading, result and added states.
    show(name) {
      Object.keys(this.states).forEach((key) => {
        this.states[key].hidden = key !== name;
      });

      if (this.dialog) this.dialog.dataset.f06Active = name;
      if (this.body) this.body.scrollTop = 0;

      if (name === 'search') {
        this.input.focus({ preventScroll: true });
      } else if (this.dialog) {
        this.dialog.focus({ preventScroll: true });
      }
    }

    /* ----------------------------------------------------------------- index */

    loadIndex() {
      if (this.indexPromise) return this.indexPromise;

      // No Accept header, and deliberately not response.json(). Asking Shopify
      // for JSON on a collection URL makes it answer with its own built-in
      // collection payload instead of rendering
      // templates/collection.fuel06-index.liquid, and that payload carries no
      // products key of ours, so the index came back empty every time and no
      // search could ever succeed. The template body IS the JSON, so it is
      // read as text and parsed here, where a parse failure is caught.
      this.indexPromise = fetch(this.dataset.f06Index)
        .then((response) => {
          if (!response.ok) throw new Error(`feed ${response.status}`);
          return response.text();
        })
        .then((body) => {
          let data;
          try {
            data = JSON.parse(body);
          } catch (error) {
            throw new Error('feed did not parse as JSON');
          }

          this.index = Array.isArray(data.products) ? data.products : [];
          if (Number(data.pages) > 1) {
            // paginate caps at 250 and the feed only renders page one. The
            // test is the page count the template itself reports, not the
            // catalogue size: all_products_count undercounts this collection
            // and was hiding a real overflow. Loud on purpose, because a
            // silently half-loaded catalogue would look like a working finder
            // that simply never finds half the range.
            console.warn(
              `[fuel06] the feed carries ${data.returned} entries out of a collection holding ${data.total} products: paginate caps at ${data.page_size} and only page 1 of ${data.pages} is rendered. Split the feed before launch.`
            );
          }
          this.index.forEach((product) => {
            product._i = normalise(product.inspired);
            product._t = normalise(product.title);
            product._s = normalise([product.family].concat(product.scents || []).join(' '));
          });
          return this.index;
        })
        .catch((error) => {
          console.warn('[fuel06] could not load the feed', error);
          this.index = [];
          return this.index;
        });

      return this.indexPromise;
    }

    /* --------------------------------------------------------------- matching */

    score(product, query, queryTokens) {
      if (product._i === query) return 100;
      if (product._i.startsWith(query)) return 80;
      if (product._i.includes(query)) return 60;
      if (queryTokens.length && queryTokens.every((token) => product._i.includes(token))) return 55;
      if (product._t.startsWith(query)) return 45;
      if (product._t.includes(query)) return 40;
      if (queryTokens.length && queryTokens.every((token) => product._t.includes(token))) return 35;
      // Shoppers type the street name, the feed holds the catalogue name:
      // "Bleu de Chanel" vs "Chanel Bleu", "Creed Aventus" vs "Aventus",
      // "JPG Le Male" vs "Jean Paul Gaultier Le Male". When no product matches
      // a multi-word query in full, enough of its words matching word-starts
      // still counts, ranked under every full match. A two-word query accepts
      // one hit so a dropped brand still lands; longer queries need two.
      if (queryTokens.length >= 2) {
        const words = product._i.split(' ');
        const hits = queryTokens.filter((token) => words.some((word) => word.startsWith(token))).length;
        if (hits >= 2 || (hits === 1 && queryTokens.length === 2)) return 25 + hits;
      }
      // Korana asked in Figma for scent words to work too. This is the tail of
      // that: "woody" or "fresh" lands on the perfumes carrying it, ranked
      // below every real designer-name hit. What the result state should show
      // for a scent word is not drawn anywhere, so this needs confirming.
      if (queryTokens.length && queryTokens.every((token) => product._s.includes(token))) return 20;
      return 0;
    }

    rank(query) {
      const needle = normalise(query);
      if (!needle || !this.index) return [];
      const queryTokens = tokens(query);

      return this.index
        .map((product) => ({ product, score: this.score(product, needle, queryTokens) }))
        .filter((hit) => hit.score > 0)
        // On level scores the base fragrance outranks its flankers - the
        // shortest designer name first, the saving after. Tying on the saving
        // alone buried "Dior Sauvage" under five of its own stablemates.
        .sort(
          (a, b) =>
            b.score - a.score ||
            (a.product.inspired || '').length - (b.product.inspired || '').length ||
            (b.product.save_pct || 0) - (a.product.save_pct || 0)
        )
        .map((hit) => hit.product);
    }

    similarTo(match, limit) {
      if (!this.index) return [];
      const family = normalise(match.family);
      const scents = (match.scents || []).map(normalise).filter(Boolean);

      return this.index
        .filter((product) => product.handle !== match.handle && product.available)
        .map((product) => {
          let overlap = 0;
          if (family && normalise(product.family) === family) overlap += 2;
          (product.scents || []).forEach((scent) => {
            if (scents.includes(normalise(scent))) overlap += 1;
          });
          return { product, overlap };
        })
        .filter((hit) => hit.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap || (b.product.save_pct || 0) - (a.product.save_pct || 0))
        .slice(0, limit)
        .map((hit) => hit.product);
    }

    /* ----------------------------------------------------------- interactions */

    onType() {
      const query = this.input.value.trim();
      if (!query) {
        this.renderTypeahead('');
        return;
      }

      this.loadIndex().then(() => {
        if (this.input.value.trim() !== query) return;
        this.renderTypeahead(query);
      });
    }

    search(query) {
      const clean = (query || '').trim();
      if (!clean) return;

      this.lastQuery = clean;
      this.clearErrors();
      this.show('loading');
      // The loading frame (154:144) carries its own copy and motion, but once
      // the index is cached the lookup resolves the same tick and the state
      // never paints. Hold it long enough to be read.
      const shownAt = Date.now();

      this.loadIndex().then(() => {
        if (this.lastQuery !== clean) return;
        const hits = this.rank(clean);
        const reveal = () => {
          if (this.lastQuery !== clean) return;
          if (!hits.length) {
            this.el('empty-query').textContent = clean;
            this.show('noresult');
            return;
          }
          this.rememberRecent(clean);
          this.renderResult(hits[0]);
          this.show('result');
        };
        const wait = Math.max(0, 2000 - (Date.now() - shownAt));
        // If the loop has not painted its first frame by then, give the
        // download a little longer, capped so a dead line still gets a result.
        const media = this.modal.querySelector('.fuel06-finder__loading-img');
        const revealWhenPainted = () => {
          if (!media || media.complete || media.naturalWidth > 0) return reveal();
          let done = false;
          const go = () => {
            if (done) return;
            done = true;
            media.removeEventListener('load', go);
            media.removeEventListener('error', go);
            reveal();
          };
          media.addEventListener('load', go);
          media.addEventListener('error', go);
          setTimeout(go, 1500);
        };
        setTimeout(revealWhenPainted, wait);
      });
    }

    /* -------------------------------------------------------------- rendering */

    // Rating counts are grouped the way the storefront's own locale groups
    // them, so 5432 prints as the frame draws it and the noun beside it is a
    // setting rather than an English word baked into the script.
    formatCount(value) {
      const count = Number(value);
      if (!Number.isFinite(count)) return '';
      try {
        return count.toLocaleString(document.documentElement.lang || undefined);
      } catch (error) {
        return String(count);
      }
    }

    ratingHtml(item) {
      const rating = Number(item.rating) || 0;
      if (!rating) return '';

      const count = Number(item.rating_count) || 0;
      const noun = (this.copy.f06ReviewsNoun || '').trim();
      const counted = count ? `(${this.formatCount(count)}${noun ? ` ${noun}` : ''})` : '';

      return `<div class="fuel06-finder__rating">${ICON_STAR}<span class="fuel06-finder__rating-n"><span class="fuel06-finder__rating-v">${rating.toFixed(
        1
      )}</span>${counted ? `<span class="fuel06-finder__rating-c">${escapeHtml(counted)}</span>` : ''}</span></div>`;
    }

    // Every card that can be added to the bag keeps the entry it was drawn
    // from on the button itself, so the add never has to find it again in the
    // feed and a product missing from the index cannot swallow a confirmation.
    fillCards(node, products) {
      node.innerHTML = products.map((product) => this.similarRow(product)).join('');
      node.querySelectorAll('[data-f06-add]').forEach((button, i) => {
        button.f06Product = products[i];
      });
    }

    // One row per designer fragrance, not per bottle. Several TryScent
    // perfumes are inspired by the same one, so ranking them straight into the
    // list printed "Dior Sauvage" twice; the shopper picks the name, and the
    // search behind it resolves the bottle either way. Three rows in the
    // desktop dropdown, four in the sheet, which is what the frames draw.
    suggest(query) {
      const ranked = query ? this.rank(query) : [];
      const limit = this.narrow() ? 4 : 3;
      const seen = new Set();
      const picked = [];

      ranked.forEach((product) => {
        if (picked.length === limit) return;
        const key = normalise(product.inspired);
        if (!key || seen.has(key)) return;
        seen.add(key);
        picked.push(product);
      });

      return picked;
    }

    renderTypeahead(query) {
      const clean = (query || '').trim();
      const list = this.el('suggestions');
      const suggestionsBlock = this.el('suggestions-block');
      const recentBlock = this.el('recent-block');

      if (!clean) {
        suggestionsBlock.hidden = true;
        list.innerHTML = '';
        recentBlock.hidden = true;
        this.el('recent').innerHTML = '';
        return;
      }

      const suggestions = this.suggest(clean);
      suggestionsBlock.hidden = false;
      list.innerHTML = suggestions.length
        ? suggestions
            .map(
              (product) =>
                `<li class="fuel06-finder__row"><button type="button" class="fuel06-finder__row-btn" data-f06-pick="${escapeHtml(
                  product.inspired
                )}">${ICON_SEARCH}<span class="fuel06-finder__row-t">${escapeHtml(
                  product.inspired
                )}</span>${ICON_GO}</button></li>`
            )
            .join('')
        : `<li><p class="fuel06-finder__empty">${escapeHtml(this.copy.f06Empty)}</p></li>`;

      // The frames draw a cross on every remembered row, so one entry can go
      // without clearing the lot.
      const removeLabel = this.copy.f06RemoveLabel || '';
      recentBlock.hidden = this.recent.length === 0;
      this.el('recent').innerHTML = this.recent
        .map(
          (term) =>
            `<li class="fuel06-finder__row"><button type="button" class="fuel06-finder__row-btn" data-f06-pick="${escapeHtml(
              term
            )}">${ICON_CLOCK}<span class="fuel06-finder__row-t">${escapeHtml(
              term
            )}</span></button><button type="button" class="fuel06-finder__forget" data-f06-forget="${escapeHtml(
              term
            )}" aria-label="${escapeHtml(removeLabel)} ${escapeHtml(term)}">${ICON_X}</button></li>`
        )
        .join('');
    }

    /* ----------------------------------------------------------- price tests */

    // The shop runs its own price test app (ABsolutely). The app swaps the
    // numbers in fixed spots of the theme, the product page, the cards and the
    // cart, but it has no way to reach a module it does not know, so a shopper
    // it had put on a test price saw Shopify's price here and the test price
    // everywhere else. The app publishes the visitor's group per test on
    // window.absolutely.testGroups and every group's variant prices on
    // window.absolutelyConfig, so the finder reads the same price the product
    // page would show that shopper. Without the app, or outside a test, the
    // feed's Shopify price stands. Nothing here is a claim of its own: the
    // saving is recomputed from the same reference price the feed carried.
    testedPriceCents(product) {
      try {
        const app = window.absolutely;
        const config = window.absolutelyConfig;
        if (!app || !config || !app.testGroups || !Array.isArray(config.priceTests)) return null;
        for (const test of config.priceTests) {
          const groupId = app.testGroups[test.id];
          if (!groupId) continue;
          const group = (test.groups || []).find((candidate) => candidate.id === groupId);
          if (!group) continue;
          const hit = (group.variants || []).find(
            (entry) => String(entry.variantId) === String(product.variant_id)
          );
          if (!hit || hit.price === undefined || hit.price === null) continue;
          const cents = Math.round(Number(hit.price) * 100);
          if (Number.isFinite(cents) && cents > 0) return cents;
        }
      } catch (error) {
        // The finder never depends on the app being there or well formed.
      }
      return null;
    }

    // Prints cents the way the feed printed its own price, so the two agree on
    // separators and the currency word whatever the market's format is.
    formatMoneyLike(cents, sample) {
      const match = /^(\D*)([\d.,]+(?:[\s\u00a0][\d.,]+)*)(.*)$/.exec(sample || '');
      let decimal = ',';
      let thousands = '.';
      if (match) {
        const separators = match[2].replace(/[\d\s\u00a0]/g, '');
        const last = separators.slice(-1);
        if (last === '.') {
          decimal = '.';
          thousands = ',';
        }
      }
      const major = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      const minor = String(cents % 100).padStart(2, '0');
      return `${match ? match[1] : ''}${major}${decimal}${minor}${match ? match[3] : ''}`;
    }

    priced(product) {
      if (!product) return product;
      const cents = this.testedPriceCents(product);
      if (cents === null || cents === Number(product.price)) return product;
      const out = { ...product, price: cents, price_f: this.formatMoneyLike(cents, product.price_f) };
      const ref = Number(product.ref) || 0;
      if (ref > 0) {
        const save = Math.max(0, ref - cents);
        out.save = save;
        out.save_f = this.formatMoneyLike(save, product.price_f);
        out.save_pct = Math.floor((save * 100) / ref);
      }
      return out;
    }

    renderResult(match) {
      match = this.priced(match);
      const copy = this.copy;

      this.el('based-on').textContent = `${copy.f06BasedOn} ${match.inspired}`.trim();

      this.el('match').innerHTML = `
        ${
          match.image
            ? `<img src="${escapeHtml(match.image)}" alt="${escapeHtml(
                match.title
              )}" width="164" height="164" loading="lazy">`
            : ''
        }
        <div class="fuel06-finder__match-body">
          <p class="fuel06-finder__match-t">${escapeHtml(match.title)}</p>
          <p class="fuel06-finder__match-i">${escapeHtml(copy.f06InspiredPrefix)} ${escapeHtml(match.inspired)}</p>
          ${this.ratingHtml(match)}
          ${match.blurb ? `<p class="fuel06-finder__blurb">${escapeHtml(match.blurb)}</p>` : ''}
        </div>`;

      const chips = (match.scents || []).filter(Boolean);
      if (!chips.length && match.family) chips.push(match.family);
      this.el('scent-block').hidden = chips.length === 0;
      this.el('scent-chips').innerHTML = chips
        .map((chip) => `<li class="fuel06-finder__chip fuel06-finder__chip--static">${escapeHtml(chip)}</li>`)
        .join('');

      const noteLabels = (copy.f06NoteLabels || '').split(',').map((label) => label.trim());
      const notes = (match.notes || []).map((note) => (note || '').trim());
      this.el('notes-block').hidden = !notes.some(Boolean);
      this.el('notes').innerHTML = notes
        .map((note, i) => (note ? `<dt>${escapeHtml(noteLabels[i] || '')}</dt><dd>${escapeHtml(note)}</dd>` : ''))
        .join('');

      // The comparison only appears when the shop actually holds a designer
      // reference price for this perfume. No reference price, no comparison:
      // a "you save" figure invented in the browser is exactly the kind of
      // claim this brand must not make.
      const compare = this.el('compare');
      const hasReference = Number(match.ref) > 0 && Number(match.save) > 0;
      compare.hidden = !hasReference;
      if (hasReference) {
        // Our own column reads "50 ml / Extrait de parfum" in the frame: the
        // bottle size comes off the variant, the concentration is a setting.
        const brandNote = [match.size, (copy.f06BrandNote || '').trim()].filter(Boolean).join(' / ');

        compare.innerHTML = `
          <div class="fuel06-finder__cell">
            <div class="fuel06-finder__cell-l">${escapeHtml(copy.f06BrandLabel)}</div>
            <div class="fuel06-finder__cell-v">${escapeHtml(match.price_f)}</div>
            <div class="fuel06-finder__cell-n">${escapeHtml(brandNote)}</div>
          </div>
          <div class="fuel06-finder__cell">
            <div class="fuel06-finder__cell-l">${escapeHtml(match.inspired)}</div>
            <div class="fuel06-finder__cell-v">${escapeHtml(match.ref_f)}</div>
            <div class="fuel06-finder__cell-n">${escapeHtml(copy.f06RefNote || '')}</div>
          </div>
          <div class="fuel06-finder__cell fuel06-finder__cell--save">
            <div class="fuel06-finder__cell-l">${escapeHtml(copy.f06SaveLabel)}</div>
            <div class="fuel06-finder__cell-v">${escapeHtml(match.save_f)}</div>
            <div class="fuel06-finder__cell-n"><span class="fuel06-finder__pill">${escapeHtml(
              match.save_pct
            )}% ${escapeHtml(copy.f06LessSuffix)}</span></div>
          </div>`;
      }

      const similar = this.similarTo(match, 3);
      this.el('similar-block').hidden = similar.length === 0;
      this.fillCards(this.el('similar'), similar);

      const addButton = this.el('primary-add');
      addButton.textContent = `${copy.f06AddLabel} - ${match.price_f}`;
      addButton.dataset.f06Add = match.variant_id;
      addButton.f06Product = match;
      addButton.disabled = !match.available;

      this.el('view').href = match.url;
      this.clearErrors();
    }

    similarRow(product) {
      const chips = (product.scents || []).slice(0, 3);
      return `
        <li class="fuel06-finder__sim">
          ${
            product.image
              ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(
                  product.title
                )}" width="90" height="90" loading="lazy">`
              : ''
          }
          <div class="fuel06-finder__sim-body">
            ${this.ratingHtml(product)}
            <p class="fuel06-finder__sim-t">${escapeHtml(product.title)}</p>
            <p class="fuel06-finder__sim-i">${escapeHtml(this.copy.f06InspiredPrefix)} ${escapeHtml(
              product.inspired
            )}</p>
            ${
              chips.length
                ? `<div class="fuel06-finder__sim-chips">${chips
                    .map((chip) => `<span class="fuel06-finder__sim-chip">${escapeHtml(chip)}</span>`)
                    .join('')}</div>`
                : ''
            }
          </div>
          <button type="button" class="fuel06-finder__add" data-f06-add="${escapeHtml(
            product.variant_id
          )}" aria-label="${escapeHtml(this.copy.f06AddLabel)} ${escapeHtml(product.title)}">${ICON_PLUS}</button>
        </li>`;
    }

    // The bag was changed either way, so the confirmation is shown either way.
    // A product the feed does not carry loses the card, not the confirmation.
    renderAdded(product) {
      product = this.priced(product);
      const row = this.el('added-row');
      const alsoBlock = this.el('also-block');

      if (!product) {
        row.hidden = true;
        row.innerHTML = '';
        alsoBlock.hidden = true;
        this.el('also').innerHTML = '';
        return;
      }

      row.hidden = false;
      row.innerHTML = `
        ${
          product.image
            ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(
                product.title
              )}" width="92" height="92" loading="lazy">`
            : ''
        }
        <div class="fuel06-finder__added-body">
          <p class="fuel06-finder__added-t">${escapeHtml(product.title)}</p>
          <p class="fuel06-finder__added-i">${escapeHtml(this.copy.f06InspiredPrefix)} ${escapeHtml(
            product.inspired
          )}</p>
          <p class="fuel06-finder__added-p">${escapeHtml(product.price_f)}</p>
        </div>`;

      // Three cards on desktop, two on the sheet, which is what the frames
      // draw for "You may also like".
      const also = this.similarTo(product, this.narrow() ? 2 : 3);
      alsoBlock.hidden = also.length === 0;
      this.fillCards(this.el('also'), also);
    }

    /* ------------------------------------------------------------------- cart */

    // The message has to land in the state the shopper is looking at, because
    // an add can be fired from the result state and from the added state both.
    errorNode() {
      const active = this.modal.querySelector('[data-f06-state]:not([hidden]) [data-f06-error]');
      return active || this.modal.querySelector('[data-f06-error]');
    }

    showError(message) {
      const node = this.errorNode();
      if (!node) return;
      node.textContent = message || this.copy.f06CartError || '';
      node.scrollIntoView({ block: 'nearest' });
    }

    clearErrors() {
      this.modal.querySelectorAll('[data-f06-error]').forEach((node) => {
        node.textContent = '';
      });
    }

    addToCart(button) {
      const variantId = button.dataset.f06Add;
      if (!variantId || button.dataset.f06Busy === 'true') return;

      const product =
        button.f06Product || (this.index || []).find((item) => String(item.variant_id) === String(variantId)) || null;
      button.dataset.f06Busy = 'true';
      this.clearErrors();

      fetch(this.dataset.f06CartAdd, {
        method: 'POST',
        // X-Requested-With is the header the theme's own product form sends.
        // Without it the translated market sites (Danish, Norwegian, Finnish)
        // answer this address with a redirect, and the add is lost on the way.
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity: 1 }],
          // The same section refresh the theme's own cart code asks for, so
          // the header count moves. Nothing else on the page is re-rendered
          // and no app widget is touched.
          sections: 'cart-icon-bubble',
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status || data.errors) {
            this.showError(data.description || data.message || '');
            return;
          }
          this.refreshCartBubble(data.sections);
          this.renderAdded(product);
          this.show('added');
        })
        .catch(() => {
          this.showError('');
        })
        .finally(() => {
          delete button.dataset.f06Busy;
        });
    }

    refreshCartBubble(sections) {
      if (!sections || !sections['cart-icon-bubble']) return;
      const target = document.getElementById('shopify-section-cart-icon-bubble');
      if (!target) return;
      const parsed = new DOMParser()
        .parseFromString(sections['cart-icon-bubble'], 'text/html')
        .querySelector('.shopify-section');
      if (parsed) target.innerHTML = parsed.innerHTML;
    }

    /* --------------------------------------------------------- recent searches */

    readRecent() {
      try {
        const stored = JSON.parse(window.localStorage.getItem('fuel06-recent') || '[]');
        return Array.isArray(stored) ? stored.slice(0, 4) : [];
      } catch (error) {
        return [];
      }
    }

    writeRecent() {
      try {
        window.localStorage.setItem('fuel06-recent', JSON.stringify(this.recent));
      } catch (error) {
        /* Private mode, or storage full. The finder works without it. */
      }
    }

    rememberRecent(term) {
      const clean = term.trim();
      if (!clean) return;
      // Four rows, which is what both frames draw.
      this.recent = [clean]
        .concat(this.recent.filter((item) => normalise(item) !== normalise(clean)))
        .slice(0, 4);
      this.writeRecent();
    }

    forgetRecent(term) {
      this.recent = this.recent.filter((item) => normalise(item) !== normalise(term));
      this.writeRecent();
      this.renderTypeahead(this.input.value.trim());
    }
  }

  if (!customElements.get('fuel06-finder')) {
    customElements.define('fuel06-finder', Fuel06Finder);
  }
})();
