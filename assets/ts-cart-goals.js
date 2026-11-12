/* ts-cart-goals.js: cart goals bar on collection grids (snippets/ts-cart-goals.liquid). Display only.
   Goals = Kite's progress bar goals (cart subtotal thresholds) for this market, read from window.gfg.settings the
   same way as the Bundle & Save builder (sections/pm-bundle-save.liquid readGoals): Kite empties #kite-app-data after
   reading it, so the settings object is the source; it is there ~1-3 s after load, so the bar retries for ~12 s.
   Fill = cart total (/cart.js total_price), refreshed on every cart update (Dawn pubsub: card add to cart, drawer). */
(function () {
  if (window.tsCartGoalsReady) return;
  window.tsCartGoalsReady = true;

  function readGoals(market) {
    var data = window.gfg && window.gfg.settings && window.gfg.settings.consolidatedCombinedDiscount ? window.gfg.settings : null;
    if (!data) {
      var el = document.getElementById('kite-app-data');
      try { data = el && el.textContent ? JSON.parse(el.textContent) : null; } catch (e) { data = null; }
    }
    if (!data) return [];
    var rate = parseFloat(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || 1;
    var out = [];
    (data.consolidatedCombinedDiscount || []).forEach(function (c) {
      if (!c || c.isEnabled === false || c.discountFunctionType !== 'CONSOLIDATED_PROGRESS_BAR') return;
      ((c.segmentsData && c.segmentsData.segmentsList) || []).forEach(function (s) {
        var r = ((s.buyXRulesData && s.buyXRulesData.rulesList) || [])[0];
        if (!r || !/subtotal/i.test(r.ruleType || '')) return;
        var rv = r.ruleValue || {};
        var amount = parseFloat(rv.qualifierValue) * rate;
        (rv.marketValues || []).forEach(function (m) {
          if (m && m.handle === market && parseFloat(m.value) > 0) amount = parseFloat(m.value);
        });
        if (!(amount > 0)) return;
        out.push({ amount: Math.round(amount * 100), ship: s.goalType !== 'FREE_GIFT' });
      });
    });
    return out.sort(function (a, b) { return a.amount - b.amount; });
  }

  function init(root) {
    if (root.dataset.started) return;
    root.dataset.started = '1';
    var market = root.dataset.market || '';
    var goals = [];
    var total = 0;
    var fill = root.querySelector('.ts-goals__fill');
    var track = root.querySelector('.ts-goals__track');
    var labels = root.querySelector('.ts-goals__labels');
    var lines = root.querySelectorAll('[data-line]');

    // Whole currency units in the shop's own format (the server renders "0 kr" / "€0" / "0 kr." for this market)
    function money(cents) {
      var whole = Math.ceil((Number(cents) || 0) / 100);
      return (root.dataset.money || '0').replace(/\d+(?:[.,]\d+)?/, String(whole));
    }

    function clone(sel) {
      var src = root.querySelector('.ts-goals__src ' + sel);
      return src ? src.cloneNode(true) : document.createElement('span');
    }

    function build() {
      track.querySelectorAll('.ts-goals__node').forEach(function (n) { n.remove(); });
      labels.textContent = '';
      goals.forEach(function (g, i) {
        var left = ((i + 1) / goals.length) * 100 + '%';
        var kind = g.ship ? 'ship' : 'gift';

        var node = document.createElement('span');
        node.className = 'ts-goals__node';
        node.style.left = left;
        var icon = clone('[data-icon="' + kind + '"]');
        icon.removeAttribute('data-icon');
        icon.className = 'ts-goals__icon';
        node.appendChild(icon);
        track.appendChild(node);

        var label = document.createElement('div');
        label.className = 'ts-goals__label' + (i === goals.length - 1 ? ' is-last' : '');
        label.style.left = left;
        var amount = document.createElement('div');
        amount.className = 'ts-goals__amount';
        amount.textContent = money(g.amount);
        var reward = clone('[data-reward="' + kind + '"]');
        reward.removeAttribute('data-reward');
        reward.className = 'ts-goals__reward';
        label.appendChild(amount);
        label.appendChild(reward);
        labels.appendChild(label);
      });
    }

    function percent() {
      if (!goals.length || total <= 0) return 0;
      var step = 100 / goals.length;
      var prev = 0;
      for (var i = 0; i < goals.length; i++) {
        if (total < goals[i].amount) return Math.round((i * step + ((total - prev) / (goals[i].amount - prev)) * step) * 10) / 10;
        prev = goals[i].amount;
      }
      return 100;
    }

    function render() {
      var next = null;
      for (var i = 0; i < goals.length; i++) {
        if (goals[i].amount > total) { next = goals[i]; break; }
      }
      fill.style.width = percent() + '%';
      track.querySelectorAll('.ts-goals__node').forEach(function (n, i) {
        n.classList.toggle('is-reached', total >= goals[i].amount);
      });
      labels.querySelectorAll('.ts-goals__label').forEach(function (l, i) {
        l.classList.toggle('is-reached', total >= goals[i].amount);
      });
      var show = next ? (next.ship ? 'ship' : 'gift') : 'done';
      lines.forEach(function (line) { line.hidden = line.dataset.line !== show; });
      root.classList.toggle('is-done', !next);
      if (next) {
        var left = money(Math.ceil((next.amount - total) / 100) * 100);
        root.querySelectorAll('[data-left]').forEach(function (el) { el.textContent = left; });
      }
    }

    function applyCart(c) {
      total = (c && c.total_price) || 0;
      render();
    }

    function refreshCart() {
      var base = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      fetch(base + 'cart.js', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(applyCart)
        .catch(function () {});
    }

    function start(tries) {
      if (!root.isConnected) return;
      goals = readGoals(market);
      if (!goals.length) {
        if (tries < 24) setTimeout(function () { start(tries + 1); }, 500);
        return;
      }
      build();
      render();
      root.hidden = false;
      refreshCart();
      if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        subscribe(PUB_SUB_EVENTS.cartUpdate, function (e) {
          if (!root.isConnected) return;
          // The drawer publishes the whole cart; an add publishes only the added line, so fetch the cart then.
          if (e && e.cartData && typeof e.cartData.total_price === 'number' && e.cartData.items) applyCart(e.cartData);
          else refreshCart();
        });
      }
      window.addEventListener('pageshow', function (e) { if (e.persisted) refreshCart(); });
    }

    start(0);
  }

  function startAll() { document.querySelectorAll('[data-ts-goals]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAll);
  else startAll();
  document.addEventListener('shopify:section:load', startAll);
})();
