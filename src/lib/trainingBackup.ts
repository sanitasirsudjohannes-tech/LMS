import type JSZip from 'jszip';
import { TrainingBackup } from '@/types';

const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_ASSETS = 100;
type Asset = { url: string; path: string; sha256: string };

function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function recordsToCsv(records: Array<Record<string, unknown>>): string {
  const headers = [...new Set(records.flatMap(record => Object.keys(record)))];
  return '\uFEFF' + [headers.map(csvCell).join(','), ...records.map(record => headers.map(key => csvCell(record[key])).join(','))].join('\r\n');
}
function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'pelatihan';
}
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
function storageUrls(backup: TrainingBackup): string[] {
  const values = [backup.certificate_settings?.signatory_image_url, backup.certificate_settings?.stamp_image_url,
    ...backup.materials.map(row => row.content_url), ...backup.certificates.flatMap(row => [row.signatory_image_url, row.stamp_image_url])];
  return [...new Set(values.filter((url): url is string => typeof url === 'string' && url.includes('/storage/v1/object/public/')))];
}

// Limit decompressed output as well as uploaded size; never extract ZIP paths to disk.
async function readEntry(entry: JSZip.JSZipObject | null, limit: number): Promise<Uint8Array> {
  if (!entry) throw new Error('ZIP tidak lengkap. Pilih backup ZIP versi 2 yang lengkap.');
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Uint8Array[] = [];
    // JSZip exposes this streaming API at runtime but omits it from JSZipObject types.
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    stream.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { stream.pause(); reject(new Error('Isi ZIP melebihi batas ukuran aman.')); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => {
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    }).resume();
  });
}

export async function buildTrainingBackupZip(backup: TrainingBackup): Promise<Uint8Array> {
  if (backup.version !== 2) throw new Error('Backup aman belum tersedia. Jalankan migrasi database 033 terlebih dahulu.');
  const { default: Zip } = await import('jszip');
  const zip = new Zip();
  const json = new TextEncoder().encode(JSON.stringify(backup));
  if (json.length > MAX_JSON_BYTES) throw new Error('Data backup melebihi 20 MB. Hubungi pengelola untuk backup database.');
  zip.file('backup.json', json);
  const assets: Asset[] = [];
  const urls = storageUrls(backup);
  if (urls.length > MAX_ASSETS) throw new Error('Terlalu banyak aset untuk backup melalui browser.');
  let total = json.length;
  for (const url of urls) {
    let bytes: Uint8Array;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw new Error('Tidak dapat mengunduh aset');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          total += value.length;
          if (size > MAX_ASSET_BYTES || total > MAX_ZIP_BYTES) throw new Error('Ukuran aset terlalu besar');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } catch {
      throw new Error('Backup dibatalkan karena aset Storage tidak dapat dicadangkan. Periksa koneksi dan ketersediaan berkas.');
    }
    const path = `aset-storage/${assets.length + 1}.bin`;
    zip.file(path, bytes);
    assets.push({ url, path, sha256: await digest(bytes) });
  }
  zip.file('manifest.json', JSON.stringify({ format: backup.format, version: 2, backup_id: backup.backup_id, payload_sha256: await digest(json), assets }));
  for (const [name, records] of Object.entries({ peserta: backup.participants, hasil_tes: backup.test_attempts, progres_materi: backup.material_progress, sertifikat: backup.certificates })) {
    zip.file(`${name}.csv`, recordsToCsv(records));
  }
  zip.file('PETUNJUK.txt', 'Simpan ZIP ini dengan aman karena berisi data peserta dan kunci jawaban.\nPilih kembali ZIP saat Bersihkan atau Pulihkan pada pelatihan asal.\nPemulihan hanya untuk data operasional setelah pembersihan di database yang sama. Akun, sertifikat dan pengaturannya tidak ditimpa.\nAset Storage disertakan beserta pemetaan URL dalam manifest.json; pemulihan aplikasi menggunakan URL asal, bukan mengunggah ulang aset. Tautan eksternal seperti Google Drive tetap berupa tautan.\nIni bukan pengganti backup penuh database/Auth/Storage.');
  const result = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (result.length > MAX_ZIP_BYTES) throw new Error('ZIP melebihi batas 64 MB.');
  return result;
}

export async function readTrainingBackupZip(input: ArrayBuffer | Uint8Array): Promise<TrainingBackup> {
  if (input.byteLength > MAX_ZIP_BYTES) throw new Error('Ukuran ZIP maksimal 64 MB.');
  const { default: Zip } = await import('jszip');
  const zip = await Zip.loadAsync(input);
  const manifest = JSON.parse(new TextDecoder().decode(await readEntry(zip.file('manifest.json'), 256 * 1024)));
  if (manifest.version !== 2 || !Array.isArray(manifest.assets) || manifest.assets.length > MAX_ASSETS) throw new Error('Format ZIP tidak didukung. Gunakan backup versi 2.');
  const json = await readEntry(zip.file('backup.json'), MAX_JSON_BYTES);
  if (await digest(json) !== manifest.payload_sha256) throw new Error('Data ZIP berubah atau rusak.');
  const envelope = JSON.parse(new TextDecoder().decode(json)) as TrainingBackup;
  if (typeof envelope.payload_json !== 'string') throw new Error('Payload asli backup tidak tersedia.');
  const backup = { ...JSON.parse(envelope.payload_json), backup_id: envelope.backup_id, checksum: envelope.checksum, payload_json: envelope.payload_json } as TrainingBackup;
  if (backup.format !== 'LONTAR_TRAINING_BACKUP' || backup.version !== 2 || backup.backup_id !== manifest.backup_id || !backup.training?.id) throw new Error('Identitas backup tidak valid.');
  for (const key of ['materials', 'questions', 'test_attempts', 'test_sessions', 'material_progress', 'certificates', 'participants'] as const) {
    if (!Array.isArray(backup[key])) throw new Error('Data backup tidak lengkap.');
  }
  const urls = storageUrls(backup);
  if (manifest.assets.length !== urls.length || new Set(manifest.assets.map((a: Asset) => a.url)).size !== urls.length) throw new Error('Daftar aset backup tidak lengkap.');
  let total = json.length;
  for (const asset of manifest.assets as Asset[]) {
    if (!urls.includes(asset.url) || !/^aset-storage\/\d+\.bin$/.test(asset.path)) throw new Error('Pemetaan aset tidak valid.');
    const bytes = await readEntry(zip.file(asset.path), Math.min(MAX_ASSET_BYTES, MAX_ZIP_BYTES - total));
    total += bytes.length;
    if (await digest(bytes) !== asset.sha256) throw new Error('Aset ZIP berubah atau rusak.');
  }
  return backup; // Server additionally checks its recorded SHA-256; manifest is not trusted for authorization.
}

export async function downloadTrainingBackupZip(backup: TrainingBackup): Promise<void> {
  const bytes = await buildTrainingBackupZip(backup);
  await readTrainingBackupZip(bytes);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Backup-LONTAR_${safeFilename(backup.training.title)}_${backup.exported_at.slice(0, 10)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
