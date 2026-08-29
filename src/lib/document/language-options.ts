export type OcrLanguageCode = 'eng' | 'fra' | 'deu' | 'spa' | 'ita' | 'nld' | 'por';

export interface OcrLanguageOption {
  code: OcrLanguageCode;
  iso3: string;
  label: string;
}

export const OCR_LANGUAGES: OcrLanguageOption[] = [
  { code: 'eng', iso3: 'eng', label: 'English' },
  { code: 'fra', iso3: 'fra', label: 'French' },
  { code: 'deu', iso3: 'deu', label: 'German' },
  { code: 'spa', iso3: 'spa', label: 'Spanish' },
  { code: 'ita', iso3: 'ita', label: 'Italian' },
  { code: 'nld', iso3: 'nld', label: 'Dutch' },
  { code: 'por', iso3: 'por', label: 'Portuguese' },
];
