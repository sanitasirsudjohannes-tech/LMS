import {
  UserProfile,
  Training,
  Material,
  Question,
  TestAttempt,
  MaterialProgress,
  CertificateSettings,
  Certificate,
  AdminStats,
  ParticipantQuestion,
  SubmittedTestResult,
  TestOption,
  TestSession,
  TrainingMaintenance,
  DatabaseUsage,
  TrainingBackup,
  CertificateGlobalSettings
} from '@/types';
import { supabase } from './supabase';

const DEFAULT_CERT_SETTINGS: CertificateSettings = {
  id: '00000000-0000-0000-0000-000000000301',
  training_id: '00000000-0000-0000-0000-000000000001',
  certificate_enabled: false,
  numbering_enabled: true,
  number_format: '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}',
  start_number: 1,
  number_digits: 4,
  current_number: 1,
  show_posttest_score: true,
  signatory_name: 'Nama Direktur',
  signatory_title: 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
  signatory_image_url: null,
  stamp_image_url: null,
  updated_at: new Date().toISOString()
};

const DEFAULT_GLOBAL_CERT_SETTINGS: CertificateGlobalSettings = {
  singleton: true,
  signatory_name: 'Nama Direktur',
  signatory_title: 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
  signatory_image_url: null,
  stamp_image_url: null,
  version: 1,
  updated_at: new Date().toISOString(),
  updated_by: null
};

const cacheState = {
  training: null as Training | null,
  trainings: [] as Training[],
  materials: [] as Material[],
  questions: [] as Question[],
  certSettings: DEFAULT_CERT_SETTINGS,
  certSettingsList: [] as CertificateSettings[],
  globalCertSettings: DEFAULT_GLOBAL_CERT_SETTINGS,
  profiles: [] as UserProfile[],
  testAttempts: [] as TestAttempt[],
  materialProgress: [] as MaterialProgress[],
  certificates: [] as Certificate[],
  currentUser: null as UserProfile | null
};

let initInFlight: Promise<void> | null = null;
let lastInitializedAt = 0;
const CACHE_TTL_MS = 30_000;

function testSessionStorageKey(session: TestSession): string {
  return `lms_test_session:${session.user_id}:${session.training_id}:${session.test_type}:${session.id}`;
}

function sanitizeAnswers(value: unknown): Record<string, TestOption> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, TestOption] =>
      ['A', 'B', 'C', 'D'].includes(String(entry[1]).toUpperCase())
    ).map(([questionId, answer]) => [questionId, answer.toUpperCase() as TestOption])
  );
}

function clearCurrentUserCache() {
  cacheState.currentUser = null;
  cacheState.testAttempts = [];
  cacheState.materialProgress = [];
  cacheState.certificates = [];
  lastInitializedAt = 0;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('lms_current_user');
  }
}

export async function initCurrentUser(): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;

  // Jangan pernah mempercayai role/identitas dari sessionStorage tanpa
  // memvalidasinya kembali ke Supabase. Nilai sessionStorage dapat basi atau diubah.
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Gagal memvalidasi sesi: ${authError.message}`);
  if (!authUser) {
    clearCurrentUserCache();
    return null;
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  if (profileError) throw new Error(`Gagal memuat profil: ${profileError.message}`);
  if (!profileData) {
    clearCurrentUserCache();
    return null;
  }

  cacheState.currentUser = profileData as UserProfile;
  sessionStorage.setItem('lms_current_user', JSON.stringify(profileData));
  return cacheState.currentUser;
}

// Initializer: Fetch real data directly from Supabase Database
async function fetchLmsData(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 1. Fetch Trainings
    const { data: dbTrainings, error: trainingsError } = await supabase
      .from('trainings')
      .select('*')
      .order('created_at', { ascending: false });
    if (trainingsError) throw new Error(`Gagal memuat pelatihan: ${trainingsError.message}`);
    if (dbTrainings && dbTrainings.length > 0) {
      cacheState.trainings = dbTrainings;
      const selectedTrainingId = sessionStorage.getItem('lms_selected_training_id');
      cacheState.training = dbTrainings.find(training => training.id === selectedTrainingId) || dbTrainings[0];
    } else {
      cacheState.trainings = [];
      cacheState.training = null;
    }

    const currentUserId = cacheState.currentUser?.id;
    const isAdmin = cacheState.currentUser?.role === 'admin';
    const userFilter = currentUserId && !isAdmin ? currentUserId : null;

    const selectedTrainingId = cacheState.training?.id;

    // Data besar hanya dimuat untuk pelatihan yang sedang dibuka. Arsip sertifikat
    // tetap dimuat seluruhnya karena jumlahnya kecil dan dibutuhkan peserta.
    const [materialsResult, questionsResult, settingsResult, profilesResult, attemptsResult, progressResult, certificatesResult] = await Promise.all([
      selectedTrainingId
        ? supabase.from('materials').select('*').eq('training_id', selectedTrainingId).order('order_number', { ascending: true }).order('id', { ascending: true })
        : Promise.resolve({ data: [] as Material[], error: null }),
      isAdmin && cacheState.training
        ? supabase.from('questions').select('*').eq('training_id', cacheState.training.id)
        : Promise.resolve({ data: [] as Question[], error: null }),
      selectedTrainingId
        ? supabase.from('certificate_settings').select('*').eq('training_id', selectedTrainingId)
        : Promise.resolve({ data: [] as CertificateSettings[], error: null }),
      Promise.resolve({ data: cacheState.currentUser ? [cacheState.currentUser] : [], error: null }),
      userFilter
        ? supabase.from('test_attempts').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as TestAttempt[], error: null }),
      userFilter
        ? supabase.from('material_progress').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as MaterialProgress[], error: null }),
      userFilter
        ? supabase.from('certificates').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as Certificate[], error: null })
    ]);

    const fetchFailure = [
      ['materi', materialsResult.error],
      ['soal', questionsResult.error],
      ['pengaturan sertifikat', settingsResult.error],
      ['profil', profilesResult.error],
      ['hasil tes', attemptsResult.error],
      ['progres materi', progressResult.error],
      ['sertifikat', certificatesResult.error]
    ].find(([, error]) => error);
    if (fetchFailure) {
      const [label, error] = fetchFailure;
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Kesalahan tidak diketahui';
      throw new Error(`Gagal memuat ${label}: ${message}`);
    }

    cacheState.materials = materialsResult.data || [];
    cacheState.questions = questionsResult.data || [];
    const dbCertSettings = settingsResult.data;
    if (dbCertSettings && dbCertSettings.length > 0) {
      cacheState.certSettingsList = dbCertSettings;
      cacheState.certSettings = dbCertSettings.find(setting => setting.training_id === cacheState.training?.id) || {
        ...DEFAULT_CERT_SETTINGS,
        id: crypto.randomUUID(),
        training_id: cacheState.training?.id || DEFAULT_CERT_SETTINGS.training_id
      };
    } else {
      cacheState.certSettingsList = [];
      cacheState.certSettings = {
        ...DEFAULT_CERT_SETTINGS,
        id: crypto.randomUUID(),
        training_id: cacheState.training?.id || DEFAULT_CERT_SETTINGS.training_id
      };
    }

    cacheState.profiles = profilesResult.data || [];
    cacheState.testAttempts = attemptsResult.data || [];
    cacheState.materialProgress = progressResult.data || [];
    cacheState.certificates = certificatesResult.data || [];
    lastInitializedAt = Date.now();
  } catch (err) {
    console.error('Supabase Direct Fetch Error:', err);
    throw err;
  }
}

// Dedup request bersamaan dan gunakan cache singkat saat berpindah halaman.
export async function initLocalStorage(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!force && cacheState.currentUser && lastInitializedAt > 0 && Date.now() - lastInitializedAt < CACHE_TTL_MS) return;
  const currentUser = await initCurrentUser();
  if (!currentUser) return;
  if (initInFlight) return initInFlight;
  initInFlight = fetchLmsData().finally(() => { initInFlight = null; });
  return initInFlight;
}

export const StorageAPI = {
  getCurrentUser: (): UserProfile | null => {
    if (cacheState.currentUser) return cacheState.currentUser;
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('lms_current_user');
      if (cached) {
        try {
          cacheState.currentUser = JSON.parse(cached);
          return cacheState.currentUser;
        } catch { /* ignore */ }
      }
    }
    return null;
  },

  setCurrentUser: (user: UserProfile | null) => {
    if (cacheState.currentUser?.id !== user?.id) lastInitializedAt = 0;
    if (!user) {
      clearCurrentUserCache();
      return;
    }
    cacheState.currentUser = user;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('lms_current_user', JSON.stringify(user));
    }
  },

  logout: async () => {
    cacheState.currentUser = null;
    cacheState.testAttempts = [];
    cacheState.materialProgress = [];
    cacheState.certificates = [];
    lastInitializedAt = 0;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('lms_current_user');
      sessionStorage.removeItem('lms_selected_training_id');
      localStorage.clear();
    }
    await supabase.auth.signOut();
  },

  getTrainings: (): Training[] => {
    return cacheState.trainings;
  },

  getTraining: (): Training | null => {
    return cacheState.training;
  },

  setSelectTraining: (id: string) => {
    const found = cacheState.trainings.find(t => t.id === id);
    if (found) {
      cacheState.training = found;
      const settings = cacheState.certSettingsList.find(setting => setting.training_id === id);
      cacheState.certSettings = settings || {
        ...DEFAULT_CERT_SETTINGS,
        id: crypto.randomUUID(),
        training_id: id,
        current_number: DEFAULT_CERT_SETTINGS.start_number,
        updated_at: new Date().toISOString()
      };
      if (typeof window !== 'undefined') sessionStorage.setItem('lms_selected_training_id', id);
    }
  },

  loadTrainingResources: async (id: string): Promise<void> => {
    StorageAPI.setSelectTraining(id);
    const [materialsResult, settingsResult] = await Promise.all([
      supabase.from('materials').select('*').eq('training_id', id).order('order_number').order('id'),
      supabase.from('certificate_settings').select('*').eq('training_id', id).maybeSingle()
    ]);
    if (materialsResult.error) throw new Error(`Gagal memuat materi: ${materialsResult.error.message}`);
    if (settingsResult.error) throw new Error(`Gagal memuat pengaturan sertifikat: ${settingsResult.error.message}`);
    cacheState.materials = [
      ...cacheState.materials.filter(material => material.training_id !== id),
      ...((materialsResult.data || []) as Material[])
    ];
    if (settingsResult.data) {
      const setting = settingsResult.data as CertificateSettings;
      cacheState.certSettingsList = [
        ...cacheState.certSettingsList.filter(item => item.training_id !== id),
        setting
      ];
      cacheState.certSettings = setting;
    }
  },

  saveTraining: async (trData: Partial<Training>): Promise<Training> => {
    const isNew = !trData.id;
    const targetId = isNew ? crypto.randomUUID() : trData.id!;
    const existing = cacheState.trainings.find(training => training.id === targetId);

    const saved: Training = {
      id: targetId,
      title: trData.title || 'Pelatihan Baru',
      description: trData.description || '',
      start_date: trData.start_date || new Date().toISOString(),
      end_date: trData.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
      passing_score: trData.passing_score !== undefined ? Number(trData.passing_score) : 80,
      max_posttest_attempts: 5,
      jpl: trData.jpl !== undefined ? Number(trData.jpl) : 1,
      active: trData.active !== undefined ? trData.active : existing?.active ?? true,
      status: trData.status || existing?.status || (trData.active === false ? 'archived' : 'active'),
      created_at: trData.created_at || existing?.created_at || new Date().toISOString(),
      archived_at: trData.archived_at ?? existing?.archived_at ?? null,
      operational_data_purged_at: trData.operational_data_purged_at ?? existing?.operational_data_purged_at ?? null
    };

    const { error } = await supabase.from('trainings').upsert(saved);
    if (error) throw new Error(`Gagal menyimpan pelatihan: ${error.message}`);

    if (cacheState.trainings.some(t => t.id === targetId)) {
      cacheState.trainings = cacheState.trainings.map(t => (t.id === targetId ? saved : t));
    } else {
      cacheState.trainings.unshift(saved);
    }

    cacheState.training = saved;

    return saved;
  },

  updateTraining: async (updates: Partial<Training>): Promise<Training> => {
    const updated = { ...(cacheState.training || {}), ...updates };
    return StorageAPI.saveTraining(updated);
  },

  deleteTraining: async (id: string) => {
    // Migrasi 011 mempertahankan sertifikat sebagai snapshot saat pelatihan dihapus.
    const { data: deleted, error } = await supabase.from('trainings').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(`Gagal menghapus pelatihan: ${error.message}`);
    if (!deleted) throw new Error('Pelatihan tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.');

    cacheState.trainings = cacheState.trainings.filter(t => t.id !== id);
    cacheState.materials = cacheState.materials.filter(m => m.training_id !== id);
    cacheState.questions = cacheState.questions.filter(q => q.training_id !== id);
    cacheState.testAttempts = cacheState.testAttempts.filter(a => a.training_id !== id);
    cacheState.certificates = cacheState.certificates.filter(c => c.training_id !== id);

    if (cacheState.training && cacheState.training.id === id) {
      cacheState.training = cacheState.trainings[0] || null;
      if (typeof window !== 'undefined') {
        if (cacheState.training) sessionStorage.setItem('lms_selected_training_id', cacheState.training.id);
        else sessionStorage.removeItem('lms_selected_training_id');
      }
    }

  },

  getTrainingMaintenance: async (): Promise<TrainingMaintenance[]> => {
    const { data, error } = await supabase.rpc('admin_training_maintenance_list');
    if (error) throw new Error(`Status pemeliharaan gagal dimuat: ${error.message}`);
    return (data || []) as TrainingMaintenance[];
  },

  getDatabaseUsage: async (): Promise<DatabaseUsage> => {
    const { data, error } = await supabase.rpc('admin_database_usage');
    if (error) throw new Error(`Ukuran database gagal dimuat: ${error.message}`);
    if (!data) throw new Error('Informasi ukuran database tidak tersedia.');
    return data as DatabaseUsage;
  },

  archiveTraining: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('admin_archive_training', { p_training_id: id });
    if (error) throw new Error(`Pelatihan gagal diarsipkan: ${error.message}`);
    cacheState.trainings = cacheState.trainings.map(training => training.id === id
      ? { ...training, status: 'archived', active: false, archived_at: training.archived_at || new Date().toISOString() }
      : training);
    if (cacheState.training?.id === id) {
      cacheState.training = cacheState.trainings.find(training => training.id === id) || null;
    }
  },

  exportTrainingBackup: async (id: string): Promise<TrainingBackup> => {
    const { data, error } = await supabase.rpc('admin_export_training_backup', { p_training_id: id });
    if (error) throw new Error(`Backup pelatihan gagal dibuat: ${error.message}`);
    return data as TrainingBackup;
  },

  purgeArchivedTraining: async (id: string, backupId: string): Promise<Record<string, number | string>> => {
    const { data, error } = await supabase.rpc('admin_purge_archived_training', {
      p_training_id: id,
      p_backup_id: backupId
    });
    if (error) throw new Error(`Data operasional gagal dibersihkan: ${error.message}`);
    cacheState.materials = cacheState.materials.filter(material => material.training_id !== id);
    cacheState.questions = cacheState.questions.filter(question => question.training_id !== id);
    cacheState.testAttempts = cacheState.testAttempts.filter(attempt => attempt.training_id !== id);
    cacheState.trainings = cacheState.trainings.map(training => training.id === id
      ? { ...training, operational_data_purged_at: new Date().toISOString() }
      : training);
    return data as Record<string, number | string>;
  },

  getMaterials: (trainingId?: string): Material[] => {
    const targetTrainingId = trainingId || cacheState.training?.id;
    if (!targetTrainingId) return [];
    return cacheState.materials
      .filter(m => m.training_id === targetTrainingId)
      .sort((a, b) => a.order_number - b.order_number || a.id.localeCompare(b.id));
  },

  saveMaterial: async (mat: Partial<Material>): Promise<Material> => {
    const isNew = !mat.id || mat.id.startsWith('m-');
    const targetId = isNew ? crypto.randomUUID() : mat.id!;

    const saved: Material = {
      id: targetId,
      training_id: mat.training_id || cacheState.training?.id || '',
      title: mat.title || 'Materi Baru',
      description: mat.description || '',
      content: mat.content || '',
      content_url: mat.content_url || '',
      minimum_duration_seconds: mat.minimum_duration_seconds || 0,
      order_number: mat.order_number ?? Math.max(
        0,
        ...cacheState.materials
          .filter(item => item.training_id === (mat.training_id || cacheState.training?.id))
          .map(item => item.order_number)
      ) + 1,
      active: mat.active !== undefined ? mat.active : true
    };

    if (!saved.training_id) throw new Error('Pilih pelatihan sebelum menyimpan materi.');
    if (!Number.isInteger(saved.order_number) || saved.order_number < 1) {
      throw new Error('Urutan materi harus berupa bilangan bulat minimal 1.');
    }

    const { data: duplicateOrder, error: duplicateError } = await supabase
      .from('materials')
      .select('id')
      .eq('training_id', saved.training_id)
      .eq('order_number', saved.order_number)
      .neq('id', targetId)
      .limit(1);
    if (duplicateError) throw new Error(`Gagal memeriksa urutan materi: ${duplicateError.message}`);
    if (duplicateOrder && duplicateOrder.length > 0) {
      throw new Error(`Urutan ${saved.order_number} sudah digunakan materi lain pada pelatihan ini.`);
    }

    const { error } = await supabase.from('materials').upsert(saved);
    if (error) throw new Error(`Gagal menyimpan materi: ${error.message}`);

    if (cacheState.materials.some(m => m.id === mat.id || m.id === targetId)) {
      cacheState.materials = cacheState.materials.map(m => (m.id === mat.id || m.id === targetId ? saved : m));
    } else {
      cacheState.materials.push(saved);
    }

    return saved;
  },

  deleteMaterial: async (id: string) => {
    const { data: deleted, error } = await supabase.from('materials').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(`Gagal menghapus materi: ${error.message}`);
    if (!deleted) throw new Error('Materi tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.');
    cacheState.materials = cacheState.materials.filter(m => m.id !== id);
    cacheState.materialProgress = cacheState.materialProgress.filter(mp => mp.material_id !== id);
  },

  getQuestions: (testType?: 'pretest' | 'posttest', trainingId?: string): Question[] => {
    const targetTrainingId = trainingId || cacheState.training?.id;
    if (!targetTrainingId) return [];
    let list = cacheState.questions.filter(q => q.training_id === targetTrainingId);
    if (testType) {
      list = list.filter(q => q.test_type === testType && q.active);
    }
    return list;
  },

  loadQuestionsForAdmin: async (trainingId: string): Promise<Question[]> => {
    if (!trainingId) return [];
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('training_id', trainingId)
      .order('test_type')
      .order('id');
    if (error) throw new Error(`Gagal memuat soal admin: ${error.message}`);
    const loaded = (data || []) as Question[];
    cacheState.questions = [
      ...cacheState.questions.filter(question => question.training_id !== trainingId),
      ...loaded
    ];
    return loaded;
  },

  loadQuestionsForTest: async (
    trainingId: string,
    testType: 'pretest' | 'posttest'
  ): Promise<ParticipantQuestion[]> => {
    const { data, error } = await supabase.rpc('get_test_questions', {
      p_training_id: trainingId,
      p_test_type: testType
    });
    if (error) throw new Error(`Gagal memuat soal: ${error.message}`);
    return (data || []) as ParticipantQuestion[];
  },

  saveQuestion: async (q: Partial<Question>): Promise<Question> => {
    const isNew = !q.id || q.id.startsWith('q-');
    const targetId = isNew ? crypto.randomUUID() : q.id!;

    const saved: Question = {
      id: targetId,
      training_id: q.training_id || cacheState.training?.id || '',
      test_type: q.test_type || 'pretest',
      question: q.question || '',
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_answer: q.correct_answer || 'A',
      active: q.active !== undefined ? q.active : true
    };

    const { error } = await supabase.from('questions').upsert(saved);
    if (error) throw new Error(`Gagal menyimpan soal: ${error.message}`);

    if (cacheState.questions.some(item => item.id === q.id || item.id === targetId)) {
      cacheState.questions = cacheState.questions.map(item => (item.id === q.id || item.id === targetId ? saved : item));
    } else {
      cacheState.questions.push(saved);
    }

    return saved;
  },

  deleteQuestion: async (id: string) => {
    const { data: deleted, error } = await supabase.from('questions').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(`Gagal menghapus soal: ${error.message}`);
    if (!deleted) throw new Error('Soal tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.');
    cacheState.questions = cacheState.questions.filter(q => q.id !== id);
  },

  saveQuestionsBulk: async (
    questions: Array<Omit<Question, 'id' | 'training_id'>>,
    trainingId: string
  ): Promise<Question[]> => {
    if (!trainingId) throw new Error('Pilih pelatihan sebelum mengimpor soal.');
    if (questions.length === 0) return [];

    const payload: Question[] = questions.map(question => ({
      ...question,
      id: crypto.randomUUID(),
      training_id: trainingId
    }));
    const { data, error } = await supabase.from('questions').insert(payload).select('*');
    if (error) throw new Error(`Impor soal gagal: ${error.message}`);

    const saved = (data || payload) as Question[];
    cacheState.questions.push(...saved);
    return saved;
  },

  getProfiles: (): UserProfile[] => {
    return cacheState.profiles;
  },

  registerUserAsync: async (userData: Omit<UserProfile, 'id' | 'created_at'> & { password: string }): Promise<UserProfile> => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email.trim(),
      password: userData.password,
      options: {
        data: {
          full_name: userData.full_name,
          institution: userData.institution,
          role: userData.role || 'peserta'
        }
      }
    });

    if (authError) {
      throw new Error(`Pendaftaran gagal (Auth): ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error('Pendaftaran gagal: Supabase tidak mengembalikan ID pengguna.');
    }

    const userId = authData.user.id;
    const profilePayload: UserProfile = {
      id: userId,
      full_name: userData.full_name,
      email: userData.email.trim(),
      institution: userData.institution,
      nip_nik: userData.nip_nik || '',
      phone: userData.phone || '',
      role: userData.role || 'peserta',
      created_at: new Date().toISOString()
    };

    const { error: profileError } = await supabase.from('profiles').upsert(profilePayload);
    if (profileError) {
      throw new Error(`Gagal menyimpan profil peserta: ${profileError.message}`);
    }

    cacheState.profiles.push(profilePayload);
    StorageAPI.setCurrentUser(profilePayload);
    return profilePayload;
  },

  updateUserProfile: async (id: string, updates: Partial<UserProfile>): Promise<UserProfile | null> => {
    const p = cacheState.profiles.find(item => item.id === id);
    if (!p) return null;
    const updated = { ...p, ...updates };
    const { error } = await supabase.from('profiles').upsert(updated);
    if (error) throw new Error(`Gagal memperbarui profil: ${error.message}`);
    cacheState.profiles = cacheState.profiles.map(item => (item.id === id ? updated : item));
    if (cacheState.currentUser?.id === id) {
      StorageAPI.setCurrentUser(updated);
    }
    return updated;
  },

  getTestAttempts: (userId?: string, testType?: 'pretest' | 'posttest', trainingId?: string): TestAttempt[] => {
    const targetTrainingId = trainingId || cacheState.training?.id || '';
    let list = cacheState.testAttempts.filter(a => a.training_id === targetTrainingId);
    if (userId) {
      list = list.filter(a => a.user_id === userId);
    }
    if (testType) {
      list = list.filter(a => a.test_type === testType);
    }
    return list;
  },

  getAllTestAttempts: (): TestAttempt[] => {
    return [...cacheState.testAttempts];
  },

  startTestSession: async (
    trainingId: string,
    testType: 'pretest' | 'posttest'
  ): Promise<TestSession> => {
    const { data, error } = await supabase.rpc('start_test_session', {
      p_training_id: trainingId,
      p_test_type: testType
    });
    if (error) throw new Error(error.message);
    const session = data as TestSession;
    return { ...session, answers: sanitizeAnswers(session.answers) };
  },

  getRecoveredTestAnswers: (session: TestSession): Record<string, TestOption> => {
    let localAnswers: Record<string, TestOption> = {};
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(testSessionStorageKey(session));
        if (stored) localAnswers = sanitizeAnswers(JSON.parse(stored));
      } catch { /* data lokal rusak diabaikan */ }
    }
    return { ...sanitizeAnswers(session.answers), ...localAnswers };
  },

  saveTestAnswersLocally: (session: TestSession, answers: Record<string, TestOption>) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(testSessionStorageKey(session), JSON.stringify(answers));
      } catch { /* Supabase tetap menjadi penyimpanan utama */ }
    }
  },

  saveTestSession: async (sessionId: string, answers: Record<string, TestOption>) => {
    const { error } = await supabase.rpc('save_test_session', {
      p_session_id: sessionId,
      p_answers: answers
    });
    if (error) throw new Error(error.message);
  },

  submitTestSession: async (
    session: TestSession,
    answers: Record<string, TestOption>
  ): Promise<SubmittedTestResult> => {
    StorageAPI.saveTestAnswersLocally(session, answers);
    const { data, error } = await supabase.rpc('submit_test_session', {
      p_session_id: session.id,
      p_answers: answers
    });
    if (error) throw new Error(error.message);
    if (typeof window !== 'undefined') localStorage.removeItem(testSessionStorageKey(session));

    const result = data as SubmittedTestResult;
    if (result.certificate_issued) lastInitializedAt = 0;
    const currentUserId = cacheState.currentUser?.id;
    if (currentUserId) {
      cacheState.testAttempts.push({
        id: crypto.randomUUID(),
        user_id: currentUserId,
        training_id: session.training_id,
        test_type: session.test_type,
        score: result.score,
        attempt_number: result.attempt_number,
        started_at: session.started_at,
        submitted_at: new Date().toISOString()
      });
    }
    return result;
  },

  submitTestAttempt: async (
    trainingId: string,
    testType: 'pretest' | 'posttest',
    answers: Record<string, string>
  ): Promise<SubmittedTestResult> => {
    const { data, error } = await supabase.rpc('submit_test_attempt', {
      p_training_id: trainingId,
      p_test_type: testType,
      p_answers: answers
    });
    if (error) throw new Error(error.message);
    const result = data as SubmittedTestResult;
    if (result.certificate_issued) lastInitializedAt = 0;
    const currentUserId = cacheState.currentUser?.id;
    if (currentUserId) {
      cacheState.testAttempts.push({
        id: crypto.randomUUID(),
        user_id: currentUserId,
        training_id: trainingId,
        test_type: testType,
        score: result.score,
        attempt_number: result.attempt_number,
        started_at: new Date().toISOString(),
        submitted_at: new Date().toISOString()
      });
    }
    return result;
  },

  ensureMyCertificate: async (trainingId: string): Promise<Certificate | null> => {
    const currentUserId = cacheState.currentUser?.id;
    if (!currentUserId) throw new Error('Sesi peserta tidak ditemukan. Silakan masuk kembali.');

    const { data: issued, error: issueError } = await supabase.rpc('ensure_my_certificate', {
      p_training_id: trainingId
    });
    if (issueError) throw new Error(`Gagal menerbitkan sertifikat: ${issueError.message}`);
    if (!issued) return null;

    const { data: certificate, error: certificateError } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('training_id', trainingId)
      .maybeSingle();
    if (certificateError) throw new Error(`Gagal memuat sertifikat: ${certificateError.message}`);
    if (!certificate) return null;

    cacheState.certificates = [
      ...cacheState.certificates.filter(item => !(item.user_id === currentUserId && item.training_id === trainingId)),
      certificate as Certificate
    ];
    return StorageAPI.getCertificateForUser(currentUserId, trainingId);
  },

  getMaterialProgress: (userId?: string): MaterialProgress[] => {
    if (!userId) return [...cacheState.materialProgress];
    return cacheState.materialProgress.filter(p => p.user_id === userId);
  },

  startMaterial: async (userId: string, materialId: string): Promise<MaterialProgress> => {
    const existing = cacheState.materialProgress.find(p => p.user_id === userId && p.material_id === materialId);
    if (existing) return existing;

    const { data, error } = await supabase.rpc('start_material_progress', { p_material_id: materialId });
    if (error) throw new Error(error.message);
    const newProg = data as MaterialProgress;
    cacheState.materialProgress.push(newProg);
    return newProg;
  },

  completeMaterial: async (userId: string, materialId: string): Promise<MaterialProgress> => {
    const p = cacheState.materialProgress.find(item => item.user_id === userId && item.material_id === materialId);
    const { data, error } = await supabase.rpc('complete_material_progress', { p_material_id: materialId });
    if (error) throw new Error(error.message);
    const completed = data as MaterialProgress;
    if (p) Object.assign(p, completed);
    else cacheState.materialProgress.push(completed);
    return completed;
  },

  getCertificateSettings: (trainingId?: string): CertificateSettings => {
    const targetTrainingId = trainingId || cacheState.training?.id;
    if (!targetTrainingId) return cacheState.certSettings;
    const existing = cacheState.certSettingsList.find(setting => setting.training_id === targetTrainingId);
    if (existing) return existing;
    if (cacheState.certSettings.training_id === targetTrainingId) return cacheState.certSettings;
    cacheState.certSettings = {
      ...DEFAULT_CERT_SETTINGS,
      id: crypto.randomUUID(),
      training_id: targetTrainingId,
      updated_at: new Date().toISOString()
    };
    return cacheState.certSettings;
  },

  updateCertificateSettings: async (updates: Partial<CertificateSettings>): Promise<CertificateSettings> => {
    const trainingId = cacheState.training?.id;
    if (!trainingId) throw new Error('Pilih pelatihan terlebih dahulu.');
    const { data: databaseSettings, error: settingsError } = await supabase
      .from('certificate_settings')
      .select('*')
      .eq('training_id', trainingId)
      .maybeSingle();
    if (settingsError) throw new Error(`Gagal memeriksa pengaturan sertifikat: ${settingsError.message}`);

    const existing = (databaseSettings as CertificateSettings | null)
      || cacheState.certSettingsList.find(setting => setting.training_id === trainingId);
    const base = existing || (cacheState.certSettings.training_id === trainingId
      ? cacheState.certSettings
      : { ...DEFAULT_CERT_SETTINGS, id: crypto.randomUUID(), training_id: trainingId });
    const safeCurrentNumber = existing
      ? Math.max(existing.current_number, updates.current_number ?? existing.current_number)
      : updates.current_number;
    const updated = {
      ...base,
      ...updates,
      ...(safeCurrentNumber !== undefined ? { current_number: safeCurrentNumber } : {}),
      training_id: trainingId,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('certificate_settings').upsert(updated);
    if (error) throw new Error(`Gagal menyimpan pengaturan sertifikat: ${error.message}`);
    cacheState.certSettings = updated;
    const existingIndex = cacheState.certSettingsList.findIndex(setting => setting.training_id === updated.training_id);
    if (existingIndex >= 0) cacheState.certSettingsList[existingIndex] = updated;
    else cacheState.certSettingsList.push(updated);
    return updated;
  },

  loadGlobalCertificateSettings: async (): Promise<CertificateGlobalSettings> => {
    const { data, error } = await supabase
      .from('certificate_global_settings')
      .select('*')
      .eq('singleton', true)
      .single();
    if (error) throw new Error(`Pengaturan Direktur global gagal dimuat: ${error.message}`);
    cacheState.globalCertSettings = data as CertificateGlobalSettings;
    return cacheState.globalCertSettings;
  },

  updateGlobalCertificateSettings: async (
    updates: Pick<CertificateGlobalSettings, 'signatory_name' | 'signatory_title' | 'signatory_image_url' | 'stamp_image_url'>
  ): Promise<CertificateGlobalSettings> => {
    const { data, error } = await supabase
      .from('certificate_global_settings')
      .update(updates)
      .eq('singleton', true)
      .select('*')
      .single();
    if (error) throw new Error(`Pengaturan Direktur global gagal disimpan: ${error.message}`);
    cacheState.globalCertSettings = data as CertificateGlobalSettings;
    return cacheState.globalCertSettings;
  },

  uploadDirectorSignature: async (file: File): Promise<string> => {
    if (file.type !== 'image/png') throw new Error('Tanda tangan harus menggunakan format PNG.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran PNG maksimal 2 MB.');

    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngHeader.every((byte, index) => signature[index] === byte)) {
      throw new Error('Isi file bukan gambar PNG yang valid.');
    }

    // Nama unik wajib: sertifikat lama menyimpan URL versi lama sebagai snapshot.
    const path = `global/director-signature-${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage
      .from('certificate-assets')
      .upload(path, file, { upsert: true, contentType: 'image/png', cacheControl: '3600' });
    if (error) throw new Error(`Gagal mengunggah tanda tangan: ${error.message}`);

    const { data } = supabase.storage.from('certificate-assets').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  },

  uploadDirectorStamp: async (file: File): Promise<string> => {
    if (file.type !== 'image/png') throw new Error('Cap harus menggunakan format PNG.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran PNG maksimal 2 MB.');

    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngHeader.every((byte, index) => signature[index] === byte)) {
      throw new Error('Isi file cap bukan gambar PNG yang valid.');
    }

    const path = `global/director-stamp-${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage
      .from('certificate-assets')
      .upload(path, file, { upsert: true, contentType: 'image/png', cacheControl: '3600' });
    if (error) throw new Error(`Gagal mengunggah cap: ${error.message}`);

    const { data } = supabase.storage.from('certificate-assets').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  },

  getCertificates: (): Certificate[] => {
    return cacheState.certificates.map(cert => {
      const user = cacheState.profiles.find(profile => profile.id === cert.user_id);
      const training = cacheState.trainings.find(item => item.id === cert.training_id);
      return {
        ...cert,
        user_name: cert.user_name || user?.full_name || 'Peserta Pelatihan',
        user_institution: cert.user_institution || user?.institution || '',
        training_title: cert.training_title || training?.title || 'Pelatihan LMS',
        training_jpl: cert.training_jpl || training?.jpl || 1,
        training_start_date: cert.training_start_date || training?.start_date,
        training_end_date: cert.training_end_date || training?.end_date
      };
    });
  },

  selectCertificate: (certificateId: string) => {
    if (typeof window !== 'undefined') sessionStorage.setItem('lms_selected_certificate_id', certificateId);
  },

  getSelectedCertificate: (): Certificate | null => {
    if (typeof window === 'undefined') return null;
    const certificateId = sessionStorage.getItem('lms_selected_certificate_id');
    if (!certificateId) return null;
    return StorageAPI.getCertificates().find(item => item.id === certificateId) || null;
  },

  getCertificateSnapshotSettings: (certificate: Certificate): CertificateSettings => ({
    ...DEFAULT_CERT_SETTINGS,
    id: `snapshot-${certificate.id}`,
    training_id: certificate.training_id || DEFAULT_CERT_SETTINGS.training_id,
    show_posttest_score: certificate.show_posttest_score ?? true,
    signatory_name: certificate.signatory_name || DEFAULT_CERT_SETTINGS.signatory_name,
    signatory_title: certificate.signatory_title || DEFAULT_CERT_SETTINGS.signatory_title,
    signatory_image_url: certificate.signatory_image_url || null,
    stamp_image_url: certificate.stamp_image_url || null,
    updated_at: certificate.issued_at
  }),

  getCertificateForUser: (userId: string, trainingId?: string): Certificate | null => {
    const targetTrainingId = trainingId || cacheState.training?.id || '';
    const cert = cacheState.certificates.find(c => c.user_id === userId && c.training_id === targetTrainingId);
    if (!cert) return null;

    const user = cacheState.profiles.find(p => p.id === userId) || cacheState.currentUser;
    const training = cacheState.trainings.find(t => t.id === targetTrainingId) || cacheState.training;

    return {
      ...cert,
      user_name: cert.user_name || user?.full_name || 'Peserta Pelatihan',
      user_institution: cert.user_institution || user?.institution || '',
      training_title: cert.training_title || training?.title || 'Pelatihan LMS',
      training_jpl: cert.training_jpl || training?.jpl || 1,
      training_start_date: cert.training_start_date || training?.start_date,
      training_end_date: cert.training_end_date || training?.end_date
    };
  },

  getCertificateByVerificationCode: (code: string): Certificate | null => {
    const cert = cacheState.certificates.find(c => c.verification_code === code);
    if (!cert) return null;

    const user = cacheState.profiles.find(p => p.id === cert.user_id);
    const training = cacheState.training;

    return {
      ...cert,
      user_name: cert.user_name || user?.full_name || 'Peserta Pelatihan',
      user_institution: cert.user_institution || user?.institution || '',
      training_title: cert.training_title || training?.title || 'Pelatihan Standar Pelayanan & Keselamatan Kerja',
      training_jpl: cert.training_jpl || training?.jpl || 1,
      training_start_date: cert.training_start_date || training?.start_date,
      training_end_date: cert.training_end_date || training?.end_date
    };
  },

  findCertificateByVerificationCode: async (code: string): Promise<Certificate | null> => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return null;

    const { data: rows, error } = await supabase.rpc('verify_certificate', { p_code: normalizedCode });
    if (error) throw new Error(`Verifikasi sertifikat gagal: ${error.message}`);
    const cert = Array.isArray(rows) ? rows[0] : rows;
    return cert ? cert as Certificate : null;
  },

  getAdminStats: (trainingId?: string): AdminStats => {
    const targetTrainingId = trainingId || cacheState.training?.id || '';
    const targetTraining = cacheState.trainings.find(t => t.id === targetTrainingId) || cacheState.training;
    const passingScore = targetTraining?.passing_score ?? 80;

    const participants = cacheState.profiles.filter(p => p.role === 'peserta');
    const totalParticipants = participants.length;
    
    const pretestUserIds = new Set(
      cacheState.testAttempts
        .filter(a => a.training_id === targetTrainingId && a.test_type === 'pretest')
        .map(a => a.user_id)
    );
    const completedPretest = pretestUserIds.size;
    
    const materials = cacheState.materials.filter(m => m.training_id === targetTrainingId && m.active);
    const completedAllMaterials = new Set(
      participants
        .map(p => p.id)
        .filter(uId => {
          const userProg = cacheState.materialProgress.filter(mp => mp.user_id === uId && mp.completed_at);
          const matIds = new Set(materials.map(m => m.id));
          const userCompletedMats = userProg.filter(mp => matIds.has(mp.material_id));
          return materials.length > 0 && userCompletedMats.length >= materials.length;
        })
    ).size;

    const inProgressMaterials = Math.max(0, completedPretest - completedAllMaterials);

    const posttestUserIds = new Set(
      cacheState.testAttempts
        .filter(a => a.training_id === targetTrainingId && a.test_type === 'posttest')
        .map(a => a.user_id)
    );
    const completedPosttest = posttestUserIds.size;

    const passed = new Set(
      cacheState.testAttempts
        .filter(a => a.training_id === targetTrainingId && a.test_type === 'posttest' && a.score >= passingScore)
        .map(a => a.user_id)
    ).size;

    const failed = Math.max(0, completedPosttest - passed);
    const certificatesIssued = cacheState.certificates.filter(c => c.training_id === targetTrainingId).length;

    return {
      totalParticipants,
      completedPretest,
      inProgressMaterials,
      completedAllMaterials,
      completedPosttest,
      passed,
      failed,
      certificatesIssued
    };
  }
};
