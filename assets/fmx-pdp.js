/* fmx-pdp.js: smart sticky buy box for the FM product page test (sections/fmx-main-product.liquid).
   Copy of the FM theme's assets/pm-pdp.js; only the container selector is scoped to .fmx-pdp-scope.
   Sets --pm-sticky-top on <html> to min(header + 16, viewport - buyBoxHeight - 16) from 990px,
   so a buy box taller than the viewport scrolls until its bottom (the ATC) is reachable instead
   of pinning its top and hiding the button. Below 990 the variable is removed (column is static). */
(function () {
  'use strict';

  var box = document.querySelector('.fmx-pdp-scope .pm-pdp .product__info-container');
  if (!box || !window.matchMedia) return;

  var mq = window.matchMedia('(min-width: 990px)');
  var root = document.documentElement;
  var raf = 0;

  function headerHeight() {
    var value = parseFloat(getComputedStyle(root).getPropertyValue('--header-height'));
    if (!isNaN(value) && value > 0) return value;
    var header = document.querySelector('.section-header, .shopify-section-group-header-group');
    return header ? header.offsetHeight : 64;
  }

  function update() {
    raf = 0;
    if (!mq.matches) {
      root.style.removeProperty('--pm-sticky-top');
      return;
    }
    var top = Math.min(headerHeight() + 16, window.innerHeight - box.offsetHeight - 16);
    root.style.setProperty('--pm-sticky-top', Math.round(top) + 'px');
  }

  function schedule() {
    if (raf) return;
    raf = window.requestAnimationFrame(update);
  }

  if (window.ResizeObserver) {
    new ResizeObserver(schedule).observe(box);
  } else {
    box.addEventListener('transitionend', schedule);
  }

  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  if (mq.addEventListener) mq.addEventListener('change', schedule);
  else if (mq.addListener) mq.addListener(schedule);

  /* Alpine re-renders the tier panels after this script runs; catch those without polling */
  document.addEventListener('alpine:initialized', schedule);
  box.addEventListener('click', schedule);

  update();
})();
