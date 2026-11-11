/* gg-card.js: <gg-buy> custom element for Gift Guide gift-set cards and the product hero.
   DOM contract (rendered by snippets/gg-gift-card.liquid and sections/gg-product-hero.liquid):
     <gg-buy data-variant="<bundle variant id>" data-label="Flasche" data-title="<gift title>"
             data-added="Hinzugefügt" data-error="<error text>">
       <script type="application/json" data-gg-scents>[{"id": <50ml variant id>, "name": "<cart line>"}]</script>
       <button data-gg-atc><span data-gg-atc-text>In den Warenkorb</span></button>
       <p data-gg-status aria-live="polite"></p>
       <button data-gg-swap>Duft tauschen</button>   (optional)
     </gg-buy>
   ATC: scents present -> GG.bundleItem(variant, scents, label) (one line + "_bundle_items" + "Flasche N"),
        no scents -> plain { id, quantity: 1 }. Then GG.addItems([item]) (assets/gg-core.js).
   Swap: GG.preset(ids, title) -> the builder section fills itself and scrolls into view.
   No global state: every instance reads its own attributes, so theme-editor re-renders just work. */
(function () {
  'use strict';
  if (!window.customElements || customElements.get('gg-buy')) return;

  var ADDED_MS = 2000;

  class GGBuy extends HTMLElement {
    connectedCallback() {
      if (this.ggBound) return;
      this.ggBound = true;
      this.addEventListener('click', this.onClick.bind(this));
    }

    scents() {
      var node = this.querySelector('script[data-gg-scents]');
      if (!node) return [];
      try {
        var list = JSON.parse(node.textContent || '[]');
        return Array.isArray(list) ? list.filter(function (s) { return s && s.id; }) : [];
      } catch (e) {
        return [];
      }
    }

    setStatus(text) {
      var el = this.querySelector('[data-gg-status]');
      if (el) el.textContent = text || '';
    }

    onClick(event) {
      var swap = event.target.closest('[data-gg-swap]');
      if (swap && this.contains(swap)) {
        event.preventDefault();
        this.swap();
        return;
      }
      var atc = event.target.closest('[data-gg-atc]');
      if (atc && this.contains(atc)) {
        event.preventDefault();
        this.add(atc);
      }
    }

    swap() {
      if (!window.GG) return;
      var ids = this.scents().map(function (s) { return s.id; });
      if (ids.length) window.GG.preset(ids, this.dataset.title || '');
    }

    add(button) {
      if (button.disabled || button.getAttribute('aria-busy') === 'true') return;
      var self = this;
      var textEl = button.querySelector('[data-gg-atc-text]') || button;
      var original = textEl.textContent;
      var errorText = this.dataset.error || 'Das hat nicht geklappt. Bitte versuch es noch einmal.';

      if (!window.GG || typeof window.GG.addItems !== 'function') {
        this.setStatus(errorText);
        return;
      }

      var variant = this.dataset.variant;
      var scents = this.scents();
      var item = scents.length
        ? window.GG.bundleItem(variant, scents, this.dataset.label || 'Flasche')
        : { id: Number(variant), quantity: 1 };

      this.setStatus('');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      textEl.textContent = '…';

      function restore() {
        textEl.textContent = original;
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }

      window.GG.addItems([item])
        .then(function () {
          textEl.textContent = self.dataset.added || original;
          setTimeout(restore, ADDED_MS);
        })
        .catch(function () {
          restore();
          self.setStatus(errorText);
        });
    }
  }

  customElements.define('gg-buy', GGBuy);
})();

/* <gg-carousel>: desktop arrows for a .gg-row--carousel track (sections/gg-gift-sets.liquid).
   Arrows page by one card; they hide when everything fits and disable at either end. Below 990 the CSS hides
   them and the row is a plain swipe row. Theme editor: selecting a card block scrolls it into view. */
(function () {
  'use strict';
  if (!window.customElements || customElements.get('gg-carousel')) return;

  class GGCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-gg-track]');
      this.nav = this.querySelector('[data-gg-nav]');
      this.prev = this.querySelector('[data-gg-prev]');
      this.next = this.querySelector('[data-gg-next]');
      if (!this.track || !this.nav || this.ggBound) return;
      this.ggBound = true;
      this.update = this.update.bind(this);
      this.onSelect = this.onSelect.bind(this);
      this.prev.addEventListener('click', this.page.bind(this, -1));
      this.next.addEventListener('click', this.page.bind(this, 1));
      this.track.addEventListener('scroll', this.update, { passive: true });
      this.track.addEventListener('keydown', this.onKey.bind(this));
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(this.update);
        this.ro.observe(this.track);
      }
      window.addEventListener('resize', this.update);
      window.addEventListener('load', this.update);
      // cards added or removed (theme editor, late renders) change scrollWidth without resizing the track
      if (window.MutationObserver) {
        this.mo = new MutationObserver(this.update);
        this.mo.observe(this.track, { childList: true });
      }
      document.addEventListener('shopify:block:select', this.onSelect);
      this.update();
    }

    disconnectedCallback() {
      if (this.ro) this.ro.disconnect();
      if (this.mo) this.mo.disconnect();
      window.removeEventListener('resize', this.update);
      window.removeEventListener('load', this.update);
      document.removeEventListener('shopify:block:select', this.onSelect);
      this.ggBound = false;
    }

    step() {
      var first = this.track.firstElementChild;
      if (!first) return this.track.clientWidth;
      var gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return first.getBoundingClientRect().width + gap;
    }

    page(dir) {
      this.track.scrollBy({ left: dir * this.step(), behavior: 'smooth' });
    }

    onKey(event) {
      if (event.target !== this.track) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); this.page(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.page(-1); }
    }

    onSelect(event) {
      var item = event.target;
      if (!item || !this.track.contains(item)) return;
      this.track.scrollTo({ left: item.offsetLeft - this.track.offsetLeft, behavior: 'smooth' });
    }

    update() {
      var t = this.track;
      var max = t.scrollWidth - t.clientWidth;
      this.nav.hidden = max <= 2;
      this.prev.disabled = t.scrollLeft <= 2;
      this.next.disabled = t.scrollLeft >= max - 2;
    }
  }

  customElements.define('gg-carousel', GGCarousel);
})();
