export type Lang = 'en' | 'he'

const strings = {
  en: {
    appName: 'Romanian Helper',
    listen: 'Listen',
    listenSlow: 'Slow',
    record: 'Record yourself',
    stop: 'Stop',
    playBack: 'Play my recording',
    recording: 'Recording… speak now!',
    prev: 'Back',
    next: 'Next',
    wordOf: (i: number, n: number) => `Word ${i} of ${n}`,
    soundsLike: 'Sounds like',
    micDenied:
      'Microphone access was blocked. Allow the microphone in your browser settings and try again.',
    micError: 'Could not start recording on this device.',
    noVoice:
      'No Romanian voice was found on this device, so "Listen" may stay silent. On Android, install/enable Google Text-to-speech.',
    switchLang: 'עברית',
  },
  he: {
    appName: 'עוזר רומנית',
    listen: 'האזיני',
    listenSlow: 'לאט',
    record: 'הקליטי את עצמך',
    stop: 'עצרי',
    playBack: 'השמיעי את ההקלטה שלי',
    recording: '...מקליט, דברי עכשיו',
    prev: 'חזרה',
    next: 'הבא',
    wordOf: (i: number, n: number) => `מילה ${i} מתוך ${n}`,
    soundsLike: 'נשמע כמו',
    micDenied:
      'הגישה למיקרופון נחסמה. אפשרי גישה למיקרופון בהגדרות הדפדפן ונסי שוב.',
    micError: 'לא ניתן להתחיל הקלטה במכשיר זה.',
    noVoice:
      'לא נמצא קול רומני במכשיר, ולכן ייתכן ש"האזיני" יישאר שקט. באנדרואיד, הפעילי את Google Text-to-speech.',
    switchLang: 'English',
  },
} as const

export type Strings = (typeof strings)[Lang]

export function t(lang: Lang): Strings {
  return strings[lang]
}
