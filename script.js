/* ================================================
   ENGAGEMENT INVITATION — ANIMATION ORCHESTRATOR
   Handles image preloading, screen transitions,
   animation sequencing, and multi-layer parallax scroll.
   ================================================ */

(function () {
  'use strict';

  // ---- Configuration ----
  const LOADING_ANIM_START_DELAY = 100;
  const PROMPT_DELAY = 2400;
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
    'assets/door_frame.webp',
    'assets/door_left.webp',
    'assets/door_right.webp',
    'assets/top_floral_garland.webp?v=2026-09-28k',
    'assets/bouquet_corner_left.png?v=2026-09-28k',
    'assets/bouquet_corner_right.png?v=2026-09-28k',
    'assets/banana_leaf_left.png?v=2026-09-28k',
    'assets/banana_leaf_right.png?v=2026-09-28k',
    'assets/center_motif.png?v=2026-09-28k',
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
    var doors = document.getElementById('doorIntro');
    if (doors) doors.classList.add('is-done');
    loadingScreen.classList.add('fade-out');

    setTimeout(function () {
      loadingScreen.style.display = 'none';

      setTimeout(function () {
        if (welcomeScreen) welcomeScreen.classList.add('animate');
      }, WELCOME_START_DELAY);
    }, FADE_OUT_DURATION);
  }

  /**
   * Intro: Ganapati loader → closed doors + "Tap to open" → doors swing open
   * into the video (with sound) → hero.
   *
   * The video's last frame is the hero's ghat illustration, zoomed in: the art
   * sits at 142.59% of the video width, 21.30% off its left edge, top-aligned
   * (measured by aligning the two images). The video is scaled and placed so
   * that art lands exactly on the hero's ghat image; at the end the hero ghat
   * appears underneath the identical last frame and the video fades away.
   */
  var INTRO_ART = { width: 1.4259, left: -0.2130, top: 0.0013 };
  var introStarted = false;
  var introFinished = false;

  // Native scrolling is off during the intro and on the hero (the page turn
  // to the date page is gesture-driven); it's only on for the details pages.
  function lockScroll(on) {
    document.documentElement.classList.toggle('scroll-lock', on);
  }

  // Loader fades away to reveal the closed doors, then "Tap to open" appears
  function showOpenPrompt() {
    var doors = document.getElementById('doorIntro');
    var btn = document.getElementById('openInvite');
    var video = document.getElementById('introPlayer');
    if (!doors || !btn || !video || video.error) {
      transitionToWelcome();
      return;
    }

    loadingScreen.classList.add('fade-out');
    setTimeout(function () {
      loadingScreen.style.display = 'none';
      btn.classList.add('is-ready');
      btn.focus({ preventScroll: true });
    }, FADE_OUT_DURATION);

    // Tapping anywhere on the doors opens them too (bigger target)
    doors.addEventListener('click', startIntro);
  }

  function startIntro() {
    if (introStarted) return;
    introStarted = true;

    var section = document.getElementById('introVideo');
    var video = document.getElementById('introPlayer');
    var skip = document.getElementById('introSkip');

    // Lay the hero out at rest (hidden) so the video can be aligned to its ghat
    welcomeScreen.classList.add('from-video');
    layoutIntroVideo();
    window.addEventListener('resize', layoutIntroVideo);
    video.addEventListener('loadedmetadata', layoutIntroVideo);

    section.classList.add('is-playing');
    video.muted = false;

    // play() must be called inside the tap handler for sound to be allowed
    var playing = video.play();
    startIntroRender();
    if (playing && playing.catch) {
      playing.catch(function () {
        video.muted = true; // sound refused: still show the video
        video.play().catch(function () { finishIntro(false); });
      });
    }

    // Doors swing open, the camera walks through, and the doorway fades into the video
    var doors = document.getElementById('doorIntro');
    doors.classList.add('is-open');
    setTimeout(function () { doors.classList.add('is-done'); }, 2300);

    video.addEventListener('ended', function () { finishIntro(true); });
    video.addEventListener('error', function () { finishIntro(false); });
    skip.addEventListener('click', function () { finishIntro(false); });

    // Safety net: if playback never gets going (slow network), don't strand the guest
    var watchdog = setTimeout(function () {
      if (video.currentTime < 0.2) finishIntro(false);
    }, 7000);
    video.addEventListener('playing', function () { clearTimeout(watchdog); }, { once: true });
  }

  /**
   * Hand the screen over from the video to the hero.
   * matched = true when the video reached its last frame (so the ghat can take
   * over pixel-for-pixel); false for Skip / errors (plain cross-fade).
   */
  function finishIntro(matched) {
    if (introFinished) return;
    introFinished = true;

    var section = document.getElementById('introVideo');
    var video = document.getElementById('introPlayer');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!matched) video.pause();
    loadingScreen.style.display = 'none';
    window.removeEventListener('resize', layoutIntroVideo);
    welcomeScreen.classList.add('from-video');

    // 1. Show the hero ghat underneath the video. The video's last frame is the
    //    same image at the same size and position, so nothing visibly changes.
    welcomeScreen.classList.add('ghat-in');

    // Clouds aren't in the video: let them drift in after the hand-off
    if (!reduceMotion) {
      document.querySelectorAll('.welcome-ghat .cloud-item').forEach(function (cloud) {
        cloud.animate([{ opacity: 0 }, { opacity: getComputedStyle(cloud).opacity }],
          { duration: 900, delay: 1200, easing: 'ease-out', fill: 'backwards' });
      });
    }

    // 2. Fade the video away over it, while the garland, motif, names and
    //    Scroll pill play their usual entrance around it.
    setTimeout(function () {
      welcomeScreen.classList.add('animate');
      section.classList.add('is-fading');
    }, matched ? 350 : 0);

    setTimeout(function () {
      section.classList.add('is-done');
      video.pause();
      video.removeAttribute('src');
    }, (matched ? 350 : 0) + 950);
  }

  /**
   * Transparent-sky intro video.
   *
   * intro_alpha.mp4 is 720x2560: the picture in the top half and a sky mask
   * (white = keep, black = sky) in the bottom half, pre-computed per frame. A
   * tiny WebGL shader combines them into a transparent frame on the canvas, so
   * the parchment sky disappears into the page's cream (works on iOS Safari,
   * which can't play transparent WebM). Without WebGL the plain intro.mp4 plays.
   */
  var introGL = null;

  function setupIntroVideo() {
    var section = document.getElementById('introVideo');
    var video = document.getElementById('introPlayer');
    var canvas = document.getElementById('introCanvas');
    if (!section || !video) return;

    var gl = null;
    try {
      gl = canvas && canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    } catch (e) { gl = null; }

    if (gl) {
      var vs = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
      var fs = 'precision mediump float; uniform sampler2D t; varying vec2 v;' +
        'void main(){ vec3 c = texture2D(t, vec2(v.x, v.y * 0.5)).rgb;' +
        ' float a = texture2D(t, vec2(v.x, 0.5 + v.y * 0.5)).r;' +
        ' gl_FragColor = vec4(c * a, a); }';
      function shader(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      }
      var prog = gl.createProgram();
      var v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
      if (v && f) {
        gl.attachShader(prog, v);
        gl.attachShader(prog, f);
        gl.linkProgram(prog);
      }
      if (v && f && gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.clearColor(0, 0, 0, 0);
        introGL = { gl: gl, canvas: canvas };
      }
    }

    video.src = introGL ? 'assets/intro_alpha.mp4' : 'assets/intro.mp4';
    section.classList.toggle('has-alpha', !!introGL);
    video.load();
  }

  function drawIntroFrame() {
    var video = document.getElementById('introPlayer');
    if (!introGL || video.readyState < 2) return;
    var gl = introGL.gl;
    gl.viewport(0, 0, introGL.canvas.width, introGL.canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function startIntroRender() {
    var video = document.getElementById('introPlayer');
    if (!introGL) return;
    if (video.requestVideoFrameCallback) {
      (function onFrame() {
        drawIntroFrame();
        video.requestVideoFrameCallback(onFrame);
      })();
    } else {
      (function loop() {
        drawIntroFrame();
        if (!video.paused && !video.ended) requestAnimationFrame(loop);
      })();
    }
    video.addEventListener('ended', drawIntroFrame); // make sure the last frame is on the canvas
  }

  /**
   * Size and place the video so its last frame lands exactly on the hero ghat:
   * the art fills INTRO_ART.width of the video's width, offset by INTRO_ART.left.
   */
  function layoutIntroVideo() {
    var section = document.getElementById('introVideo');
    var video = document.getElementById('introPlayer');
    var ghatImg = document.querySelector('.ghat-img');
    if (!section || !video || !ghatImg) return;

    var gr = ghatImg.getBoundingClientRect();
    var sr = section.getBoundingClientRect();
    // The picture is 9:16 (the alpha file stacks picture + mask, so don't read its size)
    var ratio = (!introGL && video.videoHeight && video.videoWidth) ? video.videoHeight / video.videoWidth : 16 / 9;

    var vw = gr.width / INTRO_ART.width;
    var vh = vw * ratio;
    var left = gr.left - sr.left - INTRO_ART.left * vw;
    var top = gr.top - sr.top - INTRO_ART.top * vh;

    [video, introGL && introGL.canvas].forEach(function (el) {
      if (!el) return;
      el.style.width = vw + 'px';
      el.style.height = vh + 'px';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    });
    if (introGL) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      introGL.canvas.width = Math.round(vw * dpr);
      introGL.canvas.height = Math.round(vh * dpr);
      drawIntroFrame();
    }

    // Narrower than the screen: feather the side edges into the cream too
    section.classList.toggle('is-narrow', left > 0.5 || left + vw < sr.width - 0.5);
  }

  /**
   * Page turn between the hero and the date page.
   *
   * Native scrolling is off on the hero. A swipe up / wheel / key / the Scroll
   * pill plays one timed transition, so nothing fights the finger or momentum:
   *   0.00–0.50  the ghat slides up to where the text was; text, motif and
   *              garland drift up and fade (parallax)
   *   0.35–1.00  the arch rises from the bottom edge and opens (--p), while
   *              the hero dims beneath it (--cover)
   * Then the hero is hidden and the details pages scroll natively from the
   * top. A deliberate pull-down at the very top of the date page plays the
   * same transition in reverse.
   *
   * Nothing here is position: sticky/fixed, so iOS Safari never paints a
   * solid colour band behind its toolbar.
   */
  var TURN_DURATION = 1700;  // ms
  var PULL_TO_RETURN = 60;   // px of downward pull at the top of the date page
  var SWIPE_TO_TURN = 24;    // px of upward swipe on the hero

  function initPageTurn() {
    var arch = document.getElementById('detailsArch');
    var root = document.documentElement;
    if (!arch || !detailsScreen || !welcomeScreen) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mode = 'hero';
    var animating = false;
    var geom = null;
    var wheelSum = 0, wheelTimer = null, lastWheelAt = 0, wheelGestureAtTop = false;

    function clamp01(v) { return Math.min(1, Math.max(0, v)); }
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    // Distances are measured at the start of each turn (the hero's layout at rest)
    function measure() {
      var vh = window.innerHeight;
      var ghatImg = welcomeGhat && welcomeGhat.querySelector('.ghat-img');
      var textTop = welcomeTextArea ? welcomeTextArea.getBoundingClientRect().top : vh * 0.3;
      var grow = 0;
      if (ghatImg) {
        var gr = ghatImg.getBoundingClientRect();
        // Spires start ~24% down the artwork; bring them up to the top of the
        // text by growing the ghat from its bottom edge, which stays on the
        // screen's bottom edge (a plain slide would lift it and leave a gap).
        var rise = Math.max(0, gr.top + gr.height * 0.24 - textTop);
        var spireToBottom = gr.bottom - (gr.top + gr.height * 0.24);
        grow = spireToBottom > 0 ? rise / spireToBottom : 0;
      }
      return { heroH: welcomeScreen.offsetHeight, grow: grow };
    }

    // t: 0 = hero at rest, 1 = date page in place
    function render(t) {
      var g = ease(clamp01(t / 0.5));
      var a = ease(clamp01((t - 0.35) / 0.65));

      if (welcomeGhat) {
        welcomeGhat.style.transformOrigin = '50% 100%';
        welcomeGhat.style.scale = String(1 + geom.grow * g);
      }
      if (welcomeTextArea) {
        welcomeTextArea.style.translate = '0 ' + (-40 * g) + 'px';
        welcomeTextArea.style.opacity = String(1 - g);
      }
      if (centerMotif) {
        centerMotif.style.translate = '0 ' + (-40 * g) + 'px';
        if (centerMotifImg) centerMotifImg.style.opacity = String(1 - g);
      }
      if (topDecoration) topDecoration.style.translate = '0 ' + (-24 * g) + 'px';
      if (scrollPill) {
        scrollPill.style.opacity = String(clamp01(1 - t * 5));
        scrollPill.style.pointerEvents = t > 0.05 ? 'none' : '';
      }

      // Arch: its top travels from the hero's bottom edge (the true screen bottom,
      // behind Safari's translucent toolbar) up to the top of the screen
      detailsScreen.style.transform = 'translate3d(0,' + (-geom.heroH * a) + 'px,0)';
      arch.style.setProperty('--p', a.toFixed(4));
      welcomeScreen.style.setProperty('--cover', a.toFixed(4));
      arch.classList.toggle('is-opening', a > 0.6);
    }

    function run(from, to, done) {
      animating = true;
      if (reduceMotion) { render(to); animating = false; done(); return; }
      var t0 = null;
      function step(now) {
        if (t0 === null) t0 = now;
        var k = clamp01((now - t0) / TURN_DURATION);
        render(from + (to - from) * k);
        if (k < 1) requestAnimationFrame(step);
        else { animating = false; done(); }
      }
      requestAnimationFrame(step);
    }

    function enterDetails() {
      // Hide the hero and drop the transform in the same frame: the date page
      // is already at the top of the screen, so nothing visibly moves.
      root.classList.add('mode-details');
      detailsScreen.style.transform = '';
      window.scrollTo(0, 0);
      lockScroll(false);
      mode = 'details';
      arch.classList.add('is-opening', 'is-revealed');
    }

    function forward() {
      if (mode !== 'hero' || animating) return;
      if (root.classList.contains('scroll-lock') && !welcomeScreen.classList.contains('animate')) return; // intro still running
      geom = measure();
      run(0, 1, enterDetails);
    }

    function reverse() {
      if (mode !== 'details' || animating || window.scrollY > 0) return;
      lockScroll(true);
      root.classList.remove('mode-details');
      geom = measure();
      render(1); // same frame: hero back underneath, date page held at the top
      arch.classList.remove('is-revealed');
      mode = 'hero';
      run(1, 0, function () { arch.classList.remove('is-opening'); });
    }

    // Initial state: hero showing, arch closed below the fold
    geom = measure();
    render(0);

    // ---- Input ----
    window.addEventListener('wheel', function (e) {
      if (animating) { e.preventDefault(); return; }
      if (mode === 'hero') {
        e.preventDefault();
        if (e.deltaY > 4) forward();
        return;
      }
      // Date page: a deliberate upward wheel that *starts* at the very top goes
      // back (momentum carried over from scrolling up through the page doesn't)
      var now = performance.now();
      if (now - lastWheelAt > 220) wheelGestureAtTop = window.scrollY <= 0;
      lastWheelAt = now;
      if (window.scrollY <= 0 && e.deltaY < 0 && wheelGestureAtTop) {
        e.preventDefault();
        wheelSum += -e.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () { wheelSum = 0; }, 250);
        if (wheelSum >= 40) { wheelSum = 0; reverse(); }
      }
    }, { passive: false });

    var touchY0 = 0, touchScroll0 = 0, touchFired = false;
    window.addEventListener('touchstart', function (e) {
      touchY0 = e.touches[0].clientY;
      touchScroll0 = window.scrollY;
      touchFired = false;
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      var dy = e.touches[0].clientY - touchY0;
      if (animating) { e.preventDefault(); return; }
      if (mode === 'hero') {
        if (!root.classList.contains('scroll-lock')) return;
        e.preventDefault(); // the hero never scrolls natively
        if (!touchFired && dy < -SWIPE_TO_TURN) { touchFired = true; forward(); }
        return;
      }
      // Date page: only a pull-down that starts at the very top goes back
      if (touchScroll0 <= 0 && window.scrollY <= 0 && dy > 0) {
        e.preventDefault(); // no rubber-band bounce
        if (!touchFired && dy > PULL_TO_RETURN) { touchFired = true; reverse(); }
      }
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (animating && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].indexOf(k) !== -1) {
        e.preventDefault();
        return;
      }
      if (mode === 'hero' && (k === 'ArrowDown' || k === 'PageDown' || k === ' ')) {
        e.preventDefault();
        forward();
      } else if (mode === 'details' && window.scrollY <= 0 && (k === 'ArrowUp' || k === 'PageUp')) {
        e.preventDefault();
        reverse();
      }
    });

    if (scrollPill) scrollPill.addEventListener('click', forward);
    window.addEventListener('resize', function () {
      if (mode === 'hero' && !animating) { geom = measure(); render(0); }
    });
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
   * Diagnostics for real devices: open the site with ?debug to see the
   * viewport / safe-area numbers the browser reports, and to paint the
   * hero's below-the-toolbar strip in stripes (it should show through
   * Safari's translucent bottom bar).
   */
  function initDebug() {
    if (!/[?&]debug\b/.test(location.search)) return;
    document.documentElement.classList.add('debug-bleed');

    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:1px;' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    function h(unit) {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:100' + unit;
      document.body.appendChild(d);
      var v = Math.round(d.getBoundingClientRect().height);
      d.remove();
      return v;
    }

    var panel = document.createElement('pre');
    panel.className = 'debug-panel';
    document.body.appendChild(panel);

    function update() {
      var cs = getComputedStyle(probe);
      var root = getComputedStyle(document.documentElement);
      var hero = document.querySelector('.welcome-content').getBoundingClientRect();
      panel.textContent = [
        'build ' + root.getPropertyValue('--build').trim(),
        'inner ' + innerWidth + 'x' + innerHeight + '  client ' + document.documentElement.clientHeight,
        'visualVP ' + (window.visualViewport ? Math.round(visualViewport.height) : '-') + '  screen ' + screen.height,
        'vh ' + h('vh') + ' lvh ' + h('lvh') + ' svh ' + h('svh') + ' dvh ' + h('dvh'),
        'safe top ' + cs.paddingTop + ' bottom ' + cs.paddingBottom,
        'touch-callout ' + (CSS.supports('-webkit-touch-callout', 'none') ? 'yes' : 'no') +
          '  bleed ' + root.getPropertyValue('--hero-bleed').trim(),
        'hero ' + Math.round(hero.top) + '..' + Math.round(hero.bottom) + '  scrollY ' + Math.round(scrollY),
        navigator.userAgent.replace(/^.*?\(([^)]*)\).*$/, '$1').slice(0, 60)
      ].join('\n');
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    if (window.visualViewport) visualViewport.addEventListener('resize', update);
  }

  /**
   * Main initialization — runs after DOM is ready.
   */
  function init() {
    initDebug();
    setupIntroVideo();
    initPageTurn();
    initScrollReveal();
    lockScroll(true);
    preloadImages(criticalImages, 4000).then(function () {
      setTimeout(function () {
        startLoadingAnimations();
        // Loader artwork has finished drawing by now; offer "Tap to open"
        setTimeout(showOpenPrompt, PROMPT_DELAY);
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
