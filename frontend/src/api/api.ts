import { t, getLang } from '@/i18n/i18n';
import type {
  TokenPair, RegisterData, LoginData, User,
  UpdateAccountData, UpdateProfileData,
  AnalysisOut, SwotResultOut, SwotQuestionsOut,
  AbcXyzResultOut, AbcXyzItem,
  EisenhowerResultOut, EisenhowerTask,
  ScheduleResultOut, ScheduleTask,
  PunktowaResultOut, PunktowaCriterion,
  AudytResultOut, AudytCriterion,
} from '@/types/api.types';

const BASE_URL = '';

const SLOW_THRESHOLD_MS = 3000;

export const TokenStorage = {
  getAccess: () => localStorage.getItem('access_token'),
  getRefresh: () => localStorage.getItem('refresh_token'),
  save: (tokens: TokenPair) => {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
  },
  clear: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  isFormData?: boolean;
}

type RefreshResult = 'refreshed' | 'expired' | 'network_error';

let _refreshing: Promise<RefreshResult> | null = null;

function getTokenExpirySec(): number | null {
  const token = TokenStorage.getAccess();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

async function ensureFreshToken(): Promise<void> {
  const exp = getTokenExpirySec();
  if (exp === null) return;
  const secsLeft = exp - Math.floor(Date.now() / 1000);
  if (secsLeft < 60 && TokenStorage.getRefresh()) {
    await tryRefreshToken();
  }
}

async function tryRefreshToken(): Promise<RefreshResult> {
  if (_refreshing) return _refreshing;
  _refreshing = (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = TokenStorage.getRefresh();
      if (!refreshToken) return 'expired';
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return 'expired';
      const tokens: TokenPair = await res.json();
      TokenStorage.save(tokens);
      return 'refreshed';
    } catch {
      return 'network_error';
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}

async function apiRequest<T = unknown>(
  path: string,
  { method = 'GET', body, auth = true, isFormData = false }: RequestOptions = {}
): Promise<T> {
  if (auth) await ensureFreshToken();

  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = TokenStorage.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const _t0 = performance.now();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? (body as BodyInit) : JSON.stringify(body)) : undefined,
  });

  const _elapsed = Math.round(performance.now() - _t0);
  if (_elapsed > SLOW_THRESHOLD_MS) {
    console.warn(`[API ⚠️ slow] ${method} ${path} — ${_elapsed}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`);
  }

  if (response.status === 401 && auth && TokenStorage.getRefresh()) {
    console.warn(`[API] 401 on ${method} ${path} — attempting token refresh`);
    const result = await tryRefreshToken();
    if (result === 'refreshed') {
      console.info('[API] Token refreshed — retrying request');
      headers['Authorization'] = `Bearer ${TokenStorage.getAccess()}`;
      return apiRequest<T>(path, { method, body, auth, isFormData });
    }
    if (result === 'expired') {
      console.error('[API] Refresh token expired — notifying app');
      TokenStorage.clear();
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      throw new ApiError(401, 'session_expired');
    }
    console.warn('[API] Network error during refresh — not redirecting');
    throw new ApiError(0, 'network_error');
  }

  if (response.status === 204) return null as T;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(
      `[API ❌] ${method} ${path} → HTTP ${response.status}`,
      data ?? response.statusText
    );
    const rawDetail: string = typeof data?.detail === 'string' ? data.detail : response.statusText;
    const HTTP_ERROR_MAP: Record<number, string> = {
      400: t('error.bad_request'),
      401: t('error.unauthorized'),
      403: t('error.forbidden'),
      404: t('error.not_found'),
      405: t('error.method_not_allowed'),
      409: t('error.conflict'),
      422: t('error.validation'),
      429: t('error.too_many_requests'),
      500: t('error.server_error'),
      502: t('error.server_error'),
      503: t('error.server_error'),
    };
    const userMsg = HTTP_ERROR_MAP[response.status] ?? rawDetail;
    throw new ApiError(response.status, userMsg);
  }

  if (import.meta.env.DEV) {
    const icon = _elapsed > SLOW_THRESHOLD_MS ? '🐢' : '✓';
    console.log(`%c[API ${icon}]`, 'color:#4caf50', `${method} ${path}`, `${_elapsed}ms`);
  }
  return data as T;
}

export function fileSlug(title: string, date: string): string {
  const d = new Date(date).toISOString().slice(0, 10);
  const t = title.replace(/[^\w\u0400-\u04FF\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  return t ? `${t}_${d}` : d;
}

async function downloadExport(path: string, filename: string): Promise<void> {
  await ensureFreshToken();

  const doFetch = () => {
    const token = TokenStorage.getAccess();
    return fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };

  let response = await doFetch();

  if (response.status === 401 && TokenStorage.getRefresh()) {
    const result = await tryRefreshToken();
    if (result === 'refreshed') {
      response = await doFetch();
    } else if (result === 'expired') {
      TokenStorage.clear();
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
      return;
    }
  }

  if (!response.ok) throw new ApiError(response.status, 'export_failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const Api = {
  register: (data: RegisterData) => apiRequest<User>('/api/auth/register', { method: 'POST', body: data, auth: false }),
  login: (data: LoginData) => apiRequest<TokenPair>('/api/auth/login', { method: 'POST', body: data, auth: false }),
  me: () => apiRequest<User>('/api/auth/me'),
  logout: () => { TokenStorage.clear(); window.location.href = '/'; },
  changePassword: (data: { old_password: string; new_password: string }) =>
    apiRequest('/api/auth/password/change', { method: 'POST', body: data }),
  requestPasswordReset: (email: string) =>
    apiRequest('/api/auth/password/reset-request', { method: 'POST', body: { email }, auth: false }),
  confirmPasswordReset: (token: string, new_password: string) =>
    apiRequest('/api/auth/password/reset-confirm', { method: 'POST', body: { token, new_password }, auth: false }),

  updateAccount: (data: UpdateAccountData) => apiRequest<User>('/api/users/me', { method: 'PATCH', body: data }),
  updateProfile: (data: UpdateProfileData) => apiRequest('/api/users/me/profile', { method: 'PATCH', body: data }),
  changeEmail: (email: string) => apiRequest<User>('/api/users/me/email', { method: 'PATCH', body: { email } }),
  deleteAccount: () => apiRequest('/api/users/me', { method: 'DELETE' }),
  renameAnalysis: (id: string, title: string) =>
    apiRequest<{ id: string; title: string }>(`/api/users/me/analyses/${id}/title`, { method: 'PATCH', body: { title } }),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiRequest<User>('/api/users/me/avatar', { method: 'POST', body: fd, isFormData: true });
  },
  deleteAvatar: () => apiRequest<User>('/api/users/me/avatar', { method: 'DELETE' }),

  listAbcXyz: () => apiRequest<AnalysisOut[]>('/api/analyses/abc-xyz'),
  createAbcXyz: (title?: string) => apiRequest<AnalysisOut>('/api/analyses/abc-xyz', { method: 'POST', body: { title } }),
  setAbcXyzItems: (id: string, data: { items: AbcXyzItem[] }) =>
    apiRequest<AbcXyzResultOut>(`/api/analyses/abc-xyz/${id}/items`, { method: 'PUT', body: data }),
  completeAbcXyz: (id: string) => apiRequest<AbcXyzResultOut>(`/api/analyses/abc-xyz/${id}/complete?lang=${getLang()}`, { method: 'POST' }),
  getAbcXyz: (id: string) => apiRequest<AbcXyzResultOut>(`/api/analyses/abc-xyz/${id}?lang=${getLang()}`),
  deleteAbcXyz: (id: string) => apiRequest(`/api/analyses/abc-xyz/${id}`, { method: 'DELETE' }),
  exportAbcXyz: (id: string, label?: string) => downloadExport(`/api/analyses/abc-xyz/${id}/export?lang=${getLang()}`, label ? `${label}.xlsx` : `abc_xyz_${id.slice(0,8)}.xlsx`),

  getSwotQuestions: () => apiRequest<SwotQuestionsOut>('/api/analyses/swot/questions'),
  submitSwotAnswers: (id: string, answers: Record<string, number>) =>
    apiRequest<SwotResultOut>(`/api/analyses/swot/${id}/answers`, { method: 'POST', body: { answers } }),
  setSwotWeights: (id: string, weights: Record<string, number>) =>
    apiRequest<SwotResultOut>(`/api/analyses/swot/${id}/weights`, { method: 'PUT', body: { weights } }),
  listSwot: (type?: string) => apiRequest<AnalysisOut[]>(`/api/analyses/swot${type ? `?type=${type}` : ''}`),
  createSwot: (type: string, title?: string) =>
    apiRequest<AnalysisOut>(`/api/analyses/swot?type=${type}`, { method: 'POST', body: { title } }),
  setSwotMatrix: (id: string, cells: Record<string, number[][]>) =>
    apiRequest<SwotResultOut>(`/api/analyses/swot/${id}/matrix`, { method: 'PUT', body: { cells } }),
  completeSwot: (id: string) => apiRequest<SwotResultOut>(`/api/analyses/swot/${id}/complete`, { method: 'POST' }),
  getSwot: (id: string) => apiRequest<SwotResultOut>(`/api/analyses/swot/${id}`),
  deleteSwot: (id: string) => apiRequest(`/api/analyses/swot/${id}`, { method: 'DELETE' }),
  extendSwot: (id: string) => apiRequest<{ new_analysis_id: string; missing_pairs: string[] }>(`/api/analyses/swot/${id}/extend`, { method: 'POST' }),
  exportSwot: (id: string, label?: string) => downloadExport(`/api/analyses/swot/${id}/export?lang=${getLang()}`, label ? `${label}.xlsx` : `swot_${id.slice(0,8)}.xlsx`),

  listEisenhower: () => apiRequest<AnalysisOut[]>('/api/analyses/eisenhower'),
  createEisenhower: (title?: string) => apiRequest<AnalysisOut>('/api/analyses/eisenhower', { method: 'POST', body: { title } }),
  addEisenhowerTask: (id: string, data: Omit<EisenhowerTask, 'id' | 'quadrant'>) =>
    apiRequest<EisenhowerResultOut>(`/api/analyses/eisenhower/${id}/tasks`, { method: 'POST', body: data }),
  updateEisenhowerTask: (id: string, taskId: string, data: Partial<EisenhowerTask>) =>
    apiRequest<EisenhowerResultOut>(`/api/analyses/eisenhower/${id}/tasks/${taskId}`, { method: 'PATCH', body: data }),
  deleteEisenhowerTask: (id: string, taskId: string) =>
    apiRequest(`/api/analyses/eisenhower/${id}/tasks/${taskId}`, { method: 'DELETE' }),
  completeEisenhower: (id: string) => apiRequest<EisenhowerResultOut>(`/api/analyses/eisenhower/${id}/complete`, { method: 'POST' }),
  getEisenhower: (id: string) => apiRequest<EisenhowerResultOut>(`/api/analyses/eisenhower/${id}`),
  deleteEisenhower: (id: string) => apiRequest(`/api/analyses/eisenhower/${id}`, { method: 'DELETE' }),
  exportEisenhower: (id: string, label?: string) => downloadExport(`/api/analyses/eisenhower/${id}/export?lang=${getLang()}`, label ? `${label}.xlsx` : `eisenhower_${id.slice(0,8)}.xlsx`),

  listSchedule: () => apiRequest<AnalysisOut[]>('/api/analyses/schedule'),
  createSchedule: (title?: string) => apiRequest<AnalysisOut>('/api/analyses/schedule', { method: 'POST', body: { title } }),
  addScheduleTask: (id: string, data: Omit<ScheduleTask, 'id'>) =>
    apiRequest<ScheduleResultOut>(`/api/analyses/schedule/${id}/tasks`, { method: 'POST', body: data }),
  updateScheduleTask: (id: string, taskId: string, data: Partial<ScheduleTask>) =>
    apiRequest<ScheduleResultOut>(`/api/analyses/schedule/${id}/tasks/${taskId}`, { method: 'PATCH', body: data }),
  deleteScheduleTask: (id: string, taskId: string) =>
    apiRequest(`/api/analyses/schedule/${id}/tasks/${taskId}`, { method: 'DELETE' }),
  reorderScheduleTasks: (id: string, taskIds: string[]) =>
    apiRequest(`/api/analyses/schedule/${id}/reorder`, { method: 'POST', body: { task_ids: taskIds } }),
  completeSchedule: (id: string) => apiRequest<ScheduleResultOut>(`/api/analyses/schedule/${id}/complete`, { method: 'POST' }),
  getSchedule: (id: string) => apiRequest<ScheduleResultOut>(`/api/analyses/schedule/${id}`),
  deleteSchedule: (id: string) => apiRequest(`/api/analyses/schedule/${id}`, { method: 'DELETE' }),
  exportSchedule: (id: string, label?: string) => downloadExport(`/api/analyses/schedule/${id}/export?lang=${getLang()}`, label ? `${label}.xlsx` : `schedule_${id.slice(0,8)}.xlsx`),

  listPunktowa: (type?: string) => apiRequest<AnalysisOut[]>(`/api/analyses/punktowa${type ? `?type=${type}` : ''}`),
  createPunktowa: (type: string, title?: string) =>
    apiRequest<AnalysisOut>(`/api/analyses/punktowa?type=${type}`, { method: 'POST', body: { title } }),
  setPunktowaScale: (id: string, data: { scale_min: number; scale_max: number }) =>
    apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/scale`, { method: 'PUT', body: data }),
  setPunktowaCriteria: (id: string, criteria: PunktowaCriterion[]) =>
    apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/criteria`, { method: 'PUT', body: { criteria } }),
  normalizePunktowaCriteria: (id: string) =>
    apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/criteria/normalize`, { method: 'POST' }),
  setPunktowaSubjects: (id: string, names: string[]) =>
    apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/subjects`, { method: 'PUT', body: { names } }),
  setPunktowaScores: (id: string, scores: Record<string, number[]>) =>
    apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/scores`, { method: 'PUT', body: { scores } }),
  completePunktowa: (id: string) => apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}/complete`, { method: 'POST' }),
  getPunktowa: (id: string) => apiRequest<PunktowaResultOut>(`/api/analyses/punktowa/${id}`),
  deletePunktowa: (id: string) => apiRequest(`/api/analyses/punktowa/${id}`, { method: 'DELETE' }),
  exportPunktowa: (id: string, label?: string) => downloadExport(`/api/analyses/punktowa/${id}/export?lang=${getLang()}`, label ? `${label}.xlsx` : `punktowa_${id.slice(0,8)}.xlsx`),

  listAudyt: () => apiRequest<AnalysisOut[]>('/api/analyses/audyt'),
  createAudyt: (title?: string) => apiRequest<AnalysisOut>('/api/analyses/audyt', { method: 'POST', body: { title } }),
  getAudyt: (id: string) => apiRequest<AudytResultOut>(`/api/analyses/audyt/${id}`),
  deleteAudyt: (id: string) => apiRequest(`/api/analyses/audyt/${id}`, { method: 'DELETE' }),
  updateAudytSession: (id: string, data: Partial<AudytResultOut>) =>
    apiRequest<AudytResultOut>(`/api/analyses/audyt/${id}/session`, { method: 'PATCH', body: data }),
  setAudytCriteria: (id: string, criteria: AudytCriterion[]) =>
    apiRequest<AudytResultOut>(`/api/analyses/audyt/${id}/criteria`, { method: 'PUT', body: { criteria } }),
  saveAudytScores: (id: string, scores: Array<{ criterion_id: string; auditor_number: number; score: number }>) =>
    apiRequest(`/api/analyses/audyt/${id}/scores`, { method: 'PUT', body: { scores } }),
  calculateAudyt: (id: string) => apiRequest<AudytResultOut>(`/api/analyses/audyt/${id}/calculate`, { method: 'POST' }),
  exportAudyt: (id: string, label?: string) => downloadExport(`/api/analyses/audyt/${id}/export/xlsx?lang=${getLang()}`, label ? `${label}.xlsx` : `audyt_${id.slice(0,8)}.xlsx`),
};
