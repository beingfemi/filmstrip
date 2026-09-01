/* Filmstrip — scrolling behaviour, blur-up loading, and the fullscreen viewer.
   The gallery markup is already in the HTML; nothing here is required to see
   the photos, it just makes moving through them nicer. */
(() => {
  const strip = document.querySelector('.strip');
  const panes = [...document.querySelectorAll('.pane--photo')];
  const progress = document.querySelector('.progress');
  const intro = document.querySelector('.pane--intro');
  if (!strip || !panes.length) return;

  const horizontal = () => getComputedStyle(document.body).overflowX !== 'visible';
  const scroller = document.body;

  /* --- blur-up: swap in the real file once it has decoded ------------- */

  for (const img of document.querySelectorAll('.frame img')) {
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  }

  /* --- scroll position: progress bar + the intro's slow drift --------- */

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const wide = horizontal();
      const pos = wide ? scroller.scrollLeft : window.scrollY;
      const span = wide
        ? scroller.scrollWidth - scroller.clientWidth
        : document.documentElement.scrollHeight - window.innerHeight;

      progress.style.setProperty('--progress', span > 0 ? (pos / span).toFixed(4) : 0);
      // 0 → 1 over the first 400px, so the intro settles rather than sliding forever
      intro.style.setProperty('--drift', Math.min(pos / 400, 1).toFixed(3));
    });
  }
  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* --- a vertical wheel should walk along the strip ------------------- */

  scroller.addEventListener(
    'wheel',
    (e) => {
      if (!horizontal() || e.ctrlKey) return;
      // Leave real horizontal gestures (trackpad swipes) to the browser.
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      scroller.scrollBy({ left: e.deltaY, behavior: 'auto' });
    },
    { passive: false }
  );

  /* --- keyboard ------------------------------------------------------- */

  /** Index of the photo nearest the left edge of the viewport. */
  function currentIndex() {
    const edge = horizontal() ? scroller.scrollLeft : window.scrollY;
    let best = 0;
    let bestDist = Infinity;
    panes.forEach((pane, i) => {
      const at = horizontal() ? pane.offsetLeft : pane.offsetTop;
      const dist = Math.abs(at - edge);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  function goTo(index) {
    const pane = panes[Math.max(0, Math.min(index, panes.length - 1))];
    if (!pane) return;
    pane.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'start' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.altKey || e.ctrlKey) return;
    if (lightbox.hasAttribute('hidden')) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex() + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex() - 1); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(panes.length - 1); }
      return;
    }
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight') showInViewer(viewerIndex + 1);
    else if (e.key === 'ArrowLeft') showInViewer(viewerIndex - 1);
  });

  /* --- fullscreen viewer ---------------------------------------------- */

  const lightbox = document.querySelector('.lightbox');
  const viewerImg = lightbox.querySelector('img');
  const viewerCaption = lightbox.querySelector('.caption');
  let viewerIndex = 0;
  let lastFocus = null;

  function showInViewer(index) {
    viewerIndex = (index + panes.length) % panes.length;
    const pane = panes[viewerIndex];
    const img = pane.querySelector('img');
    const caption = pane.querySelector('.caption');
    // The srcset's widest entry is the best copy we have.
    const widest = (img.getAttribute('srcset') || '')
      .split(',')
      .map((s) => s.trim().split(' ')[0])
      .pop();
    viewerImg.src = widest || img.currentSrc || img.src;
    viewerImg.alt = img.alt;
    viewerCaption.innerHTML = caption ? caption.innerHTML : '';
  }

  function openViewer(index) {
    lastFocus = document.activeElement;
    showInViewer(index);
    lightbox.removeAttribute('hidden');
    requestAnimationFrame(() => lightbox.classList.add('is-open'));
    lightbox.querySelector('.lightbox__close').focus();
    document.documentElement.style.overflow = 'hidden';
  }

  function closeViewer() {
    lightbox.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    setTimeout(() => lightbox.setAttribute('hidden', ''), 250);
    // Line the strip up with whatever you were just looking at.
    goTo(viewerIndex);
    lastFocus?.focus();
  }

  panes.forEach((pane, i) => {
    pane.querySelector('.frame')?.addEventListener('click', () => openViewer(i));
  });

  lightbox.querySelector('.lightbox__close').addEventListener('click', closeViewer);
  lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', () => showInViewer(viewerIndex - 1));
  lightbox.querySelector('.lightbox__nav--next').addEventListener('click', () => showInViewer(viewerIndex + 1));
  viewerImg.addEventListener('click', closeViewer);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeViewer(); });
})();
