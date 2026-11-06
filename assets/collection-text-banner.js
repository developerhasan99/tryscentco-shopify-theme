document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.collection-text-banner-section .collection-text-banner__toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const fullDescription = document.getElementById(button.getAttribute('aria-controls'));
      const preview = button.parentElement.querySelector('.collection-text-banner__preview');
      const moreLabel = button.querySelector('.collection-text-banner__more');
      const lessLabel = button.querySelector('.collection-text-banner__less');
      const expanded = button.getAttribute('aria-expanded') === 'true';

      button.setAttribute('aria-expanded', String(!expanded));
      fullDescription.hidden = expanded;
      preview.hidden = !expanded;
      moreLabel.hidden = !expanded;
      lessLabel.hidden = expanded;
    });
  });
});
