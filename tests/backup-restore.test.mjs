import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import JSZip from 'jszip';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const js = ts.transpileModule(read('src/lib/trainingBackup.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import('jszip')", `import(${JSON.stringify(import.meta.resolve('jszip'))})`);
const { buildTrainingBackupZip, readTrainingBackupZip } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

async function setup() {
 const db = new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id UUID PRIMARY KEY, email TEXT,raw_user_meta_data JSONB DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT now());
 CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::UUID $$;
 CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
 CREATE TABLE storage.objects(id UUID,bucket_id TEXT,name TEXT);`);
 for (const dir of ['supabase/sql/archive/pre_baseline_017/', 'supabase/sql/migrations/']) {
  for (const file of fs.readdirSync(new URL(dir, root)).filter(x => x.endsWith('.sql')).sort()) {
   try { await db.exec(read(dir+file)); } catch(error) { await db.close(); throw new Error(`${file}: ${error.message}`, {cause:error}); }
  }
 }
 await db.exec(read('supabase/sql/migrations/033_verified_backup_and_restore.sql')); // repeatable
 return db;
}
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('backup/purge/restore with all migrations, real triggers and authorization', async () => {
 const db = await setup();
 try {
  const admin=id(1), user=id(2), t=id(10), m=id(20), q=id(30);
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${admin}','admin@test'),('${user}','user@test');
   UPDATE profiles SET role='admin' WHERE id='${admin}';
   SELECT set_config('request.jwt.claim.sub','${admin}',false);
   INSERT INTO trainings(id,title,active,status) VALUES('${t}','Backup test',false,'archived');
   INSERT INTO materials(id,training_id,title,order_number) VALUES('${m}','${t}','Materi',1);
   INSERT INTO questions(id,training_id,test_type,question,option_a,option_b,option_c,option_d,correct_answer) VALUES('${q}','${t}','pretest','Question','A','B','C','D','A');
   INSERT INTO test_sessions(user_id,training_id,test_type,attempt_number,answers) VALUES('${user}','${t}','pretest',1,'{}');
   INSERT INTO test_attempts(user_id,training_id,test_type,score) VALUES('${user}','${t}','pretest',60);
   INSERT INTO material_progress(user_id,material_id) VALUES('${user}','${m}');`);
  const exportBackup = async () => (await db.query('SELECT admin_export_training_backup($1) value',[t])).rows[0].value;
  const call = async (fn,b) => (await db.query(`SELECT ${fn}($1::jsonb) value`,[JSON.stringify(b)])).rows[0].value;
  await db.exec('SET ROLE authenticated');
  let backup = await exportBackup();
  assert.equal(backup.version,2);
  await assert.rejects(db.query('SELECT admin_purge_archived_training($1,$2)',[t,backup.backup_id]),/permission denied/);
  await call('admin_verify_training_backup',backup);
  await assert.rejects(call('admin_verify_training_backup',{...backup, payload_json:JSON.stringify({...JSON.parse(backup.payload_json),materials:[]})}),/berubah|rusak/);
  await assert.rejects(call('admin_verify_training_backup',{...backup,payload_json:JSON.stringify({...JSON.parse(backup.payload_json),version:1})}),/versi 2/);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  for (const fn of ['admin_verify_training_backup','admin_purge_verified_training','admin_restore_training_backup']) await assert.rejects(call(fn,backup),/admin/);
  await assert.rejects(db.query('SELECT private.training_operational_snapshot($1)',[t]),/permission denied/);
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${admin}',false);`);
  await db.exec(`UPDATE test_attempts SET score=70.1234567890123456789 WHERE training_id='${t}'`);
  await assert.rejects(call('admin_purge_verified_training',backup),/Data berubah/);
  backup=await exportBackup();
  const bytes=await buildTrainingBackupZip(backup);
  const uploaded=await readTrainingBackupZip(bytes);
  assert.deepEqual(uploaded,backup);
  const zip=await JSZip.loadAsync(bytes);
  zip.file('backup.json',JSON.stringify({...backup,materials:[]}));
  await assert.rejects(readTrainingBackupZip(await zip.generateAsync({type:'uint8array'})),/rusak/);
  await db.exec('SET ROLE authenticated');
  assert.equal((await call('admin_purge_verified_training',uploaded)).status,'purged');
  await db.exec('RESET ROLE');
  await assert.rejects(exportBackup(),/sudah dibersihkan/);
  await assert.rejects(call('admin_restore_training_backup',{...backup,backup_id:id(999)}),/database ini/);
  // An FK failure after content inserts must roll back the entire restore.
  await db.exec(`DELETE FROM auth.users WHERE id='${user}'`);
  await assert.rejects(call('admin_restore_training_backup',backup),/foreign key/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM materials WHERE training_id='${t}'`)).rows[0].n,0);
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${user}','user@test')`);
  assert.equal((await call('admin_restore_training_backup',backup)).status,'restored');
  assert.equal((await db.query('SELECT score::text score FROM test_attempts WHERE training_id=$1',[t])).rows[0].score,'70.1234567890123456789');
  const restored=(await db.query('SELECT private.training_operational_snapshot($1) value',[t])).rows[0].value;
  for (const key of Object.keys(restored)) assert.deepEqual(restored[key],backup[key]);
  const training=(await db.query('SELECT status,active,operational_data_purged_at FROM trainings WHERE id=$1',[t])).rows[0];
  assert.deepEqual(training,{status:'archived',active:false,operational_data_purged_at:null});
  await assert.rejects(call('admin_restore_training_backup',backup),/hanya untuk arsip/);
 } finally { await db.close(); }
});

test('ZIP assets are complete, corrupt assets fail, missing remote assets abort export', async () => {
 const backup = { format:'LONTAR_TRAINING_BACKUP',version:2,backup_id:id(99),checksum:'server-checked',exported_at:new Date().toISOString(),training:{id:id(10),title:'Test'},certificate_settings:null,participants:[{full_name:'=1+1'}],materials:[{content_url:'https://example.test/storage/v1/object/public/assets/file.pdf'}],questions:[],test_attempts:[],test_sessions:[],material_progress:[],certificates:[],record_counts:{} };
 backup.payload_json=JSON.stringify(backup);
 const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async () => new Response('asset bytes');
  const bytes=await buildTrainingBackupZip(backup);
  assert.deepEqual(await readTrainingBackupZip(bytes),backup);
  const zip=await JSZip.loadAsync(bytes);
  assert.match(await zip.file('peserta.csv').async('string'),/'=1\+1/);
  zip.file('aset-storage/1.bin','corrupted');
  await assert.rejects(readTrainingBackupZip(await zip.generateAsync({type:'uint8array'})),/Aset ZIP/);
  zip.remove('backup.json');
  await assert.rejects(readTrainingBackupZip(await zip.generateAsync({type:'uint8array'})),/tidak lengkap/);
  globalThis.fetch=async () => new Response('',{status:404});
  await assert.rejects(buildTrainingBackupZip(backup),/Backup dibatalkan/);
  await assert.rejects(buildTrainingBackupZip({...backup,version:1}),/migrasi/);
 } finally { globalThis.fetch=originalFetch; }
});
