/* gg-core.js: Gift Guide shared runtime (vanilla, no Alpine, portable across portfolio themes).
   window.GG = {
     money(cents)                       -> "60 €" style string (theme formatter if present, ",00" trimmed)
     bundleItem(variantId, scents, label)-> cart item { id, quantity:1, properties:{ "_bundle_items", "<label> 1".. } }
                                           scents = [{ id: <50ml variant id>, name: "<cart line text>" }]
     addItems(items)                    -> Promise; POST /cart/add.js, then opens the theme cart drawer from a fresh
                                           section render (falls back to /cart); resolves true on success
     preset(variantIds, label)          -> fires window event 'gg:preset' (detail { ids, label }); the builder listens
   }
   Contract kept identical to the store builders (snippets/fmx-bundle-builder.liquid, sections/pm-bundle-save.liquid):
   one line = bundle variant + "_bundle_items" (comma-joined 50ml variant ids) + "Flasche N" readable names. */
(function () {
  'use strict';
  if (window.GG) return;

  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  /* No theme formatter (e.g. the live tryscent.co theme): the shop's own money format, which the sections that load
     this file put on window.ggMoneyFormat ({{ shop.money_format }}, e.g. "{{amount_with_comma_separator}} kr"). */
  function shopFormat(n) {
    var f = window.ggMoneyFormat;
    var m = f ? String(f).match(/\{\{\s*(\w+)\s*\}\}/) : null;
    if (!m) return null;
    var key = m[1];
    var dec = key.indexOf('no_decimals') > -1 ? 0 : 2;
    var th = ',';
    var ds = '.';
    if (key.indexOf('comma_separator') > -1) { th = '.'; ds = ','; }
    else if (key.indexOf('space_separator') > -1) { th = ' '; ds = ','; }
    else if (key.indexOf('apostrophe_separator') > -1) { th = "'"; ds = '.'; }
    var parts = (n / 100).toFixed(dec).split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, th);
    return String(f).replace(m[0], whole + (dec ? ds + parts[1] : ''));
  }

  function money(cents) {
    var n = Math.round(Number(cents) || 0);
    var out;
    /* Shop format before Shopify.formatMoney: on tryscent.co an app defines Shopify.formatMoney with a "$" default
       ("$429" in the builder button, 11.11.2026) */
    if (typeof window.pmMoney === 'function') {
      out = window.pmMoney(n);
    } else if (shopFormat(n) !== null) {
      out = shopFormat(n);
    } else if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      out = window.Shopify.formatMoney(n);
    } else {
      out = (n / 100).toFixed(2).replace('.', ',') + ' €';
    }
    return String(out).replace(/[.,]00(?=\D*$)/, '');
  }

  function bundleItem(variantId, scents, label) {
    var props = {};
    var word = label || 'Flasche';
    (scents || []).forEach(function (s, i) {
      props[word + ' ' + (i + 1)] = s.name || String(s.id);
    });
    props._bundle_items = (scents || []).map(function (s) { return s.id; }).join(',');
    return { id: Number(variantId), quantity: 1, properties: props };
  }

  function within(p, ms, token) {
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(token); }, ms); })]);
  }

  function goCart() {
    window.location.href = (window.routes && window.routes.cart_url) || root + 'cart';
  }

  /* Same flow as pm-bundle-save: some apps wrap window.fetch and swallow the add reply although the line is in the
     cart, so wait max 5 s, then check /cart.js for the marker, then render the drawer from fresh section HTML. */
  function addItems(items) {
    var cart = document.querySelector('cart-drawer');
    var TIMEOUT = {};
    var marker = items.length === 1 && items[0].properties ? items[0].properties._bundle_items : null;
    var done = false;
    var hardStop = setTimeout(function () { if (!done) goCart(); }, 8000);
    if (cart && typeof cart.setActiveElement === 'function') cart.setActiveElement(document.activeElement);

    var add = fetch(root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.status) {
          var err = new Error(data.description || data.message || 'cart');
          err.data = data;
          throw err;
        }
        return data;
      });
    });

    return within(add, 5000, TIMEOUT)
      .then(function (result) {
        if (result !== TIMEOUT) return;
        return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (c) {
            var found = (c.items || []).some(function (it) {
              return marker
                ? it.properties && it.properties._bundle_items === marker
                : items.some(function (x) { return x.id === it.variant_id; });
            });
            if (!found) throw new Error('cart add timed out');
          });
      })
      .then(function () {
        if (!cart || typeof cart.renderContents !== 'function' || typeof cart.getSectionsToRender !== 'function') {
          done = true;
          clearTimeout(hardStop);
          goCart();
          return true;
        }
        var ids = cart.getSectionsToRender().map(function (s) { return s.id; });
        return fetch(window.location.pathname + '?sections=' + ids.join(','))
          .then(function (r) { return r.json(); })
          .then(function (sections) {
            done = true;
            clearTimeout(hardStop);
            cart.renderContents({ sections: sections });
            if (cart.classList.contains('is-empty')) cart.classList.remove('is-empty');
            /* Dawn declares publish / PUB_SUB_EVENTS as top-level const/function (not on window): use bare names */
            if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
              fetch(root + 'cart.js', { headers: { Accept: 'application/json' } })
                .then(function (r) { return r.json(); })
                .then(function (c) { publish(PUB_SUB_EVENTS.cartUpdate, { source: 'gg-gift-guide', cartData: c }); })
                .catch(function () {});
            }
            return true;
          });
      })
      .catch(function (err) {
        done = true;
        clearTimeout(hardStop);
        var d = (err && err.data) || {};
        if (window.console) console.warn('gg cart/add', d.description || d.message || err);
        throw err;
      });
  }

  function preset(ids, label) {
    window.dispatchEvent(new CustomEvent('gg:preset', { detail: { ids: (ids || []).map(String), label: label || '' } }));
  }

  window.GG = { money: money, bundleItem: bundleItem, addItems: addItems, preset: preset };
})();
