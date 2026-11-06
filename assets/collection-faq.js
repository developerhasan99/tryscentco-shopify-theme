(() => {
  const sections = document.querySelectorAll('.collection-faq-section');

  sections.forEach((section) => {
    if (section.dataset.faqInitialized === 'true') return;
    section.dataset.faqInitialized = 'true';

    const buttons = [...section.querySelectorAll('.collection-faq__question')];
    const animations = new WeakMap();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;

    const setExpanded = (button, expanded) => {
      const panel = section.querySelector(`#${CSS.escape(button.getAttribute('aria-controls'))}`);
      if (!panel || (button.getAttribute('aria-expanded') === 'true') === expanded) return;

      const currentHeight = panel.hidden ? 0 : panel.getBoundingClientRect().height;
      const currentOpacity = panel.hidden ? 0 : Number.parseFloat(getComputedStyle(panel).opacity);
      animations.get(panel)?.cancel();

      button.setAttribute('aria-expanded', String(expanded));
      panel.hidden = false;

      const animation = panel.animate(
        [
          { height: `${currentHeight}px`, opacity: currentOpacity },
          { height: `${expanded ? panel.scrollHeight : 0}px`, opacity: expanded ? 1 : 0 },
        ],
        { duration, easing: 'ease' }
      );
      animations.set(panel, animation);

      animation.onfinish = () => {
        if (animations.get(panel) !== animation) return;
        animations.delete(panel);

        if (expanded) {
          panel.style.height = 'auto';
          panel.style.opacity = '1';
        } else {
          panel.hidden = true;
          panel.style.removeProperty('height');
          panel.style.removeProperty('opacity');
        }
      };
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-expanded') === 'true') {
          setExpanded(button, false);
          return;
        }

        buttons.forEach((otherButton) => {
          if (otherButton !== button) setExpanded(otherButton, false);
        });
        setExpanded(button, true);
      });
    });
  });
})();
