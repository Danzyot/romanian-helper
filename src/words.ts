export interface Word {
  ro: string
  en: string
  he: string
  /** How it sounds, written for English readers */
  hint: string
}

export const words: Word[] = [
  { ro: 'Bună!', en: 'Hello!', he: '!שלום', hint: 'BOO-nuh' },
  { ro: 'Mulțumesc', en: 'Thank you', he: 'תודה', hint: 'mool-tsoo-MESK' },
  { ro: 'Da', en: 'Yes', he: 'כן', hint: 'dah' },
  { ro: 'Nu', en: 'No', he: 'לא', hint: 'noo' },
  { ro: 'Apă', en: 'Water', he: 'מים', hint: 'AH-puh' },
  { ro: 'Pâine', en: 'Bread', he: 'לחם', hint: 'PUY-neh' },
  {
    ro: 'Bună dimineața',
    en: 'Good morning',
    he: 'בוקר טוב',
    hint: 'BOO-nuh dee-mee-NYAH-tsah',
  },
  {
    ro: 'La revedere',
    en: 'Goodbye',
    he: 'להתראות',
    hint: 'lah reh-veh-DEH-reh',
  },
  {
    ro: 'Ce mai faci?',
    en: 'How are you?',
    he: '?מה שלומך',
    hint: 'cheh my FAHTCH',
  },
]
