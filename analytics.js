/* ================================================
   ENGAGEMENT INVITATION — ANALYTICS
   Sends guest-journey events to PostHog. script.js
   calls window.inviteAnalytics; everything here is a
   no-op until POSTHOG_KEY is set, for ?internal
   visitors, or when a blocker stops PostHog loading.
   ================================================ */

(function () {
  'use strict';

  // ---- Configuration ----
  // Project API key from PostHog → Project settings (starts "phc_"). It only
  // lets browsers send events, so it is safe to publish. Empty = analytics off.
  var POSTHOG_KEY = '';
  var POSTHOG_HOST = 'https://us.i.posthog.com';

  // Open the site once with ?internal to stop counting your own visits on that
  // browser; ?internal=0 counts them again.
  var INTERNAL_KEY = 'inviteInternal';
  var internal = false;
  try {
    var flag = /[?&]internal(?:=([^&]*))?/.exec(location.search);
    if (flag) localStorage.setItem(INTERNAL_KEY, flag[1] === '0' ? '0' : '1');
    internal = localStorage.getItem(INTERNAL_KEY) === '1';
  } catch (e) { /* storage blocked */ }

  var enabled = !!POSTHOG_KEY && !internal;

  /**
   * PostHog loader. array.js picks up the config queued in window.posthog._i
   * and replays any ['capture', ...] calls pushed before it arrived.
   */
  if (enabled) {
    var stub = window.posthog = window.posthog || [];
    stub._i = [[POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: 'localStorage',        // no cookies; still spots returning guests
      person_profiles: 'identified_only', // guests stay anonymous
      autocapture: false,                 // only the named events below
      capture_pageview: true,
      capture_pageleave: true,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,          // js_error below covers this
      advanced_disable_flags: true,
      disable_surveys: true
    }]];
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = POSTHOG_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    document.head.appendChild(s);
  }

  // Calls PostHog directly once it has loaded, or queues the call until then
  function call(method, args) {
    if (!enabled) return;
    var ph = window.posthog;
    if (ph && ph.__loaded) ph[method].apply(ph, args);
    else if (Array.isArray(ph)) ph.push([method].concat(args));
  }

  function send(event, props, beacon) {
    // beacon: skip the batch queue and use sendBeacon, for moments the page may go away
    call('capture', [event, props, beacon ? { transport: 'sendBeacon', send_instantly: true } : undefined]);
  }

  function round(ms) { return ms == null ? null : Math.round(ms); }

  // One id per page load, so the report can keep the latest time_in_states per visit
  var viewId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  var build = '';
  try { build = getComputedStyle(document.documentElement).getPropertyValue('--build').trim().replace(/"/g, ''); } catch (e) { /* no CSS */ }
  var conn = navigator.connection || {};
  var base = {
    view_id: viewId,
    build: build,
    connection: conn.effectiveType || null,
    save_data: conn.saveData === true,
    reduced_motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  };
  call('register', [base]);

  /**
   * Time spent in each scroll state.
   *
   * Exactly one state is current at a time; the clock pauses while the tab is
   * hidden (guest switched to WhatsApp, locked the phone), so background time
   * never counts. States: loading → doors → intro → hero → date / dress_code /
   * venue (whichever section crosses the middle of the screen).
   */
  var STATES = ['loading', 'doors', 'intro', 'hero', 'date', 'dress_code', 'venue'];
  var totals = {};
  STATES.forEach(function (k) { totals[k] = 0; });
  var current = 'loading';
  var mark = 0;        // performance.now() when the running stint was last banked; 0 = page start
  var stint = 0;       // visible ms in the current state since it was entered
  var visible = !document.hidden;
  var seen = { loading: true };
  var musicOn = false, musicMs = 0;
  var flushSeq = 0;

  function bank() {
    var now = performance.now();
    if (visible) {
      var d = now - mark;
      totals[current] += d;
      stint += d;
      if (musicOn) musicMs += d;
    }
    mark = now;
  }

  function setState(name) {
    if (name === current || STATES.indexOf(name) === -1) return;
    bank();
    current = name;
    stint = 0;
    if (!seen[name]) {
      seen[name] = true;
      if (name === 'dress_code' || name === 'venue') send('section_viewed', { section: name });
    }
  }

  // Visible ms spent in the current state so far
  function stintMs() {
    bank();
    return stint;
  }

  function flush() {
    bank();
    var props = { seq: ++flushSeq, final_state: current, music_on_ms: round(musicMs) };
    var total = 0;
    STATES.forEach(function (k) {
      props['t_' + k] = round(totals[k]);
      total += totals[k];
    });
    props.t_total = round(total);
    send('time_in_states', props, true);
  }

  // visibilitychange→hidden is the last event iOS reliably delivers, so the
  // totals go out every time the page is hidden; the report keeps the highest seq.
  document.addEventListener('visibilitychange', function () {
    bank();
    visible = !document.hidden;
    if (!visible) flush();
  });
  window.addEventListener('pagehide', function () { if (visible) flush(); });

  // Details pages scroll natively: the section under the middle of the screen is the state
  var detailsOn = false;
  var sections = [
    ['date', 'detailsArch'],
    ['dress_code', '.dress-section'],
    ['venue', '.venue-section']
  ];

  function el(sel) { return sel.charAt(0) === '.' ? document.querySelector(sel) : document.getElementById(sel); }

  function detailsState() {
    var mid = window.innerHeight / 2;
    var pick = 'date';
    sections.forEach(function (s) {
      var node = el(s[1]);
      if (node && node.getBoundingClientRect().top <= mid) pick = s[0];
    });
    return pick;
  }

  function detailsMode(on) {
    detailsOn = on;
    if (on) setState(detailsState());
  }

  var scrollQueued = false;
  window.addEventListener('scroll', function () {
    if (!detailsOn || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      if (detailsOn) setState(detailsState());
    });
  }, { passive: true });

  function setMusic(on) {
    if (on === musicOn) return;
    bank();
    musicOn = on;
  }

  /**
   * Load timings, sent once when "Tap to open" appears (or the hero, if the
   * doors are skipped): browser navigation timing, the Ganesha loader's own
   * wait, and Largest Contentful Paint so far.
   */
  var lcp = null;
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      if (entries.length) lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* not supported (Safari < 17.4?) */ }

  var loaderMs = null, imagesTimedOut = null, loadSent = false;

  function loaderDone(timedOut) {
    loaderMs = performance.now();
    imagesTimedOut = !!timedOut;
  }

  function sendLoadTiming() {
    if (loadSent) return;
    loadSent = true;
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    send('load_timing', {
      ttfb_ms: nav ? round(nav.responseStart) : null,
      dom_ready_ms: nav && nav.domContentLoadedEventEnd ? round(nav.domContentLoadedEventEnd) : null,
      page_load_ms: nav && nav.loadEventEnd ? round(nav.loadEventEnd) : null,
      loader_ms: round(loaderMs),
      images_timed_out: imagesTimedOut,
      prompt_ms: round(performance.now()),
      lcp_ms: round(lcp),
      transfer_kb: nav && nav.transferSize ? Math.round(nav.transferSize / 1024) : null
    });
  }

  // A handful of uncaught errors per visit, enough to spot a broken build
  var errors = 0;
  window.addEventListener('error', function (e) {
    if (++errors > 5 || !e.message) return;
    send('js_error', {
      message: String(e.message).slice(0, 200),
      source: (e.filename || '').replace(location.origin, '').slice(0, 120),
      line: e.lineno || null,
      state: current
    });
  });

  window.inviteAnalytics = {
    track: function (event, props, beacon) { send(event, props || {}, beacon); },
    register: function (props) { call('register', [props]); },
    state: setState,
    currentState: function () { return current; },
    stintMs: stintMs,
    detailsMode: detailsMode,
    music: setMusic,
    loaderDone: loaderDone,
    sendLoadTiming: sendLoadTiming
  };
})();
