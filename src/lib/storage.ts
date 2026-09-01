import {
  UserProfile,
  Training,
  Material,
  Question,
  TestAttempt,
  MaterialProgress,
  CertificateSettings,
  Certificate,
  AdminStats
} from '@/types';
import { generateVerificationCode, formatCertificateNumber } from './utils';
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
  signatory_name: 'Dr. Johanes, Sp.A',
  signatory_title: 'Direktur Pelatihan',
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
export async function initLocalStorage(): Promise<void> {
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

    // 2. Fetch Materials
    const { data: dbMaterials } = await supabase.from('materials').select('*').order('order_number', { ascending: true });
    cacheState.materials = dbMaterials || [];

    // 3. Fetch Questions
    const { data: dbQuestions } = await supabase.from('questions').select('*');
    cacheState.questions = dbQuestions || [];

    // 4. Fetch Cert Settings
    const { data: dbCertSettings } = await supabase.from('certificate_settings').select('*');
    if (dbCertSettings && dbCertSettings.length > 0) {
      cacheState.certSettingsList = dbCertSettings;
      cacheState.certSettings = dbCertSettings.find(setting => setting.training_id === cacheState.training?.id) || dbCertSettings[0];
    } else {
      cacheState.certSettingsList = [];
      cacheState.certSettings = DEFAULT_CERT_SETTINGS;
    }

    // 5. Fetch profiles only when required. Participants only need their own profile.
    if (cacheState.currentUser?.role === 'admin') {
      const { data: dbProfiles } = await supabase.from('profiles').select('*');
      cacheState.profiles = dbProfiles || [];
    } else {
      cacheState.profiles = cacheState.currentUser ? [cacheState.currentUser] : [];
    }

    // Load user test attempts, material progress & certs
    const currentUserId = cacheState.currentUser?.id;
    if (currentUserId && cacheState.currentUser?.role !== 'admin') {
      const { data: dbAttempts } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('user_id', currentUserId);
      if (dbAttempts) cacheState.testAttempts = dbAttempts;

      const { data: dbProgress } = await supabase
        .from('material_progress')
        .select('*')
        .eq('user_id', currentUserId);
      if (dbProgress) cacheState.materialProgress = dbProgress;

      const { data: dbCerts } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', currentUserId);
      if (dbCerts) cacheState.certificates = dbCerts;
    } else if (cacheState.currentUser?.role === 'admin') {
      const { data: dbAttempts } = await supabase.from('test_attempts').select('*');
      if (dbAttempts) cacheState.testAttempts = dbAttempts;

      const { data: dbProgress } = await supabase.from('material_progress').select('*');
      if (dbProgress) cacheState.materialProgress = dbProgress;

      const { data: dbCerts } = await supabase.from('certificates').select('*');
      if (dbCerts) cacheState.certificates = dbCerts;
    } else {
      cacheState.testAttempts = [];
      cacheState.materialProgress = [];
      cacheState.certificates = [];
    }
  } catch (err) {
    console.error('Supabase Direct Fetch Error:', err);
  }
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

  saveTraining: (trData: Partial<Training>): Training => {
    const isNew = !trData.id;
    const targetId = isNew ? crypto.randomUUID() : trData.id!;

    const saved: Training = {
      id: targetId,
      title: trData.title || 'Pelatihan Baru',
      description: trData.description || '',
      start_date: trData.start_date || new Date().toISOString(),
      end_date: trData.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
      passing_score: trData.passing_score !== undefined ? Number(trData.passing_score) : 80,
      max_posttest_attempts: trData.max_posttest_attempts !== undefined ? Number(trData.max_posttest_attempts) : 3,
      active: trData.active !== undefined ? trData.active : true,
      created_at: trData.created_at || new Date().toISOString()
    };

    if (cacheState.trainings.some(t => t.id === targetId)) {
      cacheState.trainings = cacheState.trainings.map(t => (t.id === targetId ? saved : t));
    } else {
      cacheState.trainings.unshift(saved);
    }

    cacheState.training = saved;

    supabase.from('trainings').upsert(saved).then(({ error }) => {
      if (error) console.error('Supabase saveTraining error:', error.message);
    });

    return saved;
  },

  updateTraining: (updates: Partial<Training>): Training => {
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

  saveTestAttempt: (attempt: Omit<TestAttempt, 'id' | 'started_at' | 'submitted_at'>): TestAttempt => {
    const newAttempt: TestAttempt = {
      ...attempt,
      id: crypto.randomUUID(),
      training_id: attempt.training_id || cacheState.training?.id || '',
      started_at: new Date().toISOString(),
      submitted_at: new Date().toISOString()
    };
    cacheState.testAttempts.push(newAttempt);
    
    // Save to Supabase (omit local 'answers' field if schema doesn't have it)
    const dbPayload = {
      id: newAttempt.id,
      user_id: newAttempt.user_id,
      training_id: newAttempt.training_id,
      test_type: newAttempt.test_type,
      score: newAttempt.score,
      attempt_number: newAttempt.attempt_number,
      started_at: newAttempt.started_at,
      submitted_at: newAttempt.submitted_at
    };
    supabase.from('test_attempts').insert(dbPayload).then();

    return newAttempt;
  },

  getMaterialProgress: (userId: string): MaterialProgress[] => {
    return cacheState.materialProgress.filter(p => p.user_id === userId);
  },

  startMaterial: (userId: string, materialId: string): MaterialProgress => {
    const existing = cacheState.materialProgress.find(p => p.user_id === userId && p.material_id === materialId);
    if (existing) return existing;

    const newProg: MaterialProgress = {
      id: crypto.randomUUID(),
      user_id: userId,
      material_id: materialId,
      started_at: new Date().toISOString()
    };
    cacheState.materialProgress.push(newProg);
    supabase.from('material_progress').insert(newProg).then();
    return newProg;
  },

  completeMaterial: (userId: string, materialId: string): MaterialProgress => {
    let p = cacheState.materialProgress.find(item => item.user_id === userId && item.material_id === materialId);
    if (!p) {
      p = {
        id: crypto.randomUUID(),
        user_id: userId,
        material_id: materialId,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };
      cacheState.materialProgress.push(p);
    } else {
      p.completed_at = new Date().toISOString();
    }

    supabase.from('material_progress').upsert(p).then();
    return p;
  },

  getCertificateSettings: (trainingId?: string): CertificateSettings => {
    if (trainingId) {
      return cacheState.certSettingsList.find(setting => setting.training_id === trainingId) || cacheState.certSettings;
    }
    return cacheState.certSettings;
  },

  updateCertificateSettings: (updates: Partial<CertificateSettings>): CertificateSettings => {
    const updated = { ...cacheState.certSettings, ...updates, updated_at: new Date().toISOString() };
    cacheState.certSettings = updated;
    const existingIndex = cacheState.certSettingsList.findIndex(setting => setting.training_id === updated.training_id);
    if (existingIndex >= 0) cacheState.certSettingsList[existingIndex] = updated;
    else cacheState.certSettingsList.push(updated);
    supabase.from('certificate_settings').upsert(updated).then();
    return updated;
  },

  getCertificates: (): Certificate[] => {
    return cacheState.certificates.map(cert => {
      const user = cacheState.profiles.find(profile => profile.id === cert.user_id);
      const training = cacheState.trainings.find(item => item.id === cert.training_id);
      return {
        ...cert,
        user_name: cert.user_name || user?.full_name || 'Peserta Pelatihan',
        user_institution: cert.user_institution || user?.institution || '',
        training_title: cert.training_title || training?.title || 'Pelatihan LMS'
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
      training_title: cert.training_title || training?.title || 'Pelatihan LMS'
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
      training_title: cert.training_title || training?.title || 'Pelatihan Standar Pelayanan & Keselamatan Kerja'
    };
  },

  findCertificateByVerificationCode: async (code: string): Promise<Certificate | null> => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return null;

    const { data: cert, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('verification_code', normalizedCode)
      .maybeSingle();
    if (error) throw new Error(`Verifikasi sertifikat gagal: ${error.message}`);
    if (!cert) return null;

    const [{ data: user }, { data: training }] = await Promise.all([
      supabase.from('profiles').select('full_name, institution').eq('id', cert.user_id).maybeSingle(),
      supabase.from('trainings').select('title').eq('id', cert.training_id).maybeSingle()
    ]);

    return {
      ...cert,
      user_name: user?.full_name || 'Peserta Pelatihan',
      user_institution: user?.institution || '',
      training_title: training?.title || 'Pelatihan LMS'
    } as Certificate;
  },

  issueCertificate: (userId: string, posttestScore: number): Certificate => {
    if (!cacheState.training) throw new Error('Pelatihan aktif tidak ditemukan.');
    const existing = StorageAPI.getCertificateForUser(userId);
    if (existing) return existing;

    const user = cacheState.profiles.find(p => p.id === userId) || cacheState.currentUser;
    const code = generateVerificationCode();
    const certNum = formatCertificateNumber(
      cacheState.certSettings.number_format,
      cacheState.certSettings.current_number,
      cacheState.certSettings.number_digits
    );

    const newCert: Certificate = {
      id: crypto.randomUUID(),
      user_id: userId,
      training_id: cacheState.training.id,
      certificate_number: certNum,
      verification_code: code,
      issued_at: new Date().toISOString(),
      posttest_score: posttestScore,
      user_name: user?.full_name || 'Peserta Pelatihan',
      user_institution: user?.institution || '',
      training_title: cacheState.training.title
    };

    cacheState.certificates.push(newCert);

    // Save core certificate fields to Supabase
    const dbPayload = {
      id: newCert.id,
      user_id: newCert.user_id,
      training_id: newCert.training_id,
      certificate_number: newCert.certificate_number,
      verification_code: newCert.verification_code,
      issued_at: newCert.issued_at,
      posttest_score: newCert.posttest_score
    };
    supabase.from('certificates').insert(dbPayload).then();

    // Increment current cert number
    cacheState.certSettings.current_number += 1;
    supabase.from('certificate_settings').upsert(cacheState.certSettings).then();

    return newCert;
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
