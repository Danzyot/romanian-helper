# Romanian Helper

A mobile-friendly app that helps Mom learn Romanian — starting with
pronunciation. See [PLAN.md](PLAN.md) for the full roadmap.

**Current status: Phase 0 (walking skeleton).** An installable PWA that:

- shows beginner Romanian words with English/Hebrew translations
- speaks each word with the phone's Romanian voice (normal and slow speed)
- records her saying it and plays the recording back
- switches between an English and a Hebrew (RTL) interface

Phase 0 needs **no API keys** — speech uses the browser's built-in
text-to-speech (Android phones ship with a Romanian Google voice).

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
