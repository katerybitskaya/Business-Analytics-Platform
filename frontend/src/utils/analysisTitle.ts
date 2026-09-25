import { getLang } from '@/i18n/i18n';

const TITLE_LABELS: Record<string, Record<string, string>> = {
  'eisenhower':        { ru: 'Эйзенхауэр',       pl: 'Eisenhower',       en: 'Eisenhower'       },
  'schedule':          { ru: 'Гармонограмма',     pl: 'Harmonogram',      en: 'Schedule'         },
  'punktowa-dostawcy': { ru: 'Анализ поставщиков', pl: 'Analiza dostawców', en: 'Supplier Analysis' },
  'punktowa-odbiorcy': { ru: 'Анализ получателей', pl: 'Analiza odbiorców', en: 'Customer Analysis' },
  'audyt':             { ru: 'Аудит',             pl: 'Audyt',            en: 'Audit'            },
  'swot':              { ru: 'SWOT',              pl: 'SWOT',             en: 'SWOT'             },
  'tows':              { ru: 'TOWS',              pl: 'TOWS',             en: 'TOWS'             },
  'swot-tows':         { ru: 'SWOT-TOWS',         pl: 'SWOT-TOWS',        en: 'SWOT-TOWS'        },
  'abc-xyz':           { ru: 'ABC/XYZ',           pl: 'ABC/XYZ',          en: 'ABC/XYZ'          },
};

export function getDisplayTitle(type: string, title: string | null | undefined): string {
  if (!title) return '';
  const m = title.match(/^(.+?)\s*#(\d+)$/);
  if (m) {
    const prefix = m[1].trim().toLowerCase().replace(/\//g, '-');
    if (prefix === type) {
      const lang = getLang();
      const labels = TITLE_LABELS[type];
      const label = labels ? (labels[lang] ?? labels['en'] ?? type) : type;
      return `${label} #${m[2]}`;
    }
  }
  return title;
}

export function typeLabel(type: string): string {
  const lang = getLang();
  const FULL_LABELS: Record<string, Record<string, string>> = {
    'swot':              { ru: 'SWOT',                    pl: 'SWOT',                     en: 'SWOT'                    },
    'tows':              { ru: 'TOWS',                    pl: 'TOWS',                     en: 'TOWS'                    },
    'swot-tows':         { ru: 'SWOT-TOWS',               pl: 'SWOT-TOWS',                en: 'SWOT-TOWS'               },
    'abc-xyz':           { ru: 'ABC/XYZ',                 pl: 'ABC/XYZ',                  en: 'ABC/XYZ'                 },
    'eisenhower':        { ru: 'Матрица Эйзенхауэра',     pl: 'Macierz Eisenhowera',      en: 'Eisenhower Matrix'       },
    'schedule':          { ru: 'Гармонограмма (Ганта)',   pl: 'Harmonogram (Gantt)',      en: 'Schedule (Gantt)'        },
    'punktowa-dostawcy': { ru: 'Анализ поставщиков',      pl: 'Analiza dostawców',        en: 'Supplier Analysis'       },
    'punktowa-odbiorcy': { ru: 'Анализ получателей',      pl: 'Analiza odbiorców',        en: 'Customer Analysis'       },
    'audyt':             { ru: 'Аудит качества',          pl: 'Audyt jakości',            en: 'Quality Audit'           },
  };
  const entry = FULL_LABELS[type];
  return entry ? (entry[lang] ?? entry['en'] ?? type) : type;
}
