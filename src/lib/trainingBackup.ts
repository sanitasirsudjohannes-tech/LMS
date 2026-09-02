import JSZip from 'jszip';
import { TrainingBackup } from '@/types';

function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined
    ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function recordsToCsv(records: Array<Record<string, unknown>>): string {
  if (records.length === 0) return '\uFEFF';
  const headers = [...new Set(records.flatMap(record => Object.keys(record)))];
  const lines = [headers.map(csvCell).join(',')];
  for (const record of records) {
    lines.push(headers.map(header => csvCell(record[header])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function safeFilename(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'pelatihan';
}

export async function downloadTrainingBackupZip(backup: TrainingBackup): Promise<void> {
  const zip = new JSZip();
  const manifest = {
    format: backup.format,
    version: backup.version,
    backup_id: backup.backup_id,
    checksum: backup.checksum,
    exported_at: backup.exported_at,
    record_counts: backup.record_counts,
    catatan: 'Simpan berkas ini sebagai arsip resmi sebelum membersihkan data operasional LONTAR.'
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('informasi_pelatihan.json', JSON.stringify(backup.training, null, 2));
  zip.file('statistik_ringkas.json', JSON.stringify(backup.summary, null, 2));
  zip.file('pengaturan_sertifikat.json', JSON.stringify(backup.certificate_settings, null, 2));
  zip.file('peserta.csv', recordsToCsv(backup.participants));
  zip.file('hasil_tes.csv', recordsToCsv(backup.test_attempts));
  zip.file('progres_materi.csv', recordsToCsv(backup.material_progress));
  zip.file('sertifikat.csv', recordsToCsv(backup.certificates));
  zip.file('materi.json', JSON.stringify(backup.materials, null, 2));
  zip.file('bank_soal.json', JSON.stringify(backup.questions, null, 2));
  zip.file('sesi_dan_jawaban.json', JSON.stringify(backup.test_sessions, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date(backup.exported_at).toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `Backup-LONTAR_${safeFilename(backup.training.title)}_${date}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
