/* Filmstrip — the whole interaction layer.

   Two jobs:
   1. Let a vertical wheel/trackpad gesture walk along the horizontal strip.
      We add deltaY to scrollLeft *without* preventing the default, so this
      movement lands on top of the browser's own vertical-to-horizontal
      mapping. The doubling is deliberate — one notch of the wheel should
      cover ground — and not preventing the default keeps native inertia.
   2. Publish the scroll position as --scroll-delta so CSS can drift the
      intro pane upward and fade it out as you move away from it. */
(() => {
  const scroller = document.body;
  const intro = document.querySelector('.pane--intro');
  const FADE_OVER = 300; // px of sideways scroll; matches the CSS

  const publish = () => {
    const x = scroller.scrollLeft;
    scroller.style.setProperty('--scroll-delta', String(x));
    // Once it's invisible, stop it swallowing clicks meant for the photos.
    if (intro) intro.classList.toggle('is-gone', x >= FADE_OVER);
  };

  publish();

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // pinch-zoom, not a scroll
      scroller.scrollLeft += event.deltaY;
      publish();
    },
    { passive: true }
  );

  // Keeps the variable honest for scrollbar drags, touch and keyboard scrolling.
  scroller.addEventListener('scroll', publish, { passive: true });

  // Photos fade up out of their placeholder once decoded.
  for (const img of document.querySelectorAll('.frame img')) {
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  }
})();
