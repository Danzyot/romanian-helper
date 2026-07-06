# Romanian Helper — Project Plan

A mobile-friendly app to help Mom (beginner level, Android phone) learn Romanian,
with **pronunciation practice as the core feature**: she records herself saying a
word or phrase, the app tells her whether it was right, and coaches her — by voice —
on how to fix it.

UI languages: **English and Hebrew** (switchable, RTL support for Hebrew).

---

## 1. Feasibility findings (what shaped this plan)

The one hard problem is automatic pronunciation *scoring* for Romanian:

- **Azure Pronunciation Assessment** (the industry-standard API for this) supports
  34 locales — **Romanian is not one of them**.
- Dedicated vendors (Speechace, SpeechSuper, ELSA) also don't cover Romanian.

So no single API gives us phoneme-level grading. Instead we combine two signals
that *do* support Romanian well:

1. **Speech-to-text as the objective check.** Whisper (OpenAI) and Google/Azure STT
   all transcribe Romanian accurately. If Mom says *brânză* and the recognizer
   hears *brânză*, the pronunciation was intelligible. If it hears something else,
   we know exactly which word failed. This is strict, objective, and cheap.
2. **An audio-capable LLM as the coach.** Gemini (audio input) listens to her actual
   recording alongside the target text and produces qualitative feedback:
   "your *ș* sounded like *s*", "stress the first syllable". This is what makes the
   feedback feel like a teacher rather than a pass/fail machine.

For playback, **neural TTS has excellent Romanian voices** (e.g. Azure
`ro-RO-AlinaNeural` / `ro-RO-EmilNeural`, Google ro-RO) — used both for "here's how
it should sound" and for speaking the coach's feedback aloud.

**Honest limitation:** this combo is very good but not lab-grade phonetics. For a
beginner it's the right strictness — the goal is "a Romanian speaker would
understand you", not IPA perfection. If we later want research-grade phoneme
scoring, the upgrade path is an open-source forced-alignment/GOP model (wav2vec2)
on a small server — deliberately out of scope for v1.

## 2. Platform decision: installable PWA

A **Progressive Web App** rather than a native Android app:

- Installs from Chrome via "Add to Home Screen" — full-screen, icon on her phone,
  feels like an app. No app store, no review process, instant updates.
- `MediaRecorder` API gives reliable mic recording in Android Chrome.
- One codebase serves the phone and desktop browser.
- Requires HTTPS (mic permission) — comes free with the hosting below.

## 3. Architecture

```
Android phone (Chrome PWA)
   │  records audio (MediaRecorder), plays TTS audio
   ▼
Frontend: React + Vite + TypeScript, mobile-first
   │  HTTPS/JSON (audio as base64 or multipart)
   ▼
Backend: serverless functions (Vercel or Cloudflare) — holds all API keys
   ├── /api/transcribe   → Whisper STT (language=ro)
   ├── /api/coach        → Gemini (audio + target text → structured feedback JSON)
   ├── /api/tts          → Azure TTS (Romanian model audio + EN/HE feedback audio)
   └── /api/progress     → simple per-user storage (KV or SQLite/libSQL)
```

- **i18n:** English + Hebrew UI with a language toggle; Hebrew renders RTL.
- **Content** (word lists, lessons, quizzes) lives as versioned JSON in the repo —
  easy to review, extend, and translate.
- **Auth:** none for v1 (single user, unguessable URL or simple PIN). Revisit if
  anyone else starts using it.

## 4. The core loop — pronunciation trainer

1. App shows a word/phrase: Romanian text, translation (EN/HE), and a **"listen"
   button** playing the native TTS voice (normal + slow speed).
2. Mom taps record, says it, taps stop (or auto-stop on silence).
3. Backend pipeline:
   - Whisper transcribes (Romanian) → diacritic-aware fuzzy match against the
     target → per-word ✓/✗ and an intelligibility score.
   - Gemini receives the audio + target → returns structured JSON:
     `{ score, perWord: [{word, ok, issue}], tip }` with exactly one actionable tip.
4. App shows the words colored green/red, an overall score, and **speaks the tip
   aloud** (in English or Hebrew, per her UI setting), then replays the correct
   Romanian pronunciation.
5. "Try again" loop; visible improvement (e.g. 62 → 85) is the reward. Words she
   struggles with are queued for review.

Grading is **lenient for a beginner**: intelligible = pass; the tip pushes her
toward better, never fails her for accent.

## 5. Learning content (beginner track)

- **Sound school first:** the Romanian-specific letters — ă, â/î, ș, ț, plus
  tricky clusters (ce/ci, ge/gi, che/chi, ghe/ghi) — each with example words.
- **Themed decks:** greetings, numbers, family, food, around the house, phrases
  for real conversations. Every item: Romanian + EN + HE + TTS audio.
- **Quiz types** (the "easy" part, phase 2):
  - Multiple choice (word → meaning, meaning → word)
  - Listening comprehension (hear TTS → pick the answer)
  - Fill-in-the-blank and word matching
- **Spaced repetition:** simple Leitner boxes — items she gets wrong (in quizzes
  *or* pronunciation) come back sooner.
- **Progress:** streak, words mastered, pronunciation scores over time.
- **Mom-friendly UX:** large text and buttons, one action per screen, minimal
  navigation, everything also playable as audio.

## 6. Build phases

| Phase | Deliverable | Proves |
|---|---|---|
| **0. Walking skeleton** | PWA that installs on her phone, records audio, plays it back, plays one Romanian TTS word | Mic + audio pipeline works on *her actual phone* before we build anything else |
| **1. Pronunciation trainer** | Full core loop (§4) with ~80 starter words/phrases, EN UI | The main goal, end to end |
| **2. Lessons & quizzes** | Themed decks, quiz types, Leitner review, progress screen | The "learn Romanian better" layer |
| **3. Polish** | Hebrew UI + RTL, progress dashboard, slow-playback, streaks, nicer visuals | Daily-use quality |
| *Later ideas* | Conversation practice (realtime voice chat with an AI in simple Romanian), custom decks you add for her | — |

Each phase ends deployed and testable on her phone.

## 7. Costs (single user)

| Item | Price | Realistic monthly |
|---|---|---|
| Whisper STT | $0.006/min | well under $1 |
| Gemini Flash (audio in) | fractions of a cent per check | under $1 |
| Azure TTS | free tier: 500K chars/mo | $0 (plus we cache generated audio) |
| Hosting (Vercel/Cloudflare) | free tier | $0 |

**Total: roughly $1–3/month.** Needed: an OpenAI key, a Google AI key, an Azure
Speech key (all with simple sign-ups), and a Vercel or Cloudflare account.

## 8. Risks & mitigations

- **LLM feedback can be inconsistent** → always pair it with the objective STT
  check; constrain the coach to structured JSON with one tip.
- **STT is *too* forgiving sometimes** (guesses the word from context) → assess
  words in isolation where possible; show the actual transcript so mistakes are
  visible.
- **Phone-specific audio quirks** → Phase 0 exists precisely to catch these early
  on her real device.
- **API cost surprises** → cache all TTS audio; add a simple daily request cap.
