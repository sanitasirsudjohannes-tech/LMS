export type UserRole = 'peserta' | 'admin';
export type TrainingStatus = 'draft' | 'active' | 'archived';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  institution: string;
  nip_nik?: string;
  phone?: string;
  role: UserRole;
  created_at: string;
}

export interface Training {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  passing_score: number;
  max_posttest_attempts: number;
  jpl: number;
  active: boolean;
  status: TrainingStatus;
  created_at: string;
}

export interface Material {
  id: string;
  training_id: string;
  title: string;
  description: string;
  content: string;
  content_url?: string;
  minimum_duration_seconds: number;
  order_number: number;
  active: boolean;
}

export interface Question {
  id: string;
  training_id: string;
  test_type: 'pretest' | 'posttest';
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  active: boolean;
}

export type TestOption = 'A' | 'B' | 'C' | 'D';

export type ParticipantQuestion = Omit<Question, 'correct_answer'>;

export interface SubmittedTestResult {
  score: number;
  attempt_number: number;
  passed: boolean;
  certificate_issued: boolean;
}

export interface TestSession {
  id: string;
  user_id: string;
  training_id: string;
  test_type: 'pretest' | 'posttest';
  attempt_number: number;
  answers: Record<string, TestOption>;
  status: 'in_progress' | 'submitted';
  started_at: string;
  updated_at: string;
}

export interface DisplayTestOption {
  label: TestOption;
  value: TestOption;
  text: string;
}

export interface TestAttempt {
  id: string;
  user_id: string;
  training_id: string;
  test_type: 'pretest' | 'posttest';
  score: number;
  attempt_number: number;
  started_at: string;
  submitted_at: string;
  answers?: Record<string, string>;
}

export interface MaterialProgress {
  id: string;
  user_id: string;
  material_id: string;
  started_at: string;
  completed_at?: string | null;
}

export interface CertificateSettings {
  id: string;
  training_id: string;
  certificate_enabled: boolean;
  numbering_enabled: boolean;
  number_format: string;
  start_number: number;
  number_digits: number;
  current_number: number;
  show_posttest_score: boolean;
  signatory_name: string;
  signatory_title: string;
  signatory_image_url?: string | null;
  stamp_image_url?: string | null;
  updated_at: string;
}

export interface Certificate {
  id: string;
  user_id: string | null;
  training_id: string | null;
  certificate_number: string | null;
  verification_code: string;
  issued_at: string;
  posttest_score: number;
  user_name?: string;
  user_institution?: string;
  training_title?: string;
  training_jpl?: number;
  training_start_date?: string;
  training_end_date?: string;
  show_posttest_score?: boolean;
  signatory_name?: string;
  signatory_title?: string;
  signatory_image_url?: string | null;
  stamp_image_url?: string | null;
}

export interface AdminStats {
  totalParticipants: number;
  completedPretest: number;
  inProgressMaterials: number;
  completedAllMaterials: number;
  completedPosttest: number;
  passed: number;
  failed: number;
  certificatesIssued: number;
}
