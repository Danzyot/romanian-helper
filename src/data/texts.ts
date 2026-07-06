export interface TextMcq {
  type: 'mcq'
  prompt: { en: string; he: string }
  options: { en: string[]; he: string[] }
  answerIdx: number
}

export interface TextWrite {
  type: 'write'
  prompt: { en: string; he: string }
  /** accepted Romanian answers (first one is displayed as the solution) */
  accepted: string[]
}

export type TextQuestion = TextMcq | TextWrite

export interface Passage {
  id: string
  tier: 1 | 2 | 3
  ro: string
  en: string
  he: string
  questions: TextQuestion[]
}

export const passages: Passage[] = [
  {
    id: 'text-cafea',
    tier: 1,
    ro: 'Maria bea cafea în fiecare dimineață. Ea mănâncă pâine cu brânză. Apoi merge la magazin.',
    en: 'Maria drinks coffee every morning. She eats bread with cheese. Then she goes to the shop.',
    he: 'מריה שותה קפה כל בוקר. היא אוכלת לחם עם גבינה. אחר כך היא הולכת לחנות.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: 'What does Maria drink?', he: 'מה מריה שותה?' },
        options: {
          en: ['Coffee', 'Tea', 'Juice', 'Milk'],
          he: ['קפה', 'תה', 'מיץ', 'חלב'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'Where does she go afterwards?', he: 'לאן היא הולכת אחר כך?' },
        options: {
          en: ['To the shop', 'To school', 'To the park', 'To the doctor'],
          he: ['לחנות', 'לבית הספר', 'לפארק', 'לרופא'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "bread" from the text.',
          he: 'כתבי את המילה הרומנית ל"לחם" מהטקסט.',
        },
        accepted: ['pâine', 'paine'],
      },
    ],
  },
  {
    id: 'text-familie',
    tier: 1,
    ro: 'Ana are o familie mare. Mama ei se numește Elena și tatăl ei se numește Ion. Ea are un frate și o soră.',
    en: 'Ana has a big family. Her mother is called Elena and her father is called Ion. She has a brother and a sister.',
    he: 'לאנה יש משפחה גדולה. אמא שלה נקראת אלנה ואבא שלה נקרא יון. יש לה אח ואחות.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: "What is the mother's name?", he: 'מה שם האם?' },
        options: {
          en: ['Elena', 'Ana', 'Maria', 'Ioana'],
          he: ['אלנה', 'אנה', 'מריה', 'יואנה'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'How many siblings does Ana have?', he: 'כמה אחים ואחיות יש לאנה?' },
        options: {
          en: ['Two', 'One', 'Three', 'None'],
          he: ['שניים', 'אחד', 'שלושה', 'אף אחד'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "sister" from the text.',
          he: 'כתבי את המילה הרומנית ל"אחות" מהטקסט.',
        },
        accepted: ['soră', 'sora'],
      },
    ],
  },
  {
    id: 'text-piata',
    tier: 2,
    ro: 'Sâmbătă dimineața, Radu merge la piață. El cumpără roșii, castraveți și brânză proaspătă. Piața este aproape de casa lui, așa că merge pe jos. Vânzătorii îl cunosc și îi dau mereu cele mai bune legume.',
    en: 'On Saturday morning, Radu goes to the market. He buys tomatoes, cucumbers, and fresh cheese. The market is close to his house, so he walks. The sellers know him and always give him the best vegetables.',
    he: 'בשבת בבוקר ראדו הולך לשוק. הוא קונה עגבניות, מלפפונים וגבינה טרייה. השוק קרוב לבית שלו, אז הוא הולך ברגל. המוכרים מכירים אותו ותמיד נותנים לו את הירקות הכי טובים.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: 'When does Radu go to the market?', he: 'מתי ראדו הולך לשוק?' },
        options: {
          en: ['Saturday morning', 'Sunday evening', 'Monday morning', 'Friday afternoon'],
          he: ['שבת בבוקר', 'ראשון בערב', 'שני בבוקר', 'שישי אחר הצהריים'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'How does he get there?', he: 'איך הוא מגיע לשם?' },
        options: {
          en: ['On foot', 'By car', 'By bus', 'By bicycle'],
          he: ['ברגל', 'במכונית', 'באוטובוס', 'באופניים'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "tomatoes" from the text.',
          he: 'כתבי את המילה הרומנית ל"עגבניות" מהטקסט.',
        },
        accepted: ['roșii', 'rosii'],
      },
    ],
  },
  {
    id: 'text-vacanta',
    tier: 2,
    ro: 'Vara trecută, familia Popescu a fost în vacanță la munte. Au stat la un hotel mic și au mers în fiecare zi pe jos prin pădure. Copiii au văzut un lac frumos și au făcut multe poze. Seara, au mâncat la un restaurant cu mâncare tradițională.',
    en: 'Last summer, the Popescu family went on vacation to the mountains. They stayed at a small hotel and walked through the forest every day. The children saw a beautiful lake and took many photos. In the evening, they ate at a restaurant with traditional food.',
    he: 'בקיץ שעבר משפחת פופסקו נסעה לחופשה בהרים. הם שהו במלון קטן והלכו כל יום ביער. הילדים ראו אגם יפה וצילמו הרבה תמונות. בערב הם אכלו במסעדה עם אוכל מסורתי.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: 'Where did the family go on vacation?', he: 'לאן נסעה המשפחה לחופשה?' },
        options: {
          en: ['To the mountains', 'To the seaside', 'To the city', 'Abroad'],
          he: ['להרים', 'לים', 'לעיר', 'לחו"ל'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'What did the children see?', he: 'מה הילדים ראו?' },
        options: {
          en: ['A beautiful lake', 'A castle', 'A museum', 'A train'],
          he: ['אגם יפה', 'טירה', 'מוזיאון', 'רכבת'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "forest" from the text.',
          he: 'כתבי את המילה הרומנית ל"יער" מהטקסט.',
        },
        accepted: ['pădure', 'padure', 'pădurea', 'padurea'],
      },
    ],
  },
  {
    id: 'text-reteta',
    tier: 3,
    ro: 'Bunica Ioana face cele mai bune sarmale din sat. Rețeta este veche de o sută de ani și a primit-o de la mama ei. Ea folosește varză murată, carne și orez. Sarmalele fierb încet, ore întregi, pe aragaz. Tot satul vine la ea de sărbători.',
    en: 'Grandma Ioana makes the best sarmale in the village. The recipe is a hundred years old, and she received it from her mother. She uses pickled cabbage, meat, and rice. The sarmale simmer slowly, for hours, on the stove. The whole village comes to her on holidays.',
    he: 'סבתא יואנה מכינה את הסרמלה הכי טובים בכפר. המתכון בן מאה שנה, והיא קיבלה אותו מאמא שלה. היא משתמשת בכרוב כבוש, בשר ואורז. הסרמלה מתבשלים לאט, שעות שלמות, על הכיריים. כל הכפר בא אליה בחגים.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: 'How old is the recipe?', he: 'בן כמה המתכון?' },
        options: {
          en: ['A hundred years', 'Fifty years', 'Ten years', 'A thousand years'],
          he: ['מאה שנה', 'חמישים שנה', 'עשר שנים', 'אלף שנה'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'Who gave her the recipe?', he: 'ממי היא קיבלה את המתכון?' },
        options: {
          en: ['Her mother', 'Her neighbor', 'A cookbook', 'Her grandmother'],
          he: ['אמא שלה', 'השכנה שלה', 'ספר בישול', 'סבתא שלה'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "rice" from the text.',
          he: 'כתבי את המילה הרומנית ל"אורז" מהטקסט.',
        },
        accepted: ['orez'],
      },
    ],
  },
  {
    id: 'text-bucuresti',
    tier: 3,
    ro: 'Bucureștiul este capitala României și cel mai mare oraș din țară. În centrul vechi sunt multe restaurante și cafenele. Turiștii vizitează Palatul Parlamentului, una dintre cele mai mari clădiri din lume. Primăvara, parcurile orașului sunt pline de flori.',
    en: 'Bucharest is the capital of Romania and the largest city in the country. In the old center there are many restaurants and cafés. Tourists visit the Palace of the Parliament, one of the largest buildings in the world. In spring, the city parks are full of flowers.',
    he: 'בוקרשט היא בירת רומניה והעיר הגדולה במדינה. במרכז הישן יש הרבה מסעדות ובתי קפה. תיירים מבקרים בארמון הפרלמנט, אחד הבניינים הגדולים בעולם. באביב, פארקי העיר מלאים בפרחים.',
    questions: [
      {
        type: 'mcq',
        prompt: { en: 'What is Bucharest?', he: 'מהי בוקרשט?' },
        options: {
          en: ['The capital of Romania', 'A mountain village', 'A seaside resort', 'A river'],
          he: ['בירת רומניה', 'כפר הרים', 'עיירת נופש בים', 'נהר'],
        },
        answerIdx: 0,
      },
      {
        type: 'mcq',
        prompt: { en: 'What do tourists visit?', he: 'במה מבקרים התיירים?' },
        options: {
          en: ['The Palace of the Parliament', 'The old port', 'A famous bridge', 'The zoo'],
          he: ['ארמון הפרלמנט', 'הנמל הישן', 'גשר מפורסם', 'גן החיות'],
        },
        answerIdx: 0,
      },
      {
        type: 'write',
        prompt: {
          en: 'Write the Romanian word for "flowers" from the text.',
          he: 'כתבי את המילה הרומנית ל"פרחים" מהטקסט.',
        },
        accepted: ['flori'],
      },
    ],
  },
]
