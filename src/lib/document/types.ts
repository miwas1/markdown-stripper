export type ConversionMode = 'plain' | 'readable' | 'ai';

export type ReferenceKind = 'link' | 'image' | 'email';

export interface DocumentReference {
  id: string;
  label: string;
  url: string;
  title?: string;
  kind: ReferenceKind;
  firstSeen: number;
  sourceLine: number;
  defined: boolean;
  used: boolean;
}

export interface ConversionOptions {
  mode: ConversionMode;
  appendReferences: boolean;
}

export interface ConversionResult {
  text: string;
  references: DocumentReference[];
  brokenReferences: string[];
}

export type SafetyFindingType =
  | 'secret'
  | 'personal-data'
  | 'financial-data'
  | 'invisible-text'
  | 'hidden-content'
  | 'prompt-injection'
  | 'encoded-content';

export type SafetySeverity = 'high' | 'medium' | 'low';

export interface SafetyFinding {
  id: string;
  /** Revision marker for the exact source text that produced this finding. */
  documentFingerprint: string;
  type: SafetyFindingType;
  severity: SafetySeverity;
  title: string;
  detail: string;
  value: string;
  start: number;
  end: number;
  line: number;
  placeholder: string;
  source: 'rule' | 'local-ai';
  confidence?: number;
  modelLabel?: string;
}

export interface ImportedDocument {
  text: string;
  fileName: string;
  format: 'markdown' | 'text' | 'html' | 'docx' | 'pdf' | 'image';
  warnings: string[];
  ocr?: OcrSource;
}

export interface OcrSource {
  kind: 'pdf' | 'image';
  file: File;
  /** Text for every PDF page; empty entries are the pages needing OCR. */
  pageTexts?: string[];
  pageNumbers?: number[];
}
