# Invite analytics

Guest-journey tracking for niya-forever.in, sent to [PostHog](https://posthog.com) (free tier).
`analytics.js` does the tracking; `script.js` calls it at each step. Until a key is set it does nothing.

## Turning it on

PostHog project **633757** (US Cloud). Its project API key is set in `POSTHOG_KEY` at the top of
`analytics.js`; that key can only send events, so it is safe in a public repo. Emptying it turns
tracking off.

1. Deploy (merge to `main`).
2. On each of your own devices, open `https://niya-forever.in/?internal` once so your visits
   aren't counted (`?internal=0` undoes it).

Share a tagged link per group so the report can split visits by source, e.g.
`https://niya-forever.in/?utm_source=whatsapp&utm_campaign=family-lucknow`.
The WhatsApp preview is unaffected.

## Events

Every event carries `view_id` (one page load), `build`, `intro_video` (`alpha` or `plain`
fallback without WebGL), `connection` (Android only) and PostHog's device, browser, city and UTM
properties.

| Event | When | Properties |
|---|---|---|
| `$pageview` | Page opened | UTM, referrer |
| `load_timing` | "Tap to open" appears (or the hero, if the doors are skipped) | `ttfb_ms`, `dom_ready_ms`, `page_load_ms`, `loader_ms` (loader images ready), `images_timed_out` (4s cutoff hit), `prompt_ms`, `lcp_ms`, `transfer_kb` |
| `invite_opened` | Guest taps the doors | `wait_ms` on the doors |
| `intro_video_started` | Intro video starts playing | `startup_ms` from the tap, `with_sound` |
| `intro_finished` | Hand-off to the hero | `how`: `completed` / `skipped` / `error` / `stalled` (7s timeout) / `no_intro`; `at_s`, `intro_ms` |
| `music_start` | Background music first tries to play | `outcome`: `playing` / `blocked` (browser refused autoplay) / `muted_last_visit` |
| `music_toggle` | Mute button tapped | `to` (`off`/`on`), `state` it happened in, `since_start_s`, `was_blocked` |
| `page_turned` | Hero → date page | `method`: `swipe` / `pill` (Scroll button) / `wheel` / `key`; `first` (first turn this visit), `hero_ms` |
| `page_returned` | Date page → hero | `method`: `pull` / `wheel` / `key` |
| `section_viewed` | First time the dress code or venue reaches mid-screen | `section` |
| `calendar_clicked` | Add to Calendar | `target`: `google` / `ics` (Apple devices) |
| `time_in_states` | Each time the page is hidden or closed (running totals) | `t_loading`, `t_doors`, `t_intro`, `t_hero`, `t_date`, `t_dress_code`, `t_venue`, `t_total` (ms), `music_on_ms`, `final_state`, `seq` (keep the highest per `view_id`) |
| `js_error` | Uncaught error (max 5 per visit) | `message`, `source`, `line`, `state` |

Scroll-state times count only while the page is visible. The details states follow whichever
section crosses the middle of the screen. `t_hero` includes the 1.4s page-turn animation.

## Daily report

`tools/analytics-report.mjs` pulls the events from PostHog and prints a Markdown report. It
covers the last 24 hours and the period since launch, with day-by-day totals. Sections: reach,
funnel, time per scroll state, music split, swipe vs Scroll-button split, loading times, health
and whether the site is up.

```sh
POSTHOG_API_KEY=phx_… POSTHOG_PROJECT_ID=12345 node tools/analytics-report.mjs --out report.md
```

- `POSTHOG_API_KEY`: a **personal** API key (PostHog → Settings → Personal API keys) with only
  the *Query: read* scope. Keep it secret; never commit it.
- `POSTHOG_PROJECT_ID`: the number in the project's URL.
- `POSTHOG_HOST`: `https://eu.posthog.com` for the EU region (default US).
- `REPORT_SINCE`: first day to count, default `2026-09-28`.

The report contains guest-level details (cities, devices), so don't commit reports to this repo.
GitHub Pages would publish them on the site.
