/*
 * FUEL_09 offer box. Loaded (deferred) from snippets/fuel09-box.liquid.
 *
 * Which card is open is CSS, off the checked radio. This file only joins the
 * box to the buy area it stands in for:
 *
 * - a size picked in the box clicks the hidden size tile with the same id, so
 *   the theme's own script in snippets/reactive-variant-selector.liquid sets
 *   the form's variant id the way it always has;
 * - the form gets a hidden quantity input holding the selected card's bottles
 *   (paid + free);
 * - the button's price reads the selected card's total for the selected size.
 *
 * A card of looks A and B that has mystery bottles (data-mystery), in a block
 * that names the mystery item and its discount code, takes the add to cart
 * press over as look C does: the code and the cart marks go on first, then
 * the perfumes and the mystery bottles in one request, then the theme's cart
 * drawer. The bottle is free through that code, which the gift app accepts
 * only on a cart with the mark. From there snippets/fuel09-global.liquid
 * looks after it on every page. Every other card of A and B is added by the
 * theme's own form.
 *
 * All three happen only while the box is the look on show: its class is on
 * <html> and the box has a rendered box of its own. Otherwise the page is left
 * exactly as the theme built it, and when the look goes away the quantity
 * input is taken out and the theme's own price is put back.
 *
 * Every figure of looks A and B is printed by Liquid and nothing is
 * calculated here for them.
 *
 * The box offers the sizes its tiles name and no other. A form found on a
 * size the box does not offer (the page opened on it, or something else on
 * the page chose it) is put on the box's opening size through that size's
 * own tile.
 *
 * Look C (the box holds a .fuel09-picker) sells a scent per bottle, all in
 * the size chosen on the page's own size tiles, so four things are different
 * for it:
 *
 * - the size tiles stay on show. They sit in the buy area under the box, so
 *   while the look is on the heading row and the grid are lifted to just
 *   above the box, the tiles of sizes the box does not offer are switched
 *   off, and both go back as they were when the look goes away;
 * - no quantity is written into the form: the bottles are different
 *   perfumes, which a quantity cannot say;
 * - the picks are kept here, one list for the whole box, and each card shows
 *   as many of them as it has bottles. The first is the perfume of the page.
 *   A pick knows its id and price in every size it has in stock; a change
 *   of size keeps the picks that come in the new size and empties the slots
 *   of those that do not. A card's price is worked out here, the way Liquid
 *   printed it: the dearest "paid" bottles are the ones paid for (the
 *   discount frees the cheapest), plus shipping under the free shipping limit;
 * - the add to cart press is taken over: with a scent still to choose it
 *   opens the picker, and with all chosen it adds the bottles one line per
 *   perfume, adds the card's discount code, and opens the theme's cart drawer.
 */
if (!customElements.get('fuel09-box')) {
  customElements.define(
    'fuel09-box',
    class Fuel09Box extends HTMLElement {
      connectedCallback() {
        const scope = this.closest('product-info') ?? document;
        this.form = scope.querySelector('.atc-bundle-builder form[data-type="add-to-cart-form"]');
        this.tiles = scope.querySelector('.atc-bundle-builder #variant-selector');
        this.host = this.form?.closest('product-form') ?? null;
        this.live = false;
        this.sizeId = this.dataset.openId ?? '';
        this.picker = this.querySelector('.fuel09-picker');
        // Look C names its sizes on the box, each under the word the scent
        // list uses for it; the other looks have a tile for every size.
        this.sizes = this.picker ? this.readSizes(this.dataset.pickSizes) : null;
        this.offered = new Set(
          this.sizes
            ? Object.values(this.sizes).map(({ id }) => id)
            : [...this.querySelectorAll('.fuel09-size__input')].map(({ value }) => value)
        );

        this.onChange = this.onChange.bind(this);
        this.onTileClick = this.onTileClick.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onSearch = this.onSearch.bind(this);
        this.onPickerClose = this.onPickerClose.bind(this);

        if (this.picker) {
          const own = this.querySelector('.fuel09-pick--own');
          const image = own?.querySelector('.fuel09-pick__image');
          this.picks = [
            {
              product: this.dataset.pickProduct,
              sizes: this.sizes,
              short: own?.querySelector('[data-fuel09-name]')?.textContent ?? '',
              image: image?.currentSrc || image?.getAttribute('src') || ''
            }
          ];
          this.addEventListener('click', this.onClick);
          this.picker.addEventListener('input', this.onSearch);
          this.picker.addEventListener('close', this.onPickerClose);
        }

        this.addEventListener('change', this.onChange);
        this.tiles?.addEventListener('click', this.onTileClick);
        // Capture on the form's parent, so this runs ahead of the theme's own
        // submit listener on the form whatever order the two were added in.
        this.host?.addEventListener('submit', this.onSubmit, true);

        // The testing tool may put the class on <html> after this script has
        // run, and the preview switch takes it off again without a reload.
        // Either way the box gains or loses its rendered size at that moment,
        // which is the one thing here that reports it.
        this.watcher = new ResizeObserver(() => this.sync());
        this.watcher.observe(this);
        this.sync();
      }

      disconnectedCallback() {
        this.removeEventListener('change', this.onChange);
        this.removeEventListener('click', this.onClick);
        this.picker?.removeEventListener('input', this.onSearch);
        this.picker?.removeEventListener('close', this.onPickerClose);
        this.tiles?.removeEventListener('click', this.onTileClick);
        this.host?.removeEventListener('submit', this.onSubmit, true);
        this.watcher?.disconnect();
        this.lower?.();
      }

      get formSizeId() {
        return this.form?.querySelector('[name="id"]')?.value ?? '';
      }

      get card() {
        return this.querySelector('.fuel09-card__input:checked')?.closest('.fuel09-card') ?? null;
      }

      tile(variantId) {
        if (!variantId) return null;
        return this.tiles?.querySelector(`.variant-button[data-variant-id="${CSS.escape(variantId)}"]`) ?? null;
      }

      // "word:id:price" per size, as Liquid prints it on the box and on
      // every row of the scent list.
      readSizes(list) {
        return Object.fromEntries(
          (list ?? '')
            .split(' ')
            .filter(Boolean)
            .map((entry) => {
              const [word, id, price] = entry.split(':');
              return [word, { id, price: Number(price) || 0 }];
            })
        );
      }

      // Look C: the word of the size on show, which is what a pick's sizes
      // are filed under.
      get sizeWord() {
        return Object.keys(this.sizes ?? {}).find((word) => this.sizes[word].id === this.sizeId) ?? '';
      }

      // Look C: the page's size tiles, with their heading row, go to just
      // above the box, and a comment node keeps their place in the buy area.
      lift() {
        const { tiles } = this;
        if (!tiles || this.anchor) return;
        const heading = tiles.previousElementSibling;
        const moved = heading ? [heading, tiles] : [tiles];
        let shown = 0;
        for (const tile of tiles.querySelectorAll('.variant-button')) {
          const off = !this.offered.has(tile.dataset.variantId);
          tile.toggleAttribute('data-fuel09-off', off);
          if (!off) shown += 1;
        }
        this.anchor = document.createComment('fuel09 sizes');
        moved[0].before(this.anchor);
        this.before(...moved);
        for (const node of moved) node.dataset.fuel09Lifted = shown;
        this.lifted = moved;
      }

      lower() {
        if (!this.anchor) return;
        for (const node of this.lifted) delete node.dataset.fuel09Lifted;
        for (const tile of this.tiles.querySelectorAll('[data-fuel09-off]')) tile.removeAttribute('data-fuel09-off');
        this.anchor.before(...this.lifted);
        this.anchor.remove();
        this.anchor = null;
        this.lifted = null;
      }

      // The size the form is on while the box offers it, and the box's
      // opening size otherwise, with the form put on it through its tile.
      settle() {
        const id = this.formSizeId;
        if (this.offered.has(id)) return id;
        const { openId } = this.dataset;
        this.tile(openId)?.click();
        return openId;
      }

      // Brings this.live up to date and does the hand-over when it changed.
      // Returns whether the box is the look on show right now.
      sync() {
        const live =
          document.documentElement.classList.contains(this.dataset.lookClass) && this.getClientRects().length > 0;
        if (live === this.live) return live;
        this.live = live;

        if (live) {
          // The form is the truth about the size: a tile may have been
          // clicked before the look came on.
          const id = this.settle();
          if (this.picker) {
            this.lift();
            // The tiles are on show here, and a browser coming back to the
            // page can bring the form back on one size while the tiles are
            // drawn afresh with another marked. Pressing the form's own
            // tile has the theme mark it.
            this.tile(id)?.click();
          }
          this.showSize(id);
          if (this.picker) this.render();
          this.write();
        } else {
          this.release();
        }
        return live;
      }

      onChange({ target }) {
        const live = this.sync();

        if (target.matches('.fuel09-card__input')) {
          if (live && this.picker) this.render();
          if (live) this.write();
          return;
        }
        if (!target.matches('.fuel09-size__input')) return;

        if (!live) {
          this.showSize(target.value);
          if (this.picker) this.render();
          return;
        }
        const tile = this.tile(target.value);
        if (tile) {
          // The theme's listener on the tile runs inside click(), then the
          // click bubbles to onTileClick, which finishes the job.
          tile.click();
        } else {
          this.showSize(this.settle());
          if (this.picker) this.render();
        }
      }

      onTileClick({ target }) {
        const tile = target.closest('.variant-button');
        if (!tile || !this.sync()) return;
        // No tile of a size the box does not offer is on show while the
        // look is on, so a click on one comes from elsewhere on the page.
        this.showSize(this.offered.has(tile.dataset.variantId) ? tile.dataset.variantId : this.settle());
        if (this.picker) this.render();
        this.write();
      }

      onSubmit(event) {
        if (event.target !== this.form || !this.sync()) return;
        if (!this.picker) {
          this.write();
          if (!this.gift) return;
        }
        // Stopped on the form's parent, in the capture phase, so the theme's
        // own listener on the form never sees this press.
        event.preventDefault();
        event.stopPropagation();
        const empty = this.picker ? this.card?.querySelector('.fuel09-pick__add:not([hidden])') : null;
        if (empty) {
          this.openPicker(empty);
          return;
        }
        this.addOffer(event.submitter ?? this.form.querySelector('[type="submit"]'));
      }

      // The mystery bottles of the open card: which item, under which code,
      // and how many. Null for a card that has none, and while the block
      // does not name both the item and the code.
      get gift() {
        const quantity = Number(this.card?.dataset.mystery) || 0;
        const { mysteryItemId: id, mysteryCode: code } = this.dataset;
        return quantity > 0 && id && code ? { id, code, quantity } : null;
      }

      showSize(variantId) {
        if (!variantId) return;
        this.sizeId = String(variantId);
        for (const input of this.querySelectorAll('.fuel09-size__input')) {
          input.checked = input.value === this.sizeId;
        }
        if (this.picker) {
          // One price per card, written by render(). A chosen scent that
          // does not come in this size leaves its slot.
          const word = this.sizeWord;
          this.picks = this.picks.filter((pick, index) => index === 0 || pick.sizes[word]);
          this.filter(this.picker.querySelector('[data-fuel09-search]')?.value ?? '');
          return;
        }
        for (const price of this.querySelectorAll('.fuel09-card__price')) {
          price.hidden = price.dataset.fuel09Price !== this.sizeId;
        }
        // A card ships free at some sizes and not at others.
        for (const pill of this.querySelectorAll('[data-fuel09-free-sizes]')) {
          pill.hidden = !pill.dataset.fuel09FreeSizes.split(' ').includes(this.sizeId);
        }
      }

      write() {
        const { card, form } = this;
        const price = this.picker
          ? card?.querySelector('.fuel09-card__price')
          : card?.querySelector(`.fuel09-card__price[data-fuel09-price="${CSS.escape(this.sizeId)}"]`);
        if (!form || !card || !price) return;

        const current = form.querySelector('#product-price .current-price');
        if (current) current.textContent = price.dataset.atcPrice;
        if (this.picker) return;

        let quantity = form.querySelector('input[name="quantity"]');
        if (!quantity) {
          quantity = document.createElement('input');
          quantity.type = 'hidden';
          quantity.name = 'quantity';
          quantity.dataset.fuel09Owner = this.id;
          form.append(quantity);
        } else if ('fuel09Owner' in quantity.dataset) {
          // Two looks can sit on one page. The mark says which box last wrote
          // the input, so a look that is leaving does not take away what the
          // look that is arriving has just put there.
          quantity.dataset.fuel09Owner = this.id;
        }
        quantity.value = card.dataset.quantity;
      }

      release() {
        if (this.picker) {
          if (this.picker.open) this.picker.close();
          this.lower();
          this.tile(this.formSizeId)?.click();
          return;
        }
        const quantity = this.form?.querySelector('input[name="quantity"]');
        if (!quantity || quantity.dataset.fuel09Owner !== this.id) return;
        quantity.remove();
        // The theme's own listener repaints the price for the size in the
        // form, strike-through included.
        this.tile(this.formSizeId)?.click();
      }

      /* ---------------------------- look C ---------------------------- */

      // How many bottles the open card holds.
      get capacity() {
        return Number(this.card?.dataset.bottles) || 0;
      }

      onClick({ target }) {
        const open = target.closest('[data-fuel09-open]');
        if (open) {
          this.openPicker(open);
          return;
        }
        const remove = target.closest('[data-fuel09-remove]');
        if (remove) {
          const slot = remove.closest('[data-fuel09-slot]');
          const index = Number(slot.dataset.fuel09Slot);
          if (index > 0) this.picks.splice(index, 1);
          this.render();
          this.write();
          this.card?.querySelector('.fuel09-pick__add:not([hidden])')?.focus({ preventScroll: true });
          return;
        }
        const option = target.closest('[data-fuel09-option]');
        if (option) {
          this.take(option);
          return;
        }
        // A press on the dialog itself is a press on the dimmed page around
        // its panel: the panel fills the dialog's box.
        if (target.closest('[data-fuel09-close]') || target === this.picker) this.picker.close();
      }

      onSearch({ target }) {
        if (target.matches('[data-fuel09-search]')) this.filter(target.value);
      }

      // The slot that opened the picker is hidden once it is filled, so
      // focus goes on to the next empty one, or to the button when none is.
      onPickerClose() {
        const next =
          this.card?.querySelector('.fuel09-pick__add:not([hidden])') ?? this.form?.querySelector('[type="submit"]');
        next?.focus({ preventScroll: true });
      }

      openPicker() {
        if (this.picker.open) return;
        const search = this.picker.querySelector('[data-fuel09-search]');
        if (search?.value) {
          search.value = '';
          this.filter('');
        }
        this.picker.showModal();
        this.loadPool();
      }

      take(option) {
        const sizes = this.readSizes(option.dataset.sizes);
        if (this.picks.length >= this.capacity || !sizes[this.sizeWord]) return;
        this.picks.push({
          product: option.dataset.product,
          sizes,
          short: option.dataset.short ?? '',
          // The row's own picture is already on screen, so the slot shows
          // it at once.
          image: option.querySelector('img')?.currentSrc || option.dataset.image || ''
        });
        this.render();
        this.write();
        if (this.picks.length >= this.capacity) this.picker.close();
      }

      filter(query) {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        // A row is listed only while the perfume comes in the size on show.
        const size = ` ${this.sizeWord}:`;
        let shown = 0;
        for (const option of this.picker.querySelectorAll('[data-fuel09-option]')) {
          const hit =
            ` ${option.dataset.sizes}`.includes(size) && words.every((word) => option.dataset.search.includes(word));
          option.parentElement.hidden = !hit;
          if (hit) shown += 1;
        }
        const none = this.picker.querySelector('[data-fuel09-none]');
        if (none) none.hidden = shown > 0 || !this.loaded;
      }

      // The rows come from sections/fuel09-pool.liquid, one request per
      // collection the block names (and one more per further page of a
      // collection), the first time the picker opens. Each answer's rows go
      // into the list as it arrives, so the first ones are there after one
      // request. A perfume in two of the collections is listed once.
      async loadPool() {
        if (this.pool) return;
        const list = this.picker.querySelector('[data-fuel09-list]');
        const status = this.picker.querySelector('[data-fuel09-status]');
        const search = this.picker.querySelector('[data-fuel09-search]');
        let options = list.querySelector('.fuel09-options');
        if (!options) {
          options = document.createElement('ul');
          options.className = 'fuel09-options';
          options.setAttribute('role', 'list');
          list.append(options);
        }
        const listed = new Set(
          [...options.querySelectorAll('[data-fuel09-option]')].map((option) => option.dataset.product)
        );

        this.pool = (async () => {
          for (const first of (this.dataset.pool ?? '').split(' ').filter(Boolean)) {
            let url = first;
            for (let page = 0; url && page < 10; page += 1) {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`${response.status} ${url}`);
              const html = new DOMParser().parseFromString(await response.text(), 'text/html');
              const rows = [];
              for (const option of html.querySelectorAll('[data-fuel09-option]')) {
                if (listed.has(option.dataset.product)) continue;
                listed.add(option.dataset.product);
                rows.push(document.importNode(option.parentElement, true));
              }
              if (rows.length) {
                options.append(...rows);
                if (status) status.hidden = true;
                this.loaded = true;
                this.filter(search?.value ?? '');
                this.render();
              }
              url = html.querySelector('[data-fuel09-pool]')?.dataset.next ?? '';
            }
          }
          if (!listed.size) throw new Error('empty');
        })();

        try {
          await this.pool;
        } catch (error) {
          // Asked for again the next time the picker opens; rows that did
          // arrive stay, and are not listed twice.
          this.pool = null;
          if (status && !listed.size && this.dataset.errorText) status.textContent = this.dataset.errorText;
        }
      }

      // What a card costs with the picks as they stand. A slot nobody has
      // filled yet counts at the price of the page's own perfume.
      price(card) {
        const bottles = Number(card.dataset.bottles) || 0;
        const paid = Number(card.dataset.paid) || 0;
        const word = this.sizeWord;
        const own = this.picks[0].sizes[word]?.price ?? 0;
        const sum = Array.from({ length: bottles }, (_, index) => this.picks[index]?.sizes[word]?.price ?? own)
          .sort((a, b) => b - a)
          .slice(0, paid)
          .reduce((total, price) => total + price, 0);
        const shipping = Number(this.dataset.shipping) || 0;
        const free = shipping === 0 || sum >= (Number(this.dataset.freeFrom) || 0);
        return { shown: free ? sum : sum + shipping, free, bottles };
      }

      // The shop's own money format, so these read like the figures Liquid
      // printed; trimmed is the money_without_trailing_zeros filter.
      money(cents, trimmed = false) {
        const amount = Math.round(Number(cents) || 0);
        const whole = String(Math.floor(amount / 100));
        const rest = String(amount % 100).padStart(2, '0');
        const grouped = (separator) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
        const cut = trimmed && rest === '00';
        const forms = {
          amount: cut ? grouped(',') : `${grouped(',')}.${rest}`,
          amount_no_decimals: grouped(','),
          amount_with_comma_separator: cut ? grouped('.') : `${grouped('.')},${rest}`,
          amount_no_decimals_with_comma_separator: grouped('.'),
          amount_with_space_separator: cut ? grouped(' ') : `${grouped(' ')},${rest}`,
          amount_no_decimals_with_space_separator: grouped(' '),
          amount_with_apostrophe_separator: cut ? grouped("'") : `${grouped("'")}.${rest}`
        };
        return (this.dataset.moneyFormat || '{{amount}}').replace(
          /\{\{\s*(\w+)\s*\}\}/g,
          (match, key) => forms[key] ?? forms.amount
        );
      }

      // Brings every card's slots, counter and price, and the picker's own
      // counter and marks, up to date with the picks.
      render() {
        const leftLine = (left) =>
          left > 0 ? (this.dataset.leftText ?? '').replace('[n]', left) : this.dataset.doneText ?? '';

        for (const card of this.querySelectorAll('.fuel09-card')) {
          const slots = card.querySelectorAll('[data-fuel09-slot]');
          slots.forEach((slot, index) => {
            // The first slot is the page's own perfume, as Liquid printed it.
            if (index === 0) return;
            const pick = this.picks[index];
            const set = slot.querySelector('.fuel09-pick__set');
            slot.classList.toggle('fuel09-pick--set', Boolean(pick));
            slot.querySelector('.fuel09-pick__add').hidden = Boolean(pick);
            set.hidden = !pick;
            if (!pick) return;
            const image = set.querySelector('.fuel09-pick__image');
            image.hidden = !pick.image;
            image.loading = 'eager';
            if (pick.image && image.getAttribute('src') !== pick.image) image.src = pick.image;
            set.querySelector('[data-fuel09-name]').textContent = pick.short;
            const remove = set.querySelector('[data-fuel09-remove]');
            remove.setAttribute('aria-label', remove.dataset.label.replace('[name]', pick.short).trim());
          });

          const left = card.querySelector('[data-fuel09-left]');
          if (left) left.textContent = leftLine(Math.max(slots.length - this.picks.length, 0));

          const { shown, free, bottles } = this.price(card);
          const price = card.querySelector('.fuel09-card__price');
          if (price) {
            price.dataset.atcPrice = this.money(shown);
            const total = price.querySelector('[data-fuel09-total]');
            if (total) total.textContent = this.money(shown, true);
            const per = price.querySelector('[data-fuel09-per]');
            if (per && bottles > 0) {
              per.textContent = (this.dataset.perBottleText ?? '').replace(
                '[price]',
                this.money(Math.round(shown / bottles), true)
              );
            }
          }
          const pill = card.querySelector('[data-fuel09-free-pill]');
          if (pill) pill.hidden = !free;
        }

        const chosen = this.picks.slice(0, this.capacity);
        const left = this.picker.querySelector('[data-fuel09-left]');
        if (left) left.textContent = leftLine(Math.max(this.capacity - chosen.length, 0));
        for (const option of this.picker.querySelectorAll('[data-fuel09-option]')) {
          const count = chosen.filter((pick) => pick.product === option.dataset.product).length;
          option.classList.toggle('fuel09-option--in', count > 0);
          const mark = option.querySelector('.fuel09-option__mark');
          if (mark) mark.textContent = count > 0 ? count : '';
        }
      }

      // The card's discount code, then the bottles of the open card, then the
      // theme's own cart drawer. Look C adds one line per perfume under the
      // card's own code. Looks A and B come here for a card with mystery
      // bottles and add the page's perfume and the mystery item under the
      // mystery code. The cart page is the way out wherever the drawer or its
      // markup is missing.
      async addOffer(button) {
        if (this.busy) return;
        const { card } = this;
        if (!card) return;
        const gift = this.picker ? null : this.gift;
        this.busy = true;

        const spinner = this.host?.querySelector('.loading__spinner');
        this.host?.handleErrorMessage?.();
        button?.setAttribute('aria-disabled', 'true');
        button?.classList.add('loading');
        spinner?.classList.remove('hidden');

        const post = async (url, body) => {
          const response = await fetch(`${url}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await response.json();
          if (!response.ok) throw data;
          return data;
        };

        const readCart = async () => (await fetch(`${window.routes.cart_url}.js`, { cache: 'no-store' })).json();
        const code = gift ? gift.code : card.dataset.code;
        const listed = (cart) =>
          (cart.discount_codes ?? []).some(({ code: other }) => String(other).toLowerCase() === code.toLowerCase());
        // The two marks the mystery bottle travels with. The gift app takes
        // the code only on a cart that carries the first; the second tells
        // snippets/fuel09-global.liquid, on whatever page the shopper goes
        // to next, which line is the bottle and which code frees it.
        const marks = gift ? { _fuel09: 'on', _fuel09_gift: `${gift.id}:${gift.code}` } : null;
        // Codes already on the cart are sent back with the card's own: the
        // cart keeps only the list it is given. The other cards' codes of
        // this box are left out, one offer at a time.
        const setCode = async (cart) => {
          const own = new Set(
            [...this.querySelectorAll('.fuel09-card')].map((other) => other.dataset.code?.toLowerCase()).filter(Boolean)
          );
          const codes = new Set();
          for (const { code: other } of (cart ?? (await readCart())).discount_codes ?? []) {
            if (!own.has(String(other).toLowerCase())) codes.add(other);
          }
          codes.add(code);
          await post(window.routes.cart_update_url, {
            discount: [...codes].join(','),
            ...(marks ? { attributes: marks } : {})
          });
        };
        const drawer = document.querySelector('cart-drawer');
        const draw = async () => {
          if (!drawer || typeof drawer.renderContents !== 'function') return false;
          // No Accept header: asked for JSON, some addresses answer with
          // their own data instead of the sections.
          const response = await fetch(`${window.location.pathname}?sections=cart-drawer,cart-icon-bubble`, {
            cache: 'no-store'
          });
          const sections = response.ok ? await response.json() : null;
          if (!sections?.['cart-drawer'] || !sections['cart-icon-bubble']) return false;
          drawer.setActiveElement(button);
          // Said the way the theme's own add button says it, and at the same
          // moment, just before the drawer is drawn. On this word the drawer
          // fetches its lines and its foot once more, and the store's other
          // scripts are timed against that second draw following an add: the
          // membership chooser's first-open step lands on a live button
          // without it and puts a membership in the cart.
          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS === 'object') {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: 'fuel09-offer' });
          }
          drawer.renderContents({ sections });
          drawer.classList.remove('is-empty');
          return true;
        };

        try {
          // The code goes on before the bottles. The store's other apps
          // rewrite every new line right after an add, and a code set in
          // the middle of that is lost to whichever of their requests saves
          // last. Set on a quiet cart it waits there and takes hold as the
          // bottles land.
          // The script that looks after the bottle in the cart stands back
          // from here until the add is through (finally, below).
          if (gift) document.dispatchEvent(new CustomEvent('fuel09:adding'));
          const before = code ? await readCart() : null;
          if (code) await setCode(before);

          const counts = new Map();
          if (gift) {
            counts.set(this.formSizeId, Number(card.dataset.quantity) || 1);
            // The box never gives more mystery bottles than its largest
            // card does, however many times a card is added: the ones
            // already in the cart count.
            const most = Math.max(
              ...[...this.querySelectorAll('.fuel09-card')].map((other) => Number(other.dataset.mystery) || 0)
            );
            const held = (before?.items ?? [])
              .filter((item) => String(item.variant_id) === gift.id)
              .reduce((sum, item) => sum + item.quantity, 0);
            const more = Math.min(gift.quantity, most - held);
            if (more > 0) counts.set(gift.id, more);
          } else {
            const word = this.sizeWord;
            for (const { sizes } of this.picks.slice(0, this.capacity)) {
              const { id } = sizes[word];
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          }
          await post(window.routes.cart_add_url, {
            items: [...counts].map(([id, quantity]) => ({ id: Number(id), quantity }))
          });

          // One look after the add all the same, and one more once those
          // apps have had their turn, for a write of theirs that was already
          // under way when the code went on. The second puts the code back
          // and draws an open drawer again; it runs once, and not at all
          // when the shopper has moved on to another card by then.
          if (code && !listed(await readCart())) await setCode();
          // Look C only: the mystery bottle has snippets/fuel09-global.liquid
          // looking after its code from here, and it may well have taken the
          // bottle and the code out again by then.
          if (code && !gift) {
            window.setTimeout(async () => {
              try {
                if (this.busy || this.card !== card || listed(await readCart())) return;
                await setCode();
                if (drawer?.classList.contains('active')) await draw();
              } catch (error) {
                // The cart page and the checkout price the cart themselves.
              }
            }, 5000);
          }

          if (await draw()) return;
          window.location.href = window.routes.cart_url;
        } catch (error) {
          // The store's own text (sold out, for one) where there is one.
          this.host?.handleErrorMessage?.(error?.description || error?.message || this.dataset.errorText);
        } finally {
          this.busy = false;
          if (gift) document.dispatchEvent(new CustomEvent('fuel09:gift'));
          button?.removeAttribute('aria-disabled');
          button?.classList.remove('loading');
          spinner?.classList.add('hidden');
        }
      }
    }
  );
}
