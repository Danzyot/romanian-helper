export type Lang = 'en' | 'he'

const strings = {
  en: {
    appName: 'Română',
    switchLang: 'עברית',
    // tabs
    tabPractice: 'Practice',
    tabQuiz: 'Quizzes',
    tabProgress: 'Progress',
    // search
    searchPlaceholder: 'Search in română · English · עברית',
    noResults: 'No match in the dictionary.',
    practiceAnyway: (w: string) => `Practice “${w}” anyway`,
    suggestedToday: 'For today',
    // practice card
    soundsLike: 'Sounds like',
    listen: 'Listen',
    listenSlow: 'Slow',
    record: 'Record yourself',
    stop: 'Stop',
    playBack: 'Play my recording',
    recording: 'Recording… speak now!',
    practiceDone: 'Nice! Practiced ✓',
    backToSearch: 'Choose another word',
    micDenied:
      'Microphone access was blocked. Allow the microphone in your browser settings and try again.',
    micError: 'Could not start recording on this device.',
    noVoice:
      'No Romanian voice was found on this device, so "Listen" may stay silent. On Android, install/enable Google Text-to-speech.',
    // quiz
    quizTitle: 'Quiz',
    quizIntro: 'Ten quick questions, picked for your level.',
    quizStart: 'Start a quiz',
    quizWhatMeans: (w: string) => `What does “${w}” mean?`,
    quizWhichWord: (m: string) => `Which word means “${m}”?`,
    quizListenPick: 'Listen 🔊 — what did you hear?',
    quizPlay: 'Play the word',
    quizNext: 'Next',
    quizCorrect: 'Correct!',
    quizWrong: (a: string) => `Not quite — it's “${a}”.`,
    quizDoneTitle: 'Quiz finished',
    quizScore: (ok: number, n: number) => `${ok} of ${n} correct`,
    quizAgain: 'Another quiz',
    // progress
    progressTitle: 'Your progress',
    level: 'Level',
    toNextLevel: 'to the next level',
    statPracticed: 'Words practiced',
    statMastered: 'Words mastered',
    statStreak: 'Day streak',
    statAccuracy: 'Quiz accuracy',
    progressHint:
      'The level rises as words are mastered — answer quizzes correctly and words move up; harder words unlock automatically.',
    progressEmpty: 'Do a quiz or practice a few words and progress appears here.',
  },
  he: {
    appName: 'רומנית',
    switchLang: 'English',
    tabPractice: 'תרגול',
    tabQuiz: 'חידונים',
    tabProgress: 'התקדמות',
    searchPlaceholder: 'חפשי ברומנית · אנגלית · עברית',
    noResults: 'אין התאמה במילון.',
    practiceAnyway: (w: string) => `לתרגל את “${w}” בכל זאת`,
    suggestedToday: 'להיום',
    soundsLike: 'נשמע כמו',
    listen: 'האזיני',
    listenSlow: 'לאט',
    record: 'הקליטי את עצמך',
    stop: 'עצרי',
    playBack: 'השמיעי את ההקלטה שלי',
    recording: '...מקליט, דברי עכשיו',
    practiceDone: '✓ יפה! תורגל',
    backToSearch: 'לבחור מילה אחרת',
    micDenied:
      'הגישה למיקרופון נחסמה. אפשרי גישה למיקרופון בהגדרות הדפדפן ונסי שוב.',
    micError: 'לא ניתן להתחיל הקלטה במכשיר זה.',
    noVoice:
      'לא נמצא קול רומני במכשיר, ולכן ייתכן ש"האזיני" יישאר שקט. באנדרואיד, הפעילי את Google Text-to-speech.',
    quizTitle: 'חידון',
    quizIntro: 'עשר שאלות קצרות, מותאמות לרמה שלך.',
    quizStart: 'התחילי חידון',
    quizWhatMeans: (w: string) => `?“${w}” מה פירוש`,
    quizWhichWord: (m: string) => `?“${m}” איזו מילה פירושה`,
    quizListenPick: '?האזיני 🔊 — מה שמעת',
    quizPlay: 'השמיעי את המילה',
    quizNext: 'הבא',
    quizCorrect: '!נכון',
    quizWrong: (a: string) => `.“${a}” לא בדיוק — התשובה היא`,
    quizDoneTitle: 'החידון הסתיים',
    quizScore: (ok: number, n: number) => `${ok} מתוך ${n} נכונות`,
    quizAgain: 'חידון נוסף',
    progressTitle: 'ההתקדמות שלך',
    level: 'רמה',
    toNextLevel: 'לרמה הבאה',
    statPracticed: 'מילים שתורגלו',
    statMastered: 'מילים שנלמדו',
    statStreak: 'ימים ברצף',
    statAccuracy: 'דיוק בחידונים',
    progressHint:
      'הרמה עולה ככל שלומדים מילים — תשובות נכונות בחידונים מקדמות מילים, ומילים קשות יותר נפתחות אוטומטית.',
    progressEmpty: 'עשי חידון או תרגלי כמה מילים וההתקדמות תופיע כאן.',
  },
} as const

export type Strings = (typeof strings)[Lang]

export function t(lang: Lang): Strings {
  return strings[lang]
}
