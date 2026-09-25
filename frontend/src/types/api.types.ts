export interface TokenPair {
  access_token: string;
  refresh_token: string;
}
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
}
export interface LoginData {
  login: string;
  password: string;
}

export interface UserProfile {
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  position: string | null;
  profile_complete: boolean;
}
export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  photo: string | null;
  profile: UserProfile | null;
}
export interface UpdateAccountData {
  first_name?: string;
  last_name?: string;
}
export interface UpdateProfileData {
  company_name?: string | null;
  industry?: string | null;
  company_size?: string | null;
  position?: string | null;
}

export type AnalysisStatus = 'in_progress' | 'completed';
export interface AnalysisOut {
  id: string;
  type: string;
  title: string;
  status: AnalysisStatus;
  created_at: string;
  snapshot_industry?: string | null;
  task_count?: number | null;
}

export interface SwotFactor {
  code: string;
  name: string;
  weight: number;
}
export interface NsrRow {
  code: string;
  n: number;
  s: number;
  r: string;
}
export interface NsrPair {
  total_n: number;
  total_s: number;
  rows: NsrRow[];
  cols: NsrRow[];
}
export interface SwotStrategy {
  name: string;
  tables: string[];
  total_n: number;
  total_s: number;
}
export interface SwotResultOut extends AnalysisOut {
  mode: 'questionnaire' | 'manual' | null;
  user_answers: Record<string, number> | null;
  manual_weights: Record<string, number> | null;
  s_factors: SwotFactor[];
  w_factors: SwotFactor[];
  o_factors: SwotFactor[];
  t_factors: SwotFactor[];
  criteria: Record<string, number[][]>;
  nsr: Record<string, NsrPair>;
  strategy: SwotStrategy[] | null;
  dominant_strategy: string | null;
}
export interface SwotQuestionsOut {
  industry: string;
  activity_name: Record<string, string>;
  criteria: Array<{
    code: string;
    name: Record<string, string>;
    scale: string;
    questions: Array<Record<string, string>>;
  }>;
  criteria_codes: string[];
  scales: Record<string, Array<Record<string, string>>>;
}

export interface AbcXyzItem {
  id?: string;
  name: string;
  quantity: number;
  unit_cost: number;
  sales_value?: number;
  share_pct?: number;
  cumulative_pct?: number;
  cv?: number;
  abc_class?: string;
  xyz_class?: string;
  category?: string;
}
export interface AbcXyzResultOut extends AnalysisOut {
  analysis_id: string;
  items: AbcXyzItem[];
  matrix: Array<{ abc_class: string; xyz_class: string; items: string[] }>;
  period_label?: string;
}

export interface EisenhowerTask {
  id: string;
  title: string;
  description: string | null;
  quadrant: number | null;
}
export interface EisenhowerResultOut extends AnalysisOut {
  tasks: EisenhowerTask[];
}

export interface ScheduleTask {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  responsible: string | null;
  depends_on: string[];
  status: string;
  progress: number;
  color?: string;
}
export interface ScheduleResultOut extends AnalysisOut {
  tasks: ScheduleTask[];
  stats: { total: number; completed: number; in_progress: number };
}

export interface PunktowaCriterion {
  id?: string;
  name: string;
  weight: number;
  max_score: number;
}
export interface PunktowaResultOut extends AnalysisOut {
  ptype: string;
  scale_from: number;
  scale_to: number;
  criteria: PunktowaCriterion[];
  subjects: Array<{ id: string; name: string }>;
  results: Array<{ subject_id: string; subject_name: string; total: number; weighted: number; rank: number; arith: number; pct: number }>;
}

export interface AudytCriterion {
  id?: string;
  name: string;
  max_score: number;
  weight: number;
}
export interface AudytResultOut extends AnalysisOut {
  num_auditors: number;
  scale_from: number;
  scale_to: number;
  red_threshold: number;
  criteria: AudytCriterion[];
  scores: Record<string, number[]>;
  results: Array<{ criterion_id: string; name: string; avg: number; weighted: number; pct: number }>;
  total_pct: number | null;
}
