# Romanian Helper

A mobile-friendly app that helps Mom learn Romanian — starting with
pronunciation. See [PLAN.md](PLAN.md) for the full roadmap.

**Current status: dictionary, quizzes, and adaptive progress.** An
installable PWA that:

- has a ~250-word trilingual dictionary, searchable in Romanian, English,
  or Hebrew (diacritic-insensitive — "branza" finds "brânză"), plus
  free-typing any Romanian word not in the dictionary
- speaks each word with the phone's Romanian voice (normal and slow speed),
  records her saying it and plays the recording back
- runs adaptive multiple-choice quizzes (word→meaning, meaning→word,
  listen→pick)
- tracks progress with spaced repetition (Leitner boxes), estimates a level
  (A0→B1) that unlocks harder words automatically, and keeps a day streak
- switches between an English and a Hebrew (RTL) interface

Everything so far needs **no API keys** — speech uses the browser's built-in
text-to-speech (Android phones ship with a Romanian Google voice), and
progress is stored locally on the device.

## Per-user sync (Supabase)

Progress is local-first; `supabase/schema.sql` holds the table schema for
per-user sync. Wiring it up requires a (free) Supabase project's URL and
anon key — see PLAN.md.

## Run locally

```bash
npm install
npm run dev
```

Note: the microphone only works on `localhost` or HTTPS.

## Deploy (GitHub Pages)

A workflow in `.github/workflows/deploy.yml` builds and publishes the app
automatically. One-time setup: in the GitHub repo go to
**Settings → Pages → Build and deployment → Source** and select
**GitHub Actions**. After the next push the app is live at
`https://<your-username>.github.io/romanian-helper/`.

### Install on Mom's phone

1. Open that URL in Chrome on her Android phone.
2. Tap the ⋮ menu → **Add to Home screen** → **Install**.
3. It now opens full-screen from its own icon, like a normal app.

If "Listen" is silent, install/enable **Google Text-to-speech** in Android
settings (most phones already have it).

## Development notes

- `npm run icons` regenerates the PWA icons in `public/` from
  `scripts/icon.svg`.
- Word list lives in `src/words.ts`; UI strings in `src/i18n.ts`.
