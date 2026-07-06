export interface Cloze {
  id: string
  /** Romanian sentence with ___ for the gap */
  ro: string
  /** the word that fills the gap */
  answer: string
  /** wrong options for multiple choice (answer is added automatically) */
  distractors: string[]
  en: string
  he: string
  tier: 1 | 2 | 3
}

let n = 0
function c(
  ro: string,
  answer: string,
  distractors: string[],
  en: string,
  he: string,
  tier: 1 | 2 | 3,
): Cloze {
  return { id: `cloze-${++n}`, ro, answer, distractors, en, he, tier }
}

export const sentences: Cloze[] = [
  // ——— tier 1 ———
  c('Eu beau ___ dimineața.', 'cafea', ['pâine', 'masă', 'ușă'], 'I drink coffee in the morning.', 'אני שותה קפה בבוקר.', 1),
  c('___ dimineața! Ce mai faci?', 'Bună', ['Noapte', 'Unde', 'Mult'], 'Good morning! How are you?', 'בוקר טוב! מה שלומך?', 1),
  c('Aș vrea un pahar cu ___ , vă rog.', 'apă', ['sare', 'cheie', 'stradă'], 'I would like a glass of water, please.', 'הייתי רוצה כוס מים, בבקשה.', 1),
  c('___ pentru ajutor!', 'Mulțumesc', ['La revedere', 'Poate', 'Departe'], 'Thank you for the help!', 'תודה על העזרה!', 1),
  c('Unde este ___ ? Vreau să cumpăr pâine.', 'magazinul', ['patul', 'cerul', 'dintele'], 'Where is the shop? I want to buy bread.', 'איפה החנות? אני רוצה לקנות לחם.', 1),
  c('Eu mănânc ___ cu unt.', 'pâine', ['apă', 'suc', 'cafea'], 'I eat bread with butter.', 'אני אוכלת לחם עם חמאה.', 1),
  c('Cât ___ acest măr?', 'costă', ['doarme', 'cântă', 'merge'], 'How much does this apple cost?', 'כמה עולה התפוח הזה?', 1),
  c('___ este mama mea.', 'Ea', ['El', 'Noi', 'Tu'], 'She is my mother.', 'היא אמא שלי.', 1),
  c('Casa mea este ___ .', 'mare', ['ieri', 'acum', 'aici'], 'My house is big.', 'הבית שלי גדול.', 1),
  c('Vreau să ___ românește.', 'vorbesc', ['mănânc', 'beau', 'dorm'], 'I want to speak Romanian.', 'אני רוצה לדבר רומנית.', 1),
  c('Noapte ___ , pe mâine!', 'bună', ['rece', 'mică', 'multă'], 'Good night, see you tomorrow!', 'לילה טוב, נתראה מחר!', 1),
  c('Am doi copii: un fiu și o ___ .', 'fiică', ['masă', 'pâine', 'oră'], 'I have two children: a son and a daughter.', 'יש לי שני ילדים: בן ובת.', 1),
  c('___ este frig afară.', 'Azi', ['Cine', 'Ce', 'Cât'], 'Today it is cold outside.', 'היום קר בחוץ.', 1),
  c('Nu ___ , vorbiți mai rar, vă rog.', 'înțeleg', ['dorm', 'plec', 'cânt'], "I don't understand, speak slower please.", 'אני לא מבינה, דברו לאט יותר בבקשה.', 1),
  c('Pisica doarme pe ___ .', 'pat', ['cer', 'drum', 'nor'], 'The cat sleeps on the bed.', 'החתול ישן על המיטה.', 1),
  c('La revedere, o zi ___ !', 'bună', ['rece', 'târzie', 'goală'], 'Goodbye, have a good day!', 'להתראות, יום טוב!', 1),

  // ——— tier 2 ———
  c('Duminică mergem la ___ să vedem un film.', 'cinema', ['farmacie', 'gară', 'pădure'], 'On Sunday we go to the cinema to see a movie.', 'ביום ראשון אנחנו הולכים לקולנוע לראות סרט.', 2),
  c('Trenul pleacă de la ___ la ora zece.', 'gară', ['bucătărie', 'grădină', 'mare'], 'The train leaves from the station at ten.', 'הרכבת יוצאת מהתחנה בשעה עשר.', 2),
  c('Îmi place să ___ cărți seara.', 'citesc', ['alerg', 'zbor', 'spăl'], 'I like to read books in the evening.', 'אני אוהבת לקרוא ספרים בערב.', 2),
  c('Bunica ___ o supă foarte gustoasă.', 'gătește', ['doarme', 'aleargă', 'scrie'], 'Grandma cooks a very tasty soup.', 'סבתא מבשלת מרק טעים מאוד.', 2),
  c('Vara este ___ , iarna este frig.', 'cald', ['rece', 'greu', 'scump'], 'In summer it is warm, in winter it is cold.', 'בקיץ חם, בחורף קר.', 2),
  c('Am cumpărat un ___ nou pentru bucătărie.', 'frigider', ['nor', 'munte', 'an'], 'I bought a new refrigerator for the kitchen.', 'קניתי מקרר חדש למטבח.', 2),
  c('El lucrează la ___ în fiecare zi.', 'birou', ['plajă', 'lună', 'iarbă'], 'He works at the office every day.', 'הוא עובד במשרד כל יום.', 2),
  c('Deschide ___ , te rog, e cald aici.', 'fereastra', ['supa', 'cartea', 'luna'], 'Open the window please, it is hot in here.', 'תפתחי את החלון בבקשה, חם כאן.', 2),
  c('Îmi ___ foarte mult muzica românească.', 'place', ['costă', 'doare', 'ninge'], 'I really like Romanian music.', 'אני מאוד אוהבת מוזיקה רומנית.', 2),
  c('Copiii se joacă în ___ .', 'parc', ['frigider', 'dulap', 'pahar'], 'The children play in the park.', 'הילדים משחקים בפארק.', 2),
  c('Aștept ___ de zece minute.', 'autobuzul', ['paharul', 'norul', 'zâmbetul'], 'I have been waiting for the bus for ten minutes.', 'אני מחכה לאוטובוס כבר עשר דקות.', 2),
  c('Mâine ___ la doctor.', 'merg', ['mănânc', 'beau', 'cânt'], 'Tomorrow I go to the doctor.', 'מחר אני הולכת לרופא.', 2),
  c('Am nevoie de o ___ pentru ușă.', 'cheie', ['lună', 'supă', 'stea'], 'I need a key for the door.', 'אני צריכה מפתח לדלת.', 2),
  c('Cartea este pe ___ , lângă lampă.', 'masă', ['cer', 'stradă', 'mare'], 'The book is on the table, next to the lamp.', 'הספר על השולחן, ליד המנורה.', 2),
  c('Sâmbătă facem ___ în piață.', 'cumpărături', ['avioane', 'stele', 'nori'], 'On Saturday we do shopping at the market.', 'בשבת אנחנו עושים קניות בשוק.', 2),
  c('El bea un ___ de portocale.', 'suc', ['nor', 'munte', 'pantof'], 'He drinks an orange juice.', 'הוא שותה מיץ תפוזים.', 2),

  // ——— tier 3 ———
  c('Dacă plouă, iau ___ cu mine.', 'umbrela', ['farfuria', 'perna', 'cheia'], 'If it rains, I take the umbrella with me.', 'אם יורד גשם, אני לוקחת את המטרייה איתי.', 3),
  c('Ne întâlnim la ___ orașului, lângă fântână.', 'centrul', ['gustul', 'sângele', 'inelul'], 'We meet in the city center, near the fountain.', 'ניפגש במרכז העיר, ליד המזרקה.', 3),
  c('A uitat să ___ ușa înainte de plecare.', 'închidă', ['mănânce', 'zboare', 'cânte'], 'He forgot to close the door before leaving.', 'הוא שכח לסגור את הדלת לפני היציאה.', 3),
  c('Medicul mi-a dat o ___ pentru farmacie.', 'rețetă', ['valiză', 'oglindă', 'plajă'], 'The doctor gave me a prescription for the pharmacy.', 'הרופא נתן לי מרשם לבית המרקחת.', 3),
  c('Îmi amintesc cu drag de ___ copilăriei.', 'satul', ['gustul', 'liftul', 'biletul'], 'I fondly remember the village of my childhood.', 'אני נזכרת באהבה בכפר ילדותי.', 3),
  c('Trebuie să ___ biletele înainte de călătorie.', 'cumpărăm', ['dormim', 'plângem', 'zâmbim'], 'We must buy the tickets before the trip.', 'אנחנו צריכים לקנות את הכרטיסים לפני הנסיעה.', 3),
  c('Toamna, frunzele cad din ___ .', 'copaci', ['pahare', 'perne', 'buzunare'], 'In autumn, the leaves fall from the trees.', 'בסתיו העלים נופלים מהעצים.', 3),
  c('Vecinul nostru este foarte ___ și ne ajută mereu.', 'amabil', ['gol', 'îngust', 'sărat'], 'Our neighbor is very kind and always helps us.', 'השכן שלנו מאוד אדיב ותמיד עוזר לנו.', 3),
  c('Am ___ trenul, așa că aștept următorul.', 'pierdut', ['gustat', 'spălat', 'cântat'], 'I missed the train, so I wait for the next one.', 'פספסתי את הרכבת, אז אני מחכה לבאה.', 3),
  c('Ea ___ să gătească sarmale ca bunica.', 'încearcă', ['zboară', 'ninge', 'doare'], 'She tries to cook sarmale like grandma.', 'היא מנסה לבשל סרמלה כמו סבתא.', 3),
  c('Mi-e ___ de familia mea din România.', 'dor', ['rest', 'gust', 'nor'], 'I miss my family in Romania.', 'אני מתגעגעת למשפחה שלי ברומניה.', 3),
  c('Muzeul este ___ lunea.', 'închis', ['dulce', 'flămând', 'tânăr'], 'The museum is closed on Mondays.', 'המוזיאון סגור בימי שני.', 3),
  c('Am primit o ___ frumoasă de ziua mea.', 'scrisoare', ['ceapă', 'coadă', 'tuse'], 'I received a beautiful letter for my birthday.', 'קיבלתי מכתב יפה ליום ההולדת שלי.', 3),
  c('Apa fierbe în ___ pe aragaz.', 'oală', ['pernă', 'geantă', 'stea'], 'The water boils in the pot on the stove.', 'המים רותחים בסיר על הכיריים.', 3),
  c('Ei ___ o casă nouă la marginea orașului.', 'construiesc', ['gustă', 'plâng', 'miros'], 'They are building a new house at the edge of the city.', 'הם בונים בית חדש בקצה העיר.', 3),
  c('Trebuie să ___ rețeta înainte să gătesc.', 'citesc', ['sparg', 'vând', 'pierd'], 'I need to read the recipe before I cook.', 'אני צריכה לקרוא את המתכון לפני שאני מבשלת.', 3),
]
