/* pm-base.js (WP-A): shared money formatter. Reads window.pmMoneyFormat /
   window.pmMoneyWithCurrencyFormat (set in layout/theme.liquid before this
   file runs) and mirrors Shopify's formatMoney placeholder handling.
   window.pmMoney(cents, withCurrency = false) -> string, e.g. pmMoney(3999) -> "$39.99" */
(function () {
  'use strict';

  function withDelimiters(number, precision, thousands, decimal) {
    var fixed = (number / 100).toFixed(precision);
    var parts = fixed.split('.');
    var sign = parts[0].charAt(0) === '-' ? '-' : '';
    var whole = sign ? parts[0].slice(1) : parts[0];
    whole = whole.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + thousands);
    var fraction = precision > 0 && parts[1] ? decimal + parts[1] : '';
    return sign + whole + fraction;
  }

  function toCents(value) {
    if (typeof value === 'string') value = value.replace(/[^0-9.\-]/g, '');
    var number = Number(value);
    return isFinite(number) ? number : 0;
  }

  function pmMoney(cents, withCurrency) {
    var format = withCurrency ? window.pmMoneyWithCurrencyFormat : window.pmMoneyFormat;
    if (typeof format !== 'string' || format === '') format = '${{amount}}';
    var placeholder = /\{\{\s*(\w+)\s*\}\}/;
    var match = format.match(placeholder);
    var type = match ? match[1] : 'amount';
    var value = toCents(cents);
    var negative = value < 0;
    if (negative) value = Math.abs(value);
    var out;

    switch (type) {
      case 'amount_no_decimals':
        out = withDelimiters(value, 0, ',', '.');
        break;
      case 'amount_with_comma_separator':
        out = withDelimiters(value, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        out = withDelimiters(value, 0, '.', ',');
        break;
      case 'amount_with_apostrophe_separator':
        out = withDelimiters(value, 2, "'", '.');
        break;
      case 'amount_no_decimals_with_space_separator':
        out = withDelimiters(value, 0, ' ', '.');
        break;
      case 'amount_with_space_separator':
        out = withDelimiters(value, 2, ' ', ',');
        break;
      case 'amount_with_period_and_space_separator':
        out = withDelimiters(value, 2, ' ', '.');
        break;
      default:
        out = withDelimiters(value, 2, ',', '.');
    }

    var result = match ? format.replace(placeholder, out) : out;
    return negative ? '-' + result : result;
  }

  window.pmMoney = pmMoney;
})();
