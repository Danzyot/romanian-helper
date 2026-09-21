export const PERSONS = ['eu', 'tu', 'el/ea', 'noi', 'voi', 'ei/ele'] as const
export type PersonIndex = 0 | 1 | 2 | 3 | 4 | 5

export const PERSON_LABELS: Record<'en' | 'he', string[]> = {
  en: ['I', 'you', 'he/she', 'we', 'you (plural)', 'they'],
  he: ['אני', 'את/אתה', 'הוא/היא', 'אנחנו', 'אתם/אתן', 'הם/הן'],
}

export interface Verb {
  /** infinitive, e.g. "a merge" */
  inf: string
  en: string
  he: string
  /** present-tense forms for eu, tu, el/ea, noi, voi, ei/ele */
  forms: [string, string, string, string, string, string]
  tier: 1 | 2 | 3
}

function v(
  inf: string,
  en: string,
  he: string,
  forms: [string, string, string, string, string, string],
  tier: 1 | 2 | 3,
): Verb {
  return { inf, en, he, forms, tier }
}

export const verbs: Verb[] = [
  v('a fi', 'to be', 'להיות', ['sunt', 'ești', 'este', 'suntem', 'sunteți', 'sunt'], 1),
  v('a avea', 'to have', 'שיהיה ל־', ['am', 'ai', 'are', 'avem', 'aveți', 'au'], 1),
  v('a merge', 'to go', 'ללכת', ['merg', 'mergi', 'merge', 'mergem', 'mergeți', 'merg'], 1),
  v('a mânca', 'to eat', 'לאכול', ['mănânc', 'mănânci', 'mănâncă', 'mâncăm', 'mâncați', 'mănâncă'], 1),
  v('a bea', 'to drink', 'לשתות', ['beau', 'bei', 'bea', 'bem', 'beți', 'beau'], 1),
  v('a face', 'to do / make', 'לעשות', ['fac', 'faci', 'face', 'facem', 'faceți', 'fac'], 1),
  v('a vrea', 'to want', 'לרצות', ['vreau', 'vrei', 'vrea', 'vrem', 'vreți', 'vor'], 1),
  v('a putea', 'to be able', 'להיות מסוגל', ['pot', 'poți', 'poate', 'putem', 'puteți', 'pot'], 1),
  v('a ști', 'to know', 'לדעת', ['știu', 'știi', 'știe', 'știm', 'știți', 'știu'], 1),
  v('a da', 'to give', 'לתת', ['dau', 'dai', 'dă', 'dăm', 'dați', 'dau'], 1),
  v('a lua', 'to take', 'לקחת', ['iau', 'iei', 'ia', 'luăm', 'luați', 'iau'], 1),
  v('a veni', 'to come', 'לבוא', ['vin', 'vii', 'vine', 'venim', 'veniți', 'vin'], 1),
  v('a spune', 'to say', 'להגיד', ['spun', 'spui', 'spune', 'spunem', 'spuneți', 'spun'], 1),
  v('a vedea', 'to see', 'לראות', ['văd', 'vezi', 'vede', 'vedem', 'vedeți', 'văd'], 1),
  v('a vorbi', 'to speak', 'לדבר', ['vorbesc', 'vorbești', 'vorbește', 'vorbim', 'vorbiți', 'vorbesc'], 1),
  v('a dormi', 'to sleep', 'לישון', ['dorm', 'dormi', 'doarme', 'dormim', 'dormiți', 'dorm'], 1),
  v('a sta', 'to stay / sit', 'להישאר / לשבת', ['stau', 'stai', 'stă', 'stăm', 'stați', 'stau'], 1),
  v('a lucra', 'to work', 'לעבוד', ['lucrez', 'lucrezi', 'lucrează', 'lucrăm', 'lucrați', 'lucrează'], 2),
  v('a locui', 'to live (reside)', 'לגור', ['locuiesc', 'locuiești', 'locuiește', 'locuim', 'locuiți', 'locuiesc'], 2),
  v('a citi', 'to read', 'לקרוא', ['citesc', 'citești', 'citește', 'citim', 'citiți', 'citesc'], 2),
  v('a scrie', 'to write', 'לכתוב', ['scriu', 'scrii', 'scrie', 'scriem', 'scrieți', 'scriu'], 2),
  v('a cumpăra', 'to buy', 'לקנות', ['cumpăr', 'cumperi', 'cumpără', 'cumpărăm', 'cumpărați', 'cumpără'], 2),
  v('a plăti', 'to pay', 'לשלם', ['plătesc', 'plătești', 'plătește', 'plătim', 'plătiți', 'plătesc'], 2),
  v('a găti', 'to cook', 'לבשל', ['gătesc', 'gătești', 'gătește', 'gătim', 'gătiți', 'gătesc'], 2),
  v('a ajuta', 'to help', 'לעזור', ['ajut', 'ajuți', 'ajută', 'ajutăm', 'ajutați', 'ajută'], 2),
  v('a iubi', 'to love', 'לאהוב', ['iubesc', 'iubești', 'iubește', 'iubim', 'iubiți', 'iubesc'], 2),
  v('a înțelege', 'to understand', 'להבין', ['înțeleg', 'înțelegi', 'înțelege', 'înțelegem', 'înțelegeți', 'înțeleg'], 2),
  v('a aștepta', 'to wait', 'לחכות', ['aștept', 'aștepți', 'așteaptă', 'așteptăm', 'așteptați', 'așteaptă'], 2),
  v('a pleca', 'to leave', 'לעזוב / לצאת', ['plec', 'pleci', 'pleacă', 'plecăm', 'plecați', 'pleacă'], 2),
  v('a ajunge', 'to arrive', 'להגיע', ['ajung', 'ajungi', 'ajunge', 'ajungem', 'ajungeți', 'ajung'], 2),
  v('a intra', 'to enter', 'להיכנס', ['intru', 'intri', 'intră', 'intrăm', 'intrați', 'intră'], 2),
  v('a ieși', 'to go out', 'לצאת', ['ies', 'ieși', 'iese', 'ieșim', 'ieșiți', 'ies'], 2),
  v('a asculta', 'to listen', 'להקשיב', ['ascult', 'asculți', 'ascultă', 'ascultăm', 'ascultați', 'ascultă'], 2),
  v('a răspunde', 'to answer', 'לענות', ['răspund', 'răspunzi', 'răspunde', 'răspundem', 'răspundeți', 'răspund'], 2),
  v('a crede', 'to believe', 'להאמין', ['cred', 'crezi', 'crede', 'credem', 'credeți', 'cred'], 2),
  v('a căuta', 'to search', 'לחפש', ['caut', 'cauți', 'caută', 'căutăm', 'căutați', 'caută'], 3),
  v('a găsi', 'to find', 'למצוא', ['găsesc', 'găsești', 'găsește', 'găsim', 'găsiți', 'găsesc'], 3),
  v('a deschide', 'to open', 'לפתוח', ['deschid', 'deschizi', 'deschide', 'deschidem', 'deschideți', 'deschid'], 3),
  v('a închide', 'to close', 'לסגור', ['închid', 'închizi', 'închide', 'închidem', 'închideți', 'închid'], 3),
  v('a începe', 'to begin', 'להתחיל', ['încep', 'începi', 'începe', 'începem', 'începeți', 'încep'], 3),
  v('a termina', 'to finish', 'לסיים', ['termin', 'termini', 'termină', 'terminăm', 'terminați', 'termină'], 3),
  v('a trăi', 'to live', 'לחיות', ['trăiesc', 'trăiești', 'trăiește', 'trăim', 'trăiți', 'trăiesc'], 3),
]
