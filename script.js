/* ================================================
   ENGAGEMENT INVITATION — ANIMATION ORCHESTRATOR
   Handles image preloading, screen transitions,
   animation sequencing, and multi-layer parallax scroll.
   ================================================ */

(function () {
  'use strict';

  // ---- Configuration ----
  const LOADING_ANIM_START_DELAY = 100;
  const LOADING_DURATION = 3400;
  const FADE_OUT_DURATION = 700;
  const WELCOME_START_DELAY = 200;

  // ---- Elements ----
  const loadingScreen = document.getElementById('loading');
  const welcomeScreen = document.getElementById('welcome');
  const topDecoration = document.getElementById('topDecoration');
  const welcomeTextArea = document.getElementById('welcomeTextArea');
  const centerMotif = document.getElementById('centerMotif');
  const centerMotifImg = centerMotif ? centerMotif.querySelector('.motif-img') : null;
  const welcomeGhat = document.getElementById('welcomeGhat');
  const scrollPill = document.getElementById('scrollPill');
  const detailsScreen = document.getElementById('detailsScreen');

  // ---- Critical images to preload ----
  const criticalImages = [
    'assets/ganesh_text.png',
    'assets/flower_lily.png',
    'assets/flower_daisy.png',
    'assets/flower_rose.png',
    'assets/top_border.png',
    'assets/top_floral_garland.webp',
    'assets/bouquet_corner_left.png',
    'assets/bouquet_corner_right.png',
    'assets/banana_leaf_left.png',
    'assets/banana_leaf_right.png',
    'assets/center_motif.png',
    'assets/ghat_illustration.webp'
  ];

  /**
   * Preload all critical images and resolve when done.
   */
  function preloadImages(srcs, timeoutMs) {
    return new Promise(function (resolve) {
      var loaded = 0;
      var total = srcs.length;
      var resolved = false;

      function done() {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }

      setTimeout(done, timeoutMs || 5000);

      srcs.forEach(function (src) {
        var img = new Image();
        img.onload = img.onerror = function () {
          loaded++;
          if (loaded >= total) {
            done();
          }
        };
        img.src = src;
      });
    });
  }

  /**
   * Start the loading screen entrance animations.
   */
  function startLoadingAnimations() {
    loadingScreen.classList.add('animate');
  }

  /**
   * Fade out the loading screen and transition to welcome.
   */
  function transitionToWelcome() {
    loadingScreen.classList.add('fade-out');

    setTimeout(function () {
      loadingScreen.style.display = 'none';

      setTimeout(function () {
        if (welcomeScreen) welcomeScreen.classList.add('animate');
        initParallaxScroll();
      }, WELCOME_START_DELAY);
    }, FADE_OUT_DURATION);
  }

  /**
   * Multi-Layer Depth Parallax Scroll Controller
   * 
   * As the user scrolls down, layers in the hero section move at distinct speeds:
   * - Top Decoration: -0.35x
   * - Text Area: -0.55x (moves faster for depth)
   * - Ghat Illustration: -0.20x (moves slower in background)
   * - Scroll Indicator: fades out smoothly
   */
  function initParallaxScroll() {
    let ticking = false;

    function updateParallax() {
      const scrollY = window.scrollY || window.pageYOffset;

      if (scrollY <= 800) {
        // Multi-speed parallax translations
        // Welcome screen is pinned (sticky) while the date page opens over it,
        // so keep the drift subtle — the arch reveal supplies the depth.
        if (topDecoration) {
          topDecoration.style.transform = `translate3d(0, ${-0.08 * scrollY}px, 0)`;
        }
        var textFade = Math.max(0, 1 - scrollY / 500);
        if (welcomeTextArea) {
          welcomeTextArea.style.transform = `translate3d(0, ${-0.12 * scrollY}px, 0)`;
          welcomeTextArea.style.opacity = `${textFade}`;
        }
        // Motif travels with the text. Its entrance keyframes own `transform`/`opacity`
        // on the wrapper, so use the independent `translate` property + the inner image.
        if (centerMotif) {
          centerMotif.style.translate = `0 ${-0.12 * scrollY}px`;
          if (centerMotifImg) centerMotifImg.style.opacity = `${textFade}`;
        }
        if (welcomeGhat) {
          welcomeGhat.style.transform = `translate3d(0, ${0.04 * scrollY}px, 0)`;
        }
        // Fade the pill itself — the wrapper's entrance keyframes own its opacity
        if (scrollPill) {
          var pillFade = Math.max(0, 1 - scrollY / 120);
          scrollPill.style.opacity = `${pillFade}`;
          scrollPill.style.pointerEvents = pillFade < 0.1 ? 'none' : '';
        }
      }

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    updateParallax(); // Initial check
  }

  /**
   * Reveal details/venue elements as they scroll into view.
   * Elements entering together are staggered by 90ms.
   */
  function initScrollReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; });
      visible.forEach(function (entry, i) {
        entry.target.style.transitionDelay = (i * 90) + 'ms';
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { observer.observe(el); });
  }

  /**
   * Date page "temple door" reveal, tied to scroll position.
   *
   * p goes 0 → 1 while the arch slides up over the welcome screen:
   * - the arch clip opens from a narrow doorway to the full page (CSS --p)
   * - the welcome screen recedes and dims beneath it (CSS --cover)
   * - once mostly open, the text choreography plays; it resets when the
   *   arch has fully left the viewport so it replays on the next pass.
   */
  function initArchReveal() {
    var arch = document.getElementById('detailsArch');
    if (!arch) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      arch.classList.add('is-opening', 'is-revealed');
      return;
    }

    var ticking = false;

    function update() {
      var vh = window.innerHeight;
      var top = arch.getBoundingClientRect().top;
      var p = Math.min(1, Math.max(0, (vh - top) / (vh * 0.85)));
      var eased = p * p * (3 - 2 * p); // smoothstep

      arch.style.setProperty('--p', eased.toFixed(4));
      if (welcomeScreen) welcomeScreen.style.setProperty('--cover', eased.toFixed(4));

      // Leaves sweep in with the opening arch; the text waits until the
      // page has settled in place (arch top at the viewport top).
      if (p >= 0.6) {
        arch.classList.add('is-opening');
      }
      // On very tall screens the page can't scroll the arch all the way to the
      // top, so "scrolled to the bottom" also counts as settled.
      var maxScroll = document.documentElement.scrollHeight - vh;
      if (top <= 2 || window.scrollY >= maxScroll - 2) {
        arch.classList.add('is-revealed');
      }
      if (p <= 0.02) {
        arch.classList.remove('is-opening', 'is-revealed');
      }
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /**
   * Auto-advance between the hero and the date page.
   *
   * The zone between the top of the page and the arch is treated as a
   * transition, not a resting place: once the user scrolls down past
   * SNAP_THRESHOLD the page glides the rest of the way to the date page
   * (completing the arch reveal); scrolling back up into the zone glides
   * back to the hero. User input is held off while a glide is running.
   */
  var SNAP_THRESHOLD = 60;       // px of user scroll before auto-advancing
  var SNAP_DURATION = 1200;      // ms

  function initAutoAdvance() {
    var arch = document.getElementById('detailsArch');
    if (!arch) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var animating = false;
    var lastY = window.scrollY;

    // Where the date page rests: arch at the viewport top, or as far as the
    // page can scroll on screens too tall for that.
    function archTop() {
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      return Math.min(arch.getBoundingClientRect().top + window.scrollY, maxScroll);
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function glideTo(target) {
      var start = window.scrollY;
      var distance = target - start;
      if (Math.abs(distance) < 2) return;

      if (reduceMotion) {
        window.scrollTo(0, target);
        lastY = target;
        return;
      }

      animating = true;
      var t0 = null;

      function step(now) {
        if (t0 === null) t0 = now;
        var t = Math.min(1, (now - t0) / SNAP_DURATION);
        window.scrollTo(0, start + distance * easeInOutCubic(t));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          lastY = window.scrollY;
          // Let trailing momentum/wheel events settle before re-arming
          setTimeout(function () { animating = false; lastY = window.scrollY; }, 150);
        }
      }
      requestAnimationFrame(step);
    }

    // Hold off wheel/touch/keys while gliding so input doesn't fight the animation
    function block(e) {
      if (animating) e.preventDefault();
    }
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (animating && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].indexOf(e.key) !== -1) {
        e.preventDefault();
      }
    });

    // The "Scroll" pill on the hero glides straight to the date page
    if (scrollPill) {
      scrollPill.addEventListener('click', function () {
        if (!animating) glideTo(archTop());
      });
    }

    window.addEventListener('scroll', function () {
      if (animating) return;
      var y = window.scrollY;
      var target = archTop();
      var goingDown = y > lastY;
      lastY = y;

      if (y <= 0 || y >= target) return; // outside the transition zone

      if (goingDown && y >= SNAP_THRESHOLD) {
        glideTo(target);
      } else if (!goingDown && y <= target - SNAP_THRESHOLD) {
        glideTo(0);
      }
    }, { passive: true });
  }

  /**
   * Main initialization — runs after DOM is ready.
   */
  function init() {
    initArchReveal();
    initAutoAdvance();
    initScrollReveal();
    preloadImages(criticalImages, 4000).then(function () {
      setTimeout(function () {
        startLoadingAnimations();
        setTimeout(transitionToWelcome, LOADING_DURATION);
      }, LOADING_ANIM_START_DELAY);
    });
  }

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
