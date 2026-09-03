export function toRomanMonth(monthIndex: number): string {
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romanMonths[monthIndex] || 'I';
}

function getWitaDateParts(date: Date): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Makassar'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month
  };
}

export function formatCertificateNumber(
  format: string,
  num: number,
  digits: number = 4,
  date: Date = new Date()
): string {
  const paddedNum = String(num).padStart(digits, '0');
  const { year: yearFull, month: monthNum } = getWitaDateParts(date);
  const yearTwo = yearFull.slice(-2);
  const monthRoman = toRomanMonth(Math.max(0, Number(monthNum) - 1));

  let result = format || '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}';
  result = result.replace(/{NO}/g, paddedNum);
  result = result.replace(/{TAHUN}/g, yearFull);
  result = result.replace(/{TAHUN2}/g, yearTwo);
  result = result.replace(/{BULAN}/g, monthNum);
  result = result.replace(/{BULAN_ROMAWI}/g, monthRoman);

  return result;
}

export function formatDateIndonesian(dateString?: string | Date): string {
  if (!dateString) return '-';
  const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar'
  }).format(d);
}

export function formatDateInputWita(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Makassar'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toWitaDateBoundary(date: string, boundary: 'start' | 'end'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Format tanggal tidak valid.');
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  const parsed = new Date(`${date}T${time}+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Tanggal tidak valid.');
  return parsed.toISOString();
}

export function isTrainingAvailable(
  training: { active: boolean; start_date?: string | null; end_date?: string | null },
  now: Date = new Date()
): boolean {
  if (!training.active) return false;
  const nowMs = now.getTime();
  const startMs = training.start_date ? new Date(training.start_date).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = training.end_date ? new Date(training.end_date).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  return startMs <= nowMs && endMs >= nowMs;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} detik`;
  if (secs === 0) return `${mins} menit`;
  return `${mins} menit ${secs} detik`;
}

export function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
