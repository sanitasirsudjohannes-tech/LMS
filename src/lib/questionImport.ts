import { readSheet } from 'read-excel-file/browser';
import { Question } from '@/types';

export type QuestionImportRow = Omit<Question, 'id' | 'training_id'>;

export interface QuestionImportError {
  row: number;
  message: string;
}

export interface QuestionImportResult {
  validRows: QuestionImportRow[];
  errors: QuestionImportError[];
  duplicateCount: number;
}

const REQUIRED_HEADERS = [
  'jenis_tes', 'pertanyaan', 'pilihan_a', 'pilihan_b',
  'pilihan_c', 'pilihan_d', 'kunci_jawaban'
] as const;

const HEADER_ALIASES: Record<string, string> = {
  jenis: 'jenis_tes', tipe_tes: 'jenis_tes', test_type: 'jenis_tes',
  soal: 'pertanyaan', question: 'pertanyaan', option_a: 'pilihan_a',
  option_b: 'pilihan_b', option_c: 'pilihan_c', option_d: 'pilihan_d',
  jawaban_benar: 'kunci_jawaban', correct_answer: 'kunci_jawaban', status_aktif: 'aktif'
};

const normalizeHeader = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return HEADER_ALIASES[normalized] || normalized;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'ya', 'yes', 'aktif'].includes(normalized)) return true;
  if (['0', 'false', 'tidak', 'no', 'nonaktif'].includes(normalized)) return false;
  return null;
};

const parseTestType = (value: unknown): 'pretest' | 'posttest' | null => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (normalized === 'pretest') return 'pretest';
  if (normalized === 'posttest') return 'posttest';
  return null;
};

const questionKey = (row: Pick<QuestionImportRow, 'test_type' | 'question'>) =>
  `${row.test_type}|${row.question.trim().toLowerCase().replace(/\s+/g, ' ')}`;

export async function readQuestionImportFile(file: File): Promise<unknown[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx') return readSheet(file);
  if (extension === 'csv') return parseCsv(await file.text());
  throw new Error('Format file tidak didukung. Gunakan file .xlsx atau .csv.');
}

export function validateQuestionRows(
  rows: unknown[][],
  existingQuestions: Question[] = []
): QuestionImportResult {
  if (rows.length === 0) {
    return { validRows: [], errors: [{ row: 1, message: 'File kosong.' }], duplicateCount: 0 };
  }
  if (rows.length > 1001) {
    return { validRows: [], errors: [{ row: 1, message: 'Maksimal 1.000 soal dalam satu kali impor.' }], duplicateCount: 0 };
  }

  const headers = rows[0].map(normalizeHeader);
  const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missingHeaders.length > 0) {
    return { validRows: [], errors: [{ row: 1, message: `Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}.` }], duplicateCount: 0 };
  }

  const indexOf = (header: string) => headers.indexOf(header);
  const seen = new Set(existingQuestions.map(questionKey));
  const validRows: QuestionImportRow[] = [];
  const errors: QuestionImportError[] = [];
  let duplicateCount = 0;

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const get = (header: string) => cells[indexOf(header)];
    const testType = parseTestType(get('jenis_tes'));
    const question = String(get('pertanyaan') ?? '').trim();
    const optionA = String(get('pilihan_a') ?? '').trim();
    const optionB = String(get('pilihan_b') ?? '').trim();
    const optionC = String(get('pilihan_c') ?? '').trim();
    const optionD = String(get('pilihan_d') ?? '').trim();
    const correctAnswer = String(get('kunci_jawaban') ?? '').trim().toUpperCase();
    const active = parseBoolean(indexOf('aktif') >= 0 ? get('aktif') : undefined);
    const rowErrors: string[] = [];

    if (!testType) rowErrors.push('jenis_tes harus pretest atau posttest');
    if (!question) rowErrors.push('pertanyaan kosong');
    if (!optionA || !optionB || !optionC || !optionD) rowErrors.push('pilihan A–D wajib diisi');
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) rowErrors.push('kunci_jawaban harus A, B, C, atau D');
    if (active === null) rowErrors.push('aktif harus ya/tidak atau true/false');

    if (rowErrors.length > 0 || !testType || active === null) {
      errors.push({ row: rowNumber, message: rowErrors.join('; ') });
      return;
    }

    const parsed: QuestionImportRow = {
      test_type: testType,
      question,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      correct_answer: correctAnswer as QuestionImportRow['correct_answer'],
      active
    };
    const key = questionKey(parsed);
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);
    validRows.push(parsed);
  });

  return { validRows, errors, duplicateCount };
}

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function downloadQuestionImportTemplate() {
  const headers = [...REQUIRED_HEADERS, 'aktif'];
  const examples = [
    ['pretest', 'Apa tujuan utama keselamatan pasien?', 'Mencegah cedera', 'Menambah biaya', 'Mengurangi petugas', 'Memperpanjang antrean', 'A', 'ya'],
    ['posttest', 'Kapan kebersihan tangan dilakukan?', 'Hanya pagi', 'Sebelum dan sesudah kontak pasien', 'Saat diawasi', 'Seminggu sekali', 'B', 'ya']
  ];
  const csv = [headers, ...examples].map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'template_import_soal_lms.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
