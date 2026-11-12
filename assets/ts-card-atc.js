/* ts-card-atc.js: size chips on collection cards (snippets/product-card.liquid with atc).
   A chip sets the variant the card's product-form adds, marks itself active and swaps the card price (and the
   struck price) to that size. One delegated listener, so cards added later (load more, filters) work too.
   Adding to the cart itself is assets/product-form.js. */
(function () {
  if (window.tsCardAtcReady) return;
  window.tsCardAtcReady = true;

  document.addEventListener('click', function (event) {
    var chip = event.target.closest ? event.target.closest('.ts-card-atc__size') : null;
    if (!chip || chip.disabled) return;
    var box = chip.closest('.ts-card-atc');
    if (!box) return;

    var input = box.querySelector('input[name="id"]');
    if (input) input.value = chip.dataset.variantId;

    Array.prototype.forEach.call(box.querySelectorAll('.ts-card-atc__size'), function (other) {
      var on = other === chip;
      other.classList.toggle('is-active', on);
      other.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    var item = box.closest('.ts-atc-item') || box.parentElement;
    // The price test sync (snippets/price-test-card-sync.liquid) reads this to show the visitor's test price
    // for the chosen size; it runs on the text change below.
    var card = item.querySelector('[data-ts-variant-id]');
    if (card) card.setAttribute('data-ts-variant-id', chip.dataset.variantId);
    var price = item.querySelector('[data-ts-price]');
    if (price) price.textContent = chip.dataset.price;
    var compare = item.querySelector('[data-ts-compare]');
    if (compare) {
      compare.textContent = chip.dataset.compare || '';
      compare.hidden = !chip.dataset.compare;
    }

    var button = box.querySelector('.ts-card-atc__btn');
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      var label = button.querySelector('span');
      if (label && button.dataset.addLabel) label.textContent = button.dataset.addLabel;
    }
  });
})();
