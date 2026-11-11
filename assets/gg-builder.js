/* gg-builder.js: <gg-builder> set builder of the Gift Guide (sections/gg-bundle-builder.liquid). Vanilla, no Alpine.
   Data: <script data-gg-config> { tiers:[{size,variantId,price,compare,available}] (start size first), bottle,
         bottleLabel, t:{strings with [n] [x] [amount] [price] tokens} }
         <script data-gg-pool> [ { v:"50ml variant id", n, t, i, o, f, g, b, w, p, img, c } ] in collection order
         Size buttons [data-tier=i] are rendered by the section (only when there is more than one size).
   State: picks = [variant id strings] (ordered, duplicates allowed, length <= active size), tier (index),
          q / gender / family filters, open (mobile slot rail), busy.
   Cart: GG.bundleItem(parentVariantId, picks -> {id, name: cart line}, bottleLabel) -> GG.addItems([item]).
   Listens to window 'gg:preset' {detail:{ids,label}}: loads those scents, scrolls the builder into view. */
(function () {
  'use strict';
  if (!window.customElements || window.customElements.get('gg-builder')) return;

  function fill(str, map) {
    return String(str || '').replace(/\[(\w+)\]/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? String(map[k]) : m;
    });
  }

  function norm(s) {
    var out = String(s || '').toLowerCase().replace(/ß/g, 'ss');
    if (out.normalize) out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return out;
  }

  /* Amounts never break across lines ("54 €" stays together) */
  function money(cents) {
    var out = window.GG && typeof window.GG.money === 'function'
      ? window.GG.money(cents)
      : (Math.round(cents) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') + ' €';
    return String(out).replace(/ /g, '\u00a0');
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pad(i) {
    return i < 10 ? '0' + i : String(i);
  }

  function readJSON(root, sel, fallback) {
    var s = root.querySelector(sel);
    if (!s) return fallback;
    try {
      return JSON.parse(s.textContent);
    } catch (e) {
      if (window.console) console.warn('gg-builder: bad JSON in ' + sel, e);
      return fallback;
    }
  }

  var GENDERS = ['all', 'unisex', 'male', 'female'];

  class GGBuilder extends HTMLElement {
    connectedCallback() {
      if (this._ready) {
        /* Moved in the DOM (theme editor reorder): state and listeners are intact, only re-attach the window one */
        if (this._onPreset) window.addEventListener('gg:preset', this._onPreset);
        return;
      }
      this._ready = true;

      this.cfg = readJSON(this, 'script[data-gg-config]', null) || { tiers: [{ size: 3 }], t: {} };
      this.t = this.cfg.t || {};
      /* Older config shape (base + optional upgrade) still works */
      this.tiers = Array.isArray(this.cfg.tiers) && this.cfg.tiers.length
        ? this.cfg.tiers
        : [this.cfg.base || { size: 3 }].concat(this.cfg.upgrade ? [this.cfg.upgrade] : []);
      var pool = readJSON(this, 'script[data-gg-pool]', []) || [];

      this.byId = {};
      var best = [];
      var rest = [];
      var self = this;
      pool.forEach(function (it) {
        if (!it || !it.v || self.byId[it.v]) return;
        it.v = String(it.v);
        it.fams = String(it.f || '')
          .split(',')
          .map(function (x) { return x.trim(); })
          .filter(Boolean);
        it.hay = norm([it.n, 'nr ' + it.n, 'nr. ' + it.n, it.t, it.i, it.o, it.fams.join(' ')].join(' '));
        self.byId[it.v] = it;
        (it.b ? best : rest).push(it);
      });
      /* Bestsellers first, then the rest, both in collection order */
      this.order = best.concat(rest);

      this.picks = [];
      this.tier = 0;
      this.q = '';
      this.gender = 'all';
      this.family = '';
      this.open = false;
      this.busy = false;
      this.rows = {};
      this.mq = window.matchMedia('(max-width: 989px)');

      this.$ = {
        list: this.querySelector('[data-list]'),
        count: this.querySelector('[data-count]'),
        q: this.querySelector('[data-q]'),
        gGroup: this.querySelector('[data-g-group]'),
        fGroup: this.querySelector('[data-f-group]'),
        fList: this.querySelector('[data-f-list]'),
        sum: this.querySelector('[data-sum]'),
        head: this.querySelector('[data-head]'),
        toggle: this.querySelector('[data-toggle]'),
        of: this.querySelector('[data-of]'),
        status: this.querySelector('[data-status]'),
        slots: this.querySelector('[data-slots]'),
        sizes: Array.prototype.slice.call(this.querySelectorAll('[data-tier]')),
        tlSize: this.querySelector('[data-tl-size]'),
        tlPrice: this.querySelector('[data-tl-price]'),
        tlPer: this.querySelector('[data-tl-per]'),
        tlWas: this.querySelector('[data-tl-was]'),
        tlSave: this.querySelector('[data-tl-save]'),
        cta: this.querySelector('[data-cta]'),
        err: this.querySelector('[data-err]')
      };

      this.buildFamilies();
      this.initGenders();
      this.bind();
      this.renderList();
      this.renderSummary();
      this.classList.add('is-ready');
    }

    disconnectedCallback() {
      if (this._onPreset) window.removeEventListener('gg:preset', this._onPreset);
    }

    /* ---------- derived ---------- */

    parent() {
      return this.tiers[this.tier] || this.tiers[0] || {};
    }

    size() {
      return Math.max(1, Number(this.parent().size) || 3);
    }

    qty(id) {
      var n = 0;
      for (var i = 0; i < this.picks.length; i++) if (this.picks[i] === id) n++;
      return n;
    }

    numberText(it) {
      return it.n ? fill(this.t.number || 'Nr. [n]', { n: it.n }) : it.t;
    }

    /* ---------- filters ---------- */

    buildFamilies() {
      var counts = {};
      this.order.forEach(function (it) {
        it.fams.forEach(function (f) { counts[f] = (counts[f] || 0) + 1; });
      });
      var fams = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a] || a.localeCompare(b, 'de');
      });
      if (!fams.length) {
        if (this.$.fGroup) this.$.fGroup.hidden = true;
        return;
      }
      var frag = document.createDocumentFragment();
      fams.forEach(function (f) {
        var b = el('button', 'gg-bb__pill', f);
        b.type = 'button';
        b.setAttribute('data-f', f);
        b.setAttribute('aria-pressed', 'false');
        frag.appendChild(b);
      });
      this.$.fList.appendChild(frag);
    }

    initGenders() {
      if (!this.$.gGroup) return;
      var total = { unisex: 0, male: 0, female: 0 };
      this.order.forEach(function (it) { if (total[it.g] != null) total[it.g]++; });
      var any = false;
      ['unisex', 'male', 'female'].forEach(
        function (g) {
          var b = this.$.gGroup.querySelector('[data-g="' + g + '"]');
          if (b) b.hidden = total[g] === 0;
          if (total[g] > 0) any = true;
        }.bind(this)
      );
      if (!any) this.$.gGroup.hidden = true;
    }

    matchBase(it) {
      if (this.family && it.fams.indexOf(this.family) === -1) return false;
      if (this.qTerms && this.qTerms.length) {
        for (var i = 0; i < this.qTerms.length; i++) if (it.hay.indexOf(this.qTerms[i]) === -1) return false;
      }
      return true;
    }

    /* ---------- list ---------- */

    row(it) {
      if (this.rows[it.v]) return this.rows[it.v];
      var r = el('div', 'gg-bb__row');
      r.setAttribute('role', 'listitem');
      r.setAttribute('data-v', it.v);

      var thumb = el('span', 'gg-bb__thumb');
      if (it.img) {
        var img = document.createElement('img');
        img.src = it.img;
        img.alt = '';
        img.width = 56;
        img.height = 56;
        img.loading = 'lazy';
        img.decoding = 'async';
        thumb.appendChild(img);
      }
      r.appendChild(thumb);

      var info = el('span', 'gg-bb__info');
      var l1 = el('span', 'gg-bb__l1');
      l1.appendChild(el('strong', 'gg-bb__num', this.numberText(it)));
      /* Badges next to the number, in colour: Bestseller red, Neu green (Adrian 11.11) */
      if (it.b) l1.appendChild(el('span', 'gg-bb__tag gg-bb__tag--best', this.t.best || 'Bestseller'));
      if (it.w) l1.appendChild(el('span', 'gg-bb__tag gg-bb__tag--new', this.t.isNew || 'Neu'));
      info.appendChild(l1);
      var sub = it.i ? (this.t.inspired || 'Inspiriert von') + ' ' + it.i : it.n ? it.t : '';
      if (sub) info.appendChild(el('span', 'gg-bb__insp', sub));
      r.appendChild(info);


      r.appendChild(el('span', 'gg-bb__act'));
      this.rows[it.v] = r;
      this.updateRow(r, it);
      return r;
    }

    updateRow(r, it) {
      var q = this.qty(it.v);
      var full = this.picks.length >= this.size();
      var key = q + '|' + full;
      if (r._key === key) return;
      r._key = key;
      r.classList.toggle('is-picked', q > 0);
      var act = r.lastChild;
      act.textContent = '';
      var name = this.numberText(it);
      if (q === 0) {
        var add = el('button', 'gg-bb__add', this.t.add || 'Hinzufügen');
        add.type = 'button';
        add.setAttribute('data-act', 'add');
        add.setAttribute('aria-label', (this.t.add || 'Hinzufügen') + ': ' + name);
        add.disabled = full;
        act.appendChild(add);
      } else {
        var step = el('span', 'gg-bb__step');
        var dec = el('button', 'gg-bb__stepbtn', '−');
        dec.type = 'button';
        dec.setAttribute('data-act', 'dec');
        dec.setAttribute('aria-label', (this.t.remove || 'Entfernen') + ': ' + name);
        var n = el('span', 'gg-bb__qty', String(q));
        var inc = el('button', 'gg-bb__stepbtn', '+');
        inc.type = 'button';
        inc.setAttribute('data-act', 'inc');
        inc.setAttribute('aria-label', (this.t.add || 'Hinzufügen') + ': ' + name);
        inc.disabled = full;
        step.appendChild(dec);
        step.appendChild(n);
        step.appendChild(inc);
        act.appendChild(step);
      }
    }

    renderList() {
      var self = this;
      var counts = { all: 0, unisex: 0, male: 0, female: 0 };
      var shown = [];
      this.order.forEach(function (it) {
        if (!self.matchBase(it)) return;
        counts.all++;
        if (counts[it.g] != null) counts[it.g]++;
        if (self.gender === 'all' || it.g === self.gender) shown.push(it);
      });

      var frag = document.createDocumentFragment();
      shown.forEach(function (it) { frag.appendChild(self.row(it)); });
      this.$.list.textContent = '';
      if (shown.length) {
        this.$.list.appendChild(frag);
      } else {
        this.$.list.appendChild(el('p', 'gg-bb__none', this.t.none || 'Kein Duft gefunden.'));
      }
      this.$.list.scrollTop = 0;

      if (this.$.count) this.$.count.textContent = fill(this.t.count || '[n] Düfte', { n: shown.length });
      GENDERS.forEach(function (g) {
        var c = self.querySelector('[data-cnt="' + g + '"]');
        if (c) c.textContent = String(counts[g]);
      });
    }

    updateRows() {
      var self = this;
      Object.keys(this.rows).forEach(function (id) { self.updateRow(self.rows[id], self.byId[id]); });
    }

    /* ---------- summary ---------- */

    renderSummary() {
      var t = this.t;
      var par = this.parent();
      var size = this.size();
      var n = this.picks.length;
      var full = n === size;
      var price = Number(par.price) || 0;
      var compare = Number(par.compare) || 0;
      if (compare <= price && full) {
        /* No compare-at on the set variant: the single 50ml prices of the picks are the "was" price */
        var sum = 0;
        var self = this;
        this.picks.forEach(function (v) { sum += Number(self.byId[v] && self.byId[v].p) || 0; });
        compare = sum;
      }
      var hasCompare = compare > price && price > 0;

      this.$.of.textContent = fill(t.of || '[x] von [n]', { x: n, n: size });

      var st = this.$.status;
      st.textContent = '';
      if (!full) {
        var left = size - n;
        st.textContent = left === 1 ? t.one || 'Wähle noch 1 Duft' : fill(t.more || 'Wähle noch [n] Düfte', { n: left });
      } else if (hasCompare) {
        st.appendChild(el('s', 'gg-bb__status-was', money(compare)));
        st.appendChild(document.createTextNode(' '));
        st.appendChild(el('span', 'gg-bb__status-pct', '−' + Math.round(((compare - price) / compare) * 100) + '%'));
      } else {
        st.textContent = t.full || '';
      }

      var slots = document.createDocumentFragment();
      for (var i = 0; i < size; i++) {
        var id = this.picks[i];
        var it = id ? this.byId[id] : null;
        var li = el('li', 'gg-bb__slot' + (it ? ' is-filled' : ''));
        li.appendChild(el('span', 'gg-bb__slot-idx', pad(i + 1)));
        if (it) {
          var txt = el('span', 'gg-bb__slot-txt');
          txt.appendChild(el('strong', '', this.numberText(it)));
          if (it.i) txt.appendChild(document.createTextNode(' · ' + (t.inspired || 'Inspiriert von') + ' ' + it.i));
          li.appendChild(txt);
          li.appendChild(el('span', 'gg-bb__slot-num', it.n || pad(i + 1)));
          var x = el('button', 'gg-bb__slot-x');
          x.type = 'button';
          x.setAttribute('data-rm', String(i));
          x.setAttribute('aria-label', (t.remove || 'Entfernen') + ': ' + this.numberText(it));
          x.appendChild(el('span', '', '×')).setAttribute('aria-hidden', 'true');
          li.appendChild(x);
        } else {
          li.appendChild(el('span', 'gg-bb__slot-txt', t.empty || ''));
        }
        slots.appendChild(li);
      }
      this.$.slots.textContent = '';
      this.$.slots.appendChild(slots);

      var tier = this.tier;
      this.$.sizes.forEach(function (b) {
        var on = Number(b.getAttribute('data-tier')) === tier;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      var bottle = String(this.cfg.bottle || '50ml').replace(/(\d)\s*([a-z])/i, '$1 $2');
      this.$.tlSize.textContent = size + ' × ' + bottle;
      this.$.tlPrice.textContent = money(price);
      this.$.tlPer.textContent = fill(t.per || '[amount] pro Flasche', { amount: money(Math.round(price / size)) });
      this.$.tlWas.textContent = hasCompare ? fill(t.was || 'Statt [amount]', { amount: money(compare) }) : '';
      this.$.tlSave.textContent = hasCompare ? fill(t.save || 'Du sparst [amount]', { amount: money(compare - price) }) : '';
      this.$.tlSave.hidden = !hasCompare;

      var ready = full && !!par.variantId && par.available !== false && !this.busy;
      this.$.cta.disabled = !ready;
      this.$.cta.textContent = this.busy ? t.loading || '' : fill(t.cta, { price: money(price) });
      this.$.cta.setAttribute('aria-busy', this.busy ? 'true' : 'false');
    }

    render() {
      this.updateRows();
      this.renderSummary();
    }

    /* ---------- actions ---------- */

    addPick(id) {
      if (!this.byId[id] || this.picks.length >= this.size()) return;
      this.picks.push(id);
      this.hideError();
      this.render();
    }

    removeLast(id) {
      var i = this.picks.lastIndexOf(id);
      if (i === -1) return;
      this.picks.splice(i, 1);
      this.render();
    }

    removeAt(i) {
      if (i < 0 || i >= this.picks.length) return;
      this.picks.splice(i, 1);
      this.render();
    }

    /* Switching size keeps the picks; going smaller drops the ones that no longer fit */
    setTier(i) {
      var t = this.tiers[i];
      if (!t || t.available === false) return;
      this.tier = i;
      if (this.picks.length > this.size()) this.picks = this.picks.slice(0, this.size());
      this.hideError();
      this.render();
    }

    /* A gift set loads into the smallest size it fits (a 3-scent set -> the 3er) */
    applyPreset(ids) {
      var self = this;
      var valid = (ids || []).map(String).filter(function (id) { return !!self.byId[id]; });
      if (!valid.length) return false;
      var pick = -1;
      this.tiers.forEach(function (t, i) {
        var s = Number(t.size) || 0;
        if (s < valid.length || t.available === false) return;
        if (pick === -1 || s < (Number(self.tiers[pick].size) || 0)) pick = i;
      });
      if (pick === -1) return false;
      this.tier = pick;
      this.picks = valid.slice(0, this.size());
      this.hideError();
      this.render();
      return true;
    }

    setOpen(on) {
      this.open = !!on;
      this.$.sum.toggleAttribute('data-open', this.open);
      if (this.$.toggle) this.$.toggle.setAttribute('aria-expanded', this.open ? 'true' : 'false');
    }

    hideError() {
      if (this.$.err) this.$.err.hidden = true;
    }

    submit() {
      var par = this.parent();
      if (this.busy || this.picks.length !== this.size() || !par.variantId) return;
      if (!window.GG || typeof window.GG.addItems !== 'function') return;
      var self = this;
      var item = window.GG.bundleItem(
        par.variantId,
        this.picks.map(function (v) { return { id: v, name: (self.byId[v] && self.byId[v].c) || v }; }),
        this.cfg.bottleLabel || 'Flasche'
      );
      this.busy = true;
      this.hideError();
      this.renderSummary();
      window.GG.addItems([item])
        .then(function () {
          self.busy = false;
          self.picks = [];
          self.setOpen(false);
          self.render();
        })
        .catch(function () {
          self.busy = false;
          self.renderSummary();
          if (self.$.err) {
            self.$.err.textContent = self.t.error || '';
            self.$.err.hidden = false;
          }
        });
    }

    bind() {
      var self = this;

      this.$.list.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        var r = b.closest('[data-v]');
        if (!r) return;
        var id = r.getAttribute('data-v');
        var act = b.getAttribute('data-act');
        if (act === 'dec') self.removeLast(id);
        else self.addPick(id);
        /* Keep keyboard focus inside the row after the button is swapped */
        if (e.detail === 0) {
          ['[data-act="' + act + '"]', '[data-act="inc"]', '[data-act="dec"]', '[data-act="add"]'].some(function (s) {
            var n = r.querySelector(s);
            if (n && !n.disabled) { if (document.activeElement !== n) n.focus(); return true; }
            return false;
          });
        }
      });

      if (this.$.q) {
        var timer;
        this.$.q.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            self.q = self.$.q.value;
            self.qTerms = norm(self.q).split(/\s+/).filter(Boolean);
            self.renderList();
          }, 120);
        });
      }

      if (this.$.gGroup) {
        this.$.gGroup.addEventListener('click', function (e) {
          var b = e.target.closest('[data-g]');
          if (!b) return;
          self.gender = b.getAttribute('data-g');
          self.$.gGroup.querySelectorAll('[data-g]').forEach(function (x) {
            var on = x === b;
            x.classList.toggle('is-active', on);
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          self.renderList();
        });
      }

      if (this.$.fList) {
        this.$.fList.addEventListener('click', function (e) {
          var b = e.target.closest('[data-f]');
          if (!b) return;
          self.family = b.getAttribute('data-f') || '';
          self.$.fList.querySelectorAll('[data-f]').forEach(function (x) {
            var on = x === b;
            x.classList.toggle('is-active', on);
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          self.renderList();
        });
      }

      this.querySelectorAll('[data-preset]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var ids = [];
          try {
            ids = JSON.parse(chip.getAttribute('data-preset') || '[]');
          } catch (err) {
            ids = [];
          }
          self.applyPreset(ids);
          if (self.mq.matches) self.setOpen(true);
        });
      });

      this.$.slots.addEventListener('click', function (e) {
        var b = e.target.closest('[data-rm]');
        if (!b) return;
        self.removeAt(Number(b.getAttribute('data-rm')));
      });

      this.$.sizes.forEach(function (b) {
        b.addEventListener('click', function () { self.setTier(Number(b.getAttribute('data-tier'))); });
      });

      if (this.$.toggle) {
        this.$.toggle.addEventListener('click', function () { self.setOpen(!self.open); });
      }
      /* Mobile: tapping the bar header (not the chevron itself) also opens / closes the slot rail */
      this.$.head.addEventListener('click', function (e) {
        if (!self.mq.matches || e.target.closest('[data-toggle]')) return;
        self.setOpen(!self.open);
      });

      this.$.cta.addEventListener('click', function () { self.submit(); });

      this._onPreset = function (e) {
        if (document.querySelector('gg-builder') !== self) return;
        var ids = (e.detail && e.detail.ids) || [];
        if (!self.applyPreset(ids)) return;
        var anchor = self.closest('.gg-bb');
        anchor = (anchor && anchor.querySelector('.gg-anchor')) || self;
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (self.mq.matches) self.setOpen(true);
      };
      window.addEventListener('gg:preset', this._onPreset);
    }
  }

  window.customElements.define('gg-builder', GGBuilder);
})();
