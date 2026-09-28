#!/usr/bin/env node
/* ================================================
   ENGAGEMENT INVITATION — DAILY ANALYTICS REPORT
   Pulls the invite's events from PostHog, checks the
   site is up, and prints a Markdown report. Each run
   is also saved to reports/<date>.md (git-ignored).

   node tools/analytics-report.mjs [--out report.md] [--fixture events.json]

   Settings come from the environment or the repo's .env:
        POSTHOG_API_KEY     personal API key with "Query: read" scope
        POSTHOG_PROJECT_ID  numeric id from the PostHog project URL
        POSTHOG_HOST        default https://us.posthog.com
        REPORT_SINCE        first day to count (IST), default 2026-09-28
   ================================================ */

import fs from 'node:fs';

// KEY=value lines from the repo's .env (git-ignored); real environment variables win
const ROOT = new URL('../', import.meta.url);
try {
  for (const line of fs.readFileSync(new URL('.env', ROOT), 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { /* no .env */ }

const SITE = 'https://niya-forever.in';
const EVENT_DAY = '2026-10-16';
const TZ = 'Asia/Kolkata';
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '633757';
const SINCE = process.env.REPORT_SINCE || '2026-09-28';
const HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const ROW_LIMIT = 50000;

const EVENTS = ['$pageview', 'load_timing', 'invite_opened', 'intro_video_started', 'intro_finished',
  'music_start', 'music_toggle', 'page_turned', 'page_returned', 'section_viewed',
  'calendar_clicked', 'time_in_states', 'js_error'];

const STATES = [
  ['loading', 'Loading screen'], ['doors', 'Doors ("Tap to open")'], ['intro', 'Intro video'],
  ['hero', 'Hero (Shubh Sagai)'], ['date', 'Date page'], ['dress_code', 'Dress code'], ['venue', 'Venue & map']
];

const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; }

// ---- Data ----

async function fetchRows() {
  const fixture = arg('--fixture');
  if (fixture) return JSON.parse(fs.readFileSync(fixture, 'utf8'));

  const key = process.env.POSTHOG_API_KEY, project = PROJECT_ID;
  if (!key) throw new Error('Add POSTHOG_API_KEY=phx_... to the .env file in the project folder (or pass --fixture).');

  // IST midnight of REPORT_SINCE, in UTC
  const since = new Date(SINCE + 'T00:00:00+05:30').toISOString().replace('T', ' ').slice(0, 19);
  const query = `
    SELECT event, timestamp, distinct_id, properties
    FROM events
    WHERE timestamp >= toDateTime('${since}')
      AND event IN (${EVENTS.map(e => `'${e}'`).join(', ')})
    ORDER BY timestamp
    LIMIT ${ROW_LIMIT}`;
  const res = await fetch(`${HOST}/api/projects/${project}/query/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } })
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body.results.map(([event, timestamp, distinct_id, properties]) => ({
    event, timestamp, distinct_id,
    properties: typeof properties === 'string' ? JSON.parse(properties) : (properties || {})
  }));
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: e.cause?.code || e.message };
  }
}

// ---- Helpers ----

const istDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
const pct = (n, d) => d ? `${Math.round(100 * n / d)}%` : '–';
const secs = ms => ms == null ? '–' : ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;

function quantile(values, q) {
  const v = values.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

function table(head, rows) {
  return [`| ${head.join(' | ')} |`, `|${head.map((h, i) => i ? '---:' : '---').join('|')}|`,
    ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

function countBy(items, fn) {
  const m = new Map();
  for (const it of items) { const k = fn(it) ?? 'unknown'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function device(p) {
  const os = p.$os || '';
  if (/iOS|iPadOS/.test(os)) return 'iPhone / iPad';
  if (/Android/.test(os)) return 'Android';
  return p.$device_type === 'Mobile' ? 'Other phone' : 'Desktop';
}

function source(p) {
  if (p.utm_campaign || p.utm_source) return [p.utm_source, p.utm_campaign].filter(Boolean).join(' / ');
  const ref = p.$referring_domain;
  return !ref || ref === '$direct' ? 'Direct (WhatsApp / typed)' : ref;
}

// ---- Report ----

function build(rows, windowLabel, inWindow) {
  const views = new Map(); // view_id → { events[], props of the $pageview }
  for (const r of inWindow) {
    const v = r.properties.view_id || `${r.distinct_id}:${istDay(r.timestamp)}`;
    if (!views.has(v)) views.set(v, { id: v, who: r.distinct_id, events: [], pv: null });
    const view = views.get(v);
    view.events.push(r);
    if (r.event === '$pageview' && !view.pv) view.pv = r.properties;
  }
  const all = [...views.values()];
  for (const v of all) v.pv = v.pv || v.events[0].properties;
  const has = (v, name, pred) => v.events.some(e => e.event === name && (!pred || pred(e.properties)));
  const first = (v, name) => v.events.find(e => e.event === name)?.properties;
  const visitors = new Set(all.map(v => v.who));
  const out = [];

  out.push(`## ${windowLabel}`);
  if (!all.length) { out.push('_No visits in this window._'); return out.join('\n\n'); }

  // Reach
  const byVisitorDays = new Map();
  for (const r of rows) if (r.event === '$pageview') {
    if (!byVisitorDays.has(r.distinct_id)) byVisitorDays.set(r.distinct_id, new Set());
    byVisitorDays.get(r.distinct_id).add(istDay(r.timestamp));
  }
  const returning = [...visitors].filter(id => (byVisitorDays.get(id)?.size || 0) > 1).length;
  out.push(`### Reach\n**${visitors.size}** guests · **${all.length}** visits · **${returning}** came back on another day`);
  out.push(table(['Source', 'Visits'], countBy(all, v => source(v.pv)).slice(0, 8).map(([k, n]) => [k, n])));
  out.push(table(['Device', 'Visits', 'Share'], countBy(all, v => device(v.pv)).map(([k, n]) => [k, n, pct(n, all.length)])));
  const cities = countBy(all.filter(v => v.pv.$geoip_city_name), v => v.pv.$geoip_city_name).slice(0, 6);
  if (cities.length) out.push(`Top cities: ${cities.map(([c, n]) => `${c} (${n})`).join(', ')}`);

  // Funnel, per visit: the path to the date page, then what date-page visitors did there
  const steps = [
    ['Opened the link', v => true],
    ['Loader finished', v => has(v, 'load_timing')],
    ['Opened the doors', v => has(v, 'invite_opened') || has(v, 'intro_finished', p => p.how === 'no_intro')],
    ['Reached the hero', v => has(v, 'intro_finished')],
    ['Turned to the date page', v => has(v, 'page_turned')]
  ];
  const onDatePage = all.filter(v => has(v, 'page_turned'));
  const extras = [
    ['↳ Added to calendar', v => has(v, 'calendar_clicked')],
    ['↳ Scrolled to the dress code', v => has(v, 'section_viewed', p => p.section === 'dress_code')],
    ['↳ Scrolled to the venue & map', v => has(v, 'section_viewed', p => p.section === 'venue')]
  ];
  let prev = all.length;
  out.push('### Invite funnel (per visit)\n' + table(['Step', 'Visits', 'Of all', 'Lost at this step'], [
    ...steps.map(([label, fn], i) => {
      const n = all.filter(fn).length;
      const row = [label, n, pct(n, all.length), i ? `${prev - n} (${pct(prev - n, prev)})` : ''];
      prev = n;
      return row;
    }),
    ...extras.map(([label, fn]) => {
      const n = onDatePage.filter(fn).length;
      return [label, n, pct(n, all.length), `${pct(n, onDatePage.length)} of date-page visits`];
    })
  ]));

  // Time in each scroll state: last (highest seq) snapshot per visit
  const snaps = all.map(v => v.events.filter(e => e.event === 'time_in_states')
    .reduce((best, e) => (!best || (e.properties.seq || 0) >= (best.seq || 0)) ? e.properties : best, null)).filter(Boolean);
  if (snaps.length) {
    out.push(`### Time spent in each scroll state\n_${snaps.length} visits reported timings; background time excluded. Hero time includes the 1.4s page-turn animation._\n\n` +
      table(['State', 'Visits that reached it', 'Median', '90th pct'], STATES.map(([k, label]) => {
        const t = snaps.map(s => s['t_' + k]).filter(x => x > 0);
        return [label, pct(t.length, snaps.length), secs(quantile(t, 0.5)), secs(quantile(t, 0.9))];
      })) + `\n\nMedian whole visit: **${secs(quantile(snaps.map(s => s.t_total), 0.5))}** · where visits ended: ` +
      countBy(snaps, s => s.final_state).map(([k, n]) => `${k} ${pct(n, snaps.length)}`).join(', '));
  }

  // Music
  const musicViews = all.filter(v => has(v, 'music_start'));
  if (musicViews.length) {
    const cat = v => {
      const outcome = first(v, 'music_start').outcome;
      const toggles = v.events.filter(e => e.event === 'music_toggle').map(e => e.properties.to);
      const last = toggles[toggles.length - 1];
      if (outcome === 'muted_last_visit') return last === 'on' ? 'Muted from last visit, turned it on' : 'Muted from last visit, stayed off';
      if (outcome === 'blocked') return last === 'on' ? 'Blocked by browser, guest turned it on' : 'Blocked by browser, never turned on';
      if (!toggles.length) return 'Played, never touched (stayed on)';
      return last === 'off' ? 'Turned it off and left it off' : 'Turned it off, then back on';
    };
    const offs = all.flatMap(v => v.events.filter(e => e.event === 'music_toggle' && e.properties.to === 'off').slice(0, 1).map(e => e.properties));
    const turnedOff = musicViews.filter(v => has(v, 'music_toggle', p => p.to === 'off')).length;
    const listen = snaps.filter(s => s.t_total > 0 && s.music_on_ms != null).map(s => s.music_on_ms / s.t_total);
    out.push(`### Music\n**${pct(turnedOff, musicViews.length)}** of visits turned the music off at least once.\n\n` +
      table(['What happened', 'Visits', 'Share'], countBy(musicViews, cat).map(([k, n]) => [k, n, pct(n, musicViews.length)])) +
      (offs.length ? `\n\nFirst mute happened on: ${countBy(offs, p => p.state).map(([k, n]) => `${k} ${pct(n, offs.length)}`).join(', ')} · median ${quantile(offs.map(p => p.since_start_s), 0.5) ?? '–'}s after the music started` : '') +
      (listen.length ? `\n\nMusic was playing for a median **${pct(quantile(listen, 0.5), 1)}** of each visit.` : ''));
  }

  // Scroll method on the homepage: first page turn per visit
  const firstTurns = all.map(v => first(v, 'page_turned')).filter(Boolean);
  if (firstTurns.length) {
    const label = { swipe: 'Swiped up', pill: 'Tapped the Scroll button', wheel: 'Mouse wheel / trackpad', key: 'Keyboard' };
    const split = list => countBy(list, p => label[p.method] || p.method).map(([k, n]) => [k, n, pct(n, list.length)]);
    const phoneTurns = all.filter(v => /iPhone|Android|Other phone/.test(device(v.pv))).map(v => first(v, 'page_turned')).filter(Boolean);
    const reachedHero = all.filter(v => has(v, 'intro_finished'));
    const stuck = reachedHero.filter(v => !has(v, 'page_turned')).length;
    const returns = all.flatMap(v => v.events.filter(e => e.event === 'page_returned'));
    out.push(`### How guests left the homepage\nFirst page turn of each visit (${firstTurns.length} visits):\n\n` +
      table(['Method', 'Visits', 'Share'], split(firstTurns)) +
      (phoneTurns.length ? `\n\nPhones only (${phoneTurns.length}):\n\n` + table(['Method', 'Visits', 'Share'], split(phoneTurns)) : '') +
      '\n\nTime on the hero before turning: ' + ['swipe', 'pill', 'wheel', 'key']
        .map(m => [m, firstTurns.filter(p => p.method === m).map(p => p.hero_ms)]).filter(([, t]) => t.length)
        .map(([m, t]) => `${label[m]} ${secs(quantile(t, 0.5))}`).join(' · ') +
      `\n\nReached the hero but never turned the page: **${stuck}** (${pct(stuck, reachedHero.length)})` +
      (returns.length ? ` · went back from the date page ${returns.length}× (${countBy(returns, e => e.properties.method).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''));
  }

  // Loading
  const loads = all.map(v => first(v, 'load_timing')).filter(Boolean);
  if (loads.length) {
    const row = (label, list) => [label, secs(quantile(list, 0.5)), secs(quantile(list, 0.75)), secs(quantile(list, 0.9))];
    const starts = all.map(v => first(v, 'intro_video_started')).filter(Boolean).map(p => p.startup_ms);
    const perDevice = countBy(all.filter(v => first(v, 'load_timing')), v => device(v.pv))
      .map(([d]) => [d, all.filter(v => device(v.pv) === d).map(v => first(v, 'load_timing')?.loader_ms)]);
    out.push(`### Loading time\n` + table(['Measure', 'Median', '75th pct', '90th pct'], [
      row('Page loaded (browser load event)', loads.map(p => p.page_load_ms)),
      row('Main image painted (LCP)', loads.map(p => p.lcp_ms)),
      row('Loader images ready', loads.map(p => p.loader_ms)),
      row('"Tap to open" visible', loads.map(p => p.prompt_ms)),
      ...(starts.length ? [row('Tap → intro video playing', starts)] : [])
    ]) + `\n\nLoader gave up waiting for images (4s cutoff): **${pct(loads.filter(p => p.images_timed_out).length, loads.length)}** of visits · ` +
      `loader median by device: ${perDevice.map(([d, t]) => `${d} ${secs(quantile(t, 0.5))}`).join(', ')}` +
      (() => {
        const nets = countBy(loads.filter(p => p.connection), p => p.connection);
        return nets.length ? ` · network (Android only): ${nets.map(([k, n]) => `${k} ${n}`).join(', ')}` : '';
      })());
  }

  // Health
  const finishes = all.map(v => first(v, 'intro_finished')).filter(Boolean);
  const errors = all.flatMap(v => v.events.filter(e => e.event === 'js_error').map(e => e.properties.message));
  const plain = all.filter(v => v.pv.intro_video === 'plain').length;
  out.push('### Health\n' + [
    finishes.length && `Intro ended: ${countBy(finishes, p => p.how).map(([k, n]) => `${k} ${pct(n, finishes.length)}`).join(', ')}`,
    plain && `Plain video fallback (no WebGL): ${pct(plain, all.length)} of visits`,
    errors.length ? `JavaScript errors: ${countBy(errors, m => m).slice(0, 3).map(([m, n]) => `"${m}" ×${n}`).join('; ')}` : 'No JavaScript errors'
  ].filter(Boolean).map(s => `- ${s}`).join('\n'));

  return out.join('\n\n');
}

// Guests, visits and calendar adds per day (IST)
function daily(rows) {
  const days = new Map();
  for (const r of rows) {
    const d = istDay(r.timestamp);
    if (!days.has(d)) days.set(d, { guests: new Set(), visits: 0, cal: 0 });
    const day = days.get(d);
    if (r.event === '$pageview') { day.guests.add(r.distinct_id); day.visits++; }
    if (r.event === 'calendar_clicked') day.cal++;
  }
  if (!days.size) return null;
  return '## Day by day\n' + table(['Day (IST)', 'Guests', 'Visits', 'Calendar adds'],
    [...days.entries()].sort().map(([d, v]) => [d, v.guests.size, v.visits, v.cal]));
}

async function main() {
  const [rows, home, og] = await Promise.all([
    fetchRows(), checkUrl(SITE + '/'), checkUrl(SITE + '/og-image.jpg?v=3')
  ]);
  const today = istDay(Date.now());
  const daysLeft = Math.round((new Date(EVENT_DAY) - new Date(today)) / 86400000);

  const md = [
    `# Invite analytics — ${today}`,
    `${daysLeft > 0 ? `${daysLeft} days to the engagement` : daysLeft === 0 ? 'Engagement day' : `${-daysLeft} days after the engagement`} · counting since ${SINCE} (IST)`,
    `**Site status:** ${home.ok ? '✅' : '❌'} niya-forever.in (${home.status}) · ${og.ok ? '✅' : '❌'} WhatsApp preview image (${og.status})`,
    rows.length >= ROW_LIMIT ? `⚠️ Hit the ${ROW_LIMIT}-event query limit; totals are incomplete.` : null,
    build(rows, 'Last 24 hours', rows.filter(r => new Date(r.timestamp) >= Date.now() - 86400000)),
    build(rows, 'Since launch', rows),
    daily(rows)
  ].filter(Boolean).join('\n\n') + '\n';

  const out = arg('--out') || (() => {
    const dir = new URL('reports/', ROOT);
    fs.mkdirSync(dir, { recursive: true });
    return new URL(`${today}.md`, dir);
  })();
  fs.writeFileSync(out, md);
  process.stdout.write(md);
  console.error(`\nSaved to ${out instanceof URL ? out.pathname : out}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
