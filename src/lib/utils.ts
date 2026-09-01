export function toRomanMonth(monthIndex: number): string {
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romanMonths[monthIndex] || 'I';
}

export function formatCertificateNumber(
  format: string,
  num: number,
  digits: number = 4,
  date: Date = new Date()
): string {
  const paddedNum = String(num).padStart(digits, '0');
  const yearFull = date.getFullYear().toString();
  const yearTwo = date.getFullYear().toString().slice(-2);
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');
  const monthRoman = toRomanMonth(date.getMonth());

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

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
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
