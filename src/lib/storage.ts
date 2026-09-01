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
  SubmittedTestResult
} from '@/types';
import { supabase } from './supabase';

const DEFAULT_CERT_SETTINGS: CertificateSettings = {
  id: '00000000-0000-0000-0000-000000000301',
  training_id: '00000000-0000-0000-0000-000000000001',
  certificate_enabled: true,
  numbering_enabled: true,
  number_format: '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}',
  start_number: 1,
  number_digits: 4,
  current_number: 1,
  show_posttest_score: true,
  signatory_name: 'Nama Direktur',
  signatory_title: 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
  signatory_image_url: null,
  updated_at: new Date().toISOString()
};

const cacheState = {
  training: null as Training | null,
  trainings: [] as Training[],
  materials: [] as Material[],
  questions: [] as Question[],
  certSettings: DEFAULT_CERT_SETTINGS,
  certSettingsList: [] as CertificateSettings[],
  profiles: [] as UserProfile[],
  testAttempts: [] as TestAttempt[],
  materialProgress: [] as MaterialProgress[],
  certificates: [] as Certificate[],
  currentUser: null as UserProfile | null
};

let initInFlight: Promise<void> | null = null;
let lastInitializedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function initCurrentUser(): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;
  if (cacheState.currentUser) return cacheState.currentUser;

  const cached = sessionStorage.getItem('lms_current_user');
  if (cached) {
    try {
      cacheState.currentUser = JSON.parse(cached) as UserProfile;
      return cacheState.currentUser;
    } catch {
      sessionStorage.removeItem('lms_current_user');
    }
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();
  if (!profileData) return null;

  cacheState.currentUser = profileData as UserProfile;
  sessionStorage.setItem('lms_current_user', JSON.stringify(profileData));
  return cacheState.currentUser;
}

// Initializer: Fetch real data directly from Supabase Database
async function fetchLmsData(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Restore current user without loading the rest of the LMS data.
    await initCurrentUser();

    // 1. Fetch Trainings
    const { data: dbTrainings } = await supabase.from('trainings').select('*').order('created_at', { ascending: false });
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

    // Setelah pelatihan terpilih diketahui, seluruh data independen dimuat paralel.
    const [materialsResult, questionsResult, settingsResult, profilesResult, attemptsResult, progressResult, certificatesResult] = await Promise.all([
      supabase.from('materials').select('*').order('order_number', { ascending: true }),
      isAdmin ? supabase.from('questions').select('*') : Promise.resolve({ data: [] as Question[] }),
      supabase.from('certificate_settings').select('*'),
      Promise.resolve({ data: cacheState.currentUser ? [cacheState.currentUser] : [] }),
      userFilter
        ? supabase.from('test_attempts').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as TestAttempt[] }),
      userFilter
        ? supabase.from('material_progress').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as MaterialProgress[] }),
      userFilter
        ? supabase.from('certificates').select('*').eq('user_id', userFilter)
        : Promise.resolve({ data: [] as Certificate[] })
    ]);

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
  }
}

// Dedup request bersamaan dan gunakan cache singkat saat berpindah halaman.
export async function initLocalStorage(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!force && lastInitializedAt > 0 && Date.now() - lastInitializedAt < CACHE_TTL_MS) return;
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
    cacheState.currentUser = user;
    if (typeof window !== 'undefined') {
      if (user) {
        sessionStorage.setItem('lms_current_user', JSON.stringify(user));
      } else {
        sessionStorage.removeItem('lms_current_user');
      }
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

  saveTraining: async (trData: Partial<Training>): Promise<Training> => {
    const isNew = !trData.id;
    const targetId = isNew ? crypto.randomUUID() : trData.id!;

    const saved: Training = {
      id: targetId,
      title: trData.title || 'Pelatihan Baru',
      description: trData.description || '',
      start_date: trData.start_date || new Date().toISOString(),
      end_date: trData.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
      passing_score: trData.passing_score !== undefined ? Number(trData.passing_score) : 80,
      max_posttest_attempts: 5,
      jpl: trData.jpl !== undefined ? Number(trData.jpl) : 1,
      active: trData.active !== undefined ? trData.active : true,
      created_at: trData.created_at || new Date().toISOString()
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
    // Filter local cache
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

    // Cascade delete related materials, questions, test_attempts, certificates in Supabase
    await supabase.from('materials').delete().eq('training_id', id);
    await supabase.from('questions').delete().eq('training_id', id);
    await supabase.from('test_attempts').delete().eq('training_id', id);
    await supabase.from('certificates').delete().eq('training_id', id);
    const { error } = await supabase.from('trainings').delete().eq('id', id);
    if (error) console.error('Error deleting training from Supabase:', error.message);
  },

  getMaterials: (trainingId?: string): Material[] => {
    const targetTrainingId = trainingId || cacheState.training?.id;
    if (!targetTrainingId) return [];
    return cacheState.materials.filter(m => m.training_id === targetTrainingId);
  },

  saveMaterial: (mat: Partial<Material>): Material => {
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
      order_number: mat.order_number || cacheState.materials.length + 1,
      active: mat.active !== undefined ? mat.active : true
    };

    if (cacheState.materials.some(m => m.id === mat.id || m.id === targetId)) {
      cacheState.materials = cacheState.materials.map(m => (m.id === mat.id || m.id === targetId ? saved : m));
    } else {
      cacheState.materials.push(saved);
    }

    supabase.from('materials').upsert(saved).then(({ error }) => {
      if (error) console.error('Supabase saveMaterial error:', error.message);
    });

    return saved;
  },

  deleteMaterial: async (id: string) => {
    cacheState.materials = cacheState.materials.filter(m => m.id !== id);
    cacheState.materialProgress = cacheState.materialProgress.filter(mp => mp.material_id !== id);
    await supabase.from('material_progress').delete().eq('material_id', id);
    await supabase.from('materials').delete().eq('id', id);
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

  saveQuestion: (q: Partial<Question>): Question => {
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

    if (cacheState.questions.some(item => item.id === q.id || item.id === targetId)) {
      cacheState.questions = cacheState.questions.map(item => (item.id === q.id || item.id === targetId ? saved : item));
    } else {
      cacheState.questions.push(saved);
    }

    supabase.from('questions').upsert(saved).then(({ error }) => {
      if (error) console.error('Supabase saveQuestion error:', error.message);
    });

    return saved;
  },

  deleteQuestion: async (id: string) => {
    cacheState.questions = cacheState.questions.filter(q => q.id !== id);
    await supabase.from('questions').delete().eq('id', id);
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

  updateUserProfile: (id: string, updates: Partial<UserProfile>): UserProfile | null => {
    const p = cacheState.profiles.find(item => item.id === id);
    if (!p) return null;
    const updated = { ...p, ...updates };
    cacheState.profiles = cacheState.profiles.map(item => (item.id === id ? updated : item));
    if (cacheState.currentUser?.id === id) {
      StorageAPI.setCurrentUser(updated);
    }
    supabase.from('profiles').upsert(updated).then();
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
    const existing = cacheState.certSettingsList.find(setting => setting.training_id === trainingId);
    const base = existing || (cacheState.certSettings.training_id === trainingId
      ? cacheState.certSettings
      : { ...DEFAULT_CERT_SETTINGS, id: crypto.randomUUID(), training_id: trainingId });
    const updated = {
      ...base,
      ...updates,
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

  uploadDirectorSignature: async (file: File): Promise<string> => {
    const trainingId = cacheState.training?.id;
    if (!trainingId) throw new Error('Pilih pelatihan terlebih dahulu.');
    if (file.type !== 'image/png') throw new Error('Tanda tangan harus menggunakan format PNG.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Ukuran PNG maksimal 2 MB.');

    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngHeader.every((byte, index) => signature[index] === byte)) {
      throw new Error('Isi file bukan gambar PNG yang valid.');
    }

    const path = `${trainingId}/director-signature.png`;
    const { error } = await supabase.storage
      .from('certificate-assets')
      .upload(path, file, { upsert: true, contentType: 'image/png', cacheControl: '3600' });
    if (error) throw new Error(`Gagal mengunggah tanda tangan: ${error.message}`);

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
