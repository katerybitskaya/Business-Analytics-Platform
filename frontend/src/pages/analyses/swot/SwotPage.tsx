import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigationType, useLocation } from 'react-router-dom';
import { Api, fileSlug } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';
import { useLang } from '@/context/LangContext';
import { useAuth } from '@/context/AuthContext';
import { GuidePanel } from '@/components/GuidePanel';
import { logger, createDevLogger } from '@/utils/logger';
import type { AnalysisOut } from '@/types/api.types';
import { Chart, registerables } from 'chart.js';
import EditableTitle from '@/components/EditableTitle';
import { getDisplayTitle } from '@/utils/analysisTitle';
Chart.register(...registerables);

type Section = 'list' | 'questionnaire' | 'manual' | 'matrix' | 'results';

const WEIGHT_GROUPS = ['S', 'W', 'O', 'T'] as const;
const WEIGHT_CODES = WEIGHT_GROUPS.flatMap(g => [1, 2, 3, 4, 5].map(i => `${g}${i}`));
const WEIGHT_SUM_TOLERANCE = 0.005;

const PAIRS_BY_TYPE: Record<string, string[]> = {
  swot: ['S/O','S/T','W/O','W/T'],
  tows: ['O/S','O/W','T/S','T/W'],
  'swot-tows': ['S/O','S/T','W/O','W/T','O/S','O/W','T/S','T/W'],
};
const TYPE_LABELS: Record<string, string> = { swot: 'SWOT', tows: 'TOWS', 'swot-tows': 'SWOT-TOWS' };

const PAIR_QUESTIONS: Record<string, { en: string; pl: string; ru: string }> = {
  'S/O': { ru: 'Позволяет ли данная сильная сторона использовать данную возможность?', pl: 'Czy określona mocna strona pozwala wykorzystać daną szansę?', en: 'Does this strength allow exploiting this opportunity?' },
  'S/T': { ru: 'Позволяет ли данная сильная сторона нейтрализовать данную угрозу?', pl: 'Czy określona mocna strona pozwala ograniczyć dane zagrożenie?', en: 'Does this strength help neutralize this threat?' },
  'W/O': { ru: 'Позволяет ли данная возможность устранить данную слабую сторону?', pl: 'Czy określona słaba strona ogranicza możliwość wykorzystania danej szansy?', en: 'Does this opportunity help overcome this weakness?' },
  'W/T': { ru: 'Увеличивает ли данная слабая сторона уязвимость к данной угрозе?', pl: 'Czy określona słaba strona potęguje dane zagrożenie?', en: 'Does this weakness increase vulnerability to this threat?' },
  'O/S': { ru: 'Усиливает ли данная возможность данную сильную сторону?', pl: 'Czy określona szansa potęguje daną mocną stronę?', en: 'Does this opportunity enhance this strength?' },
  'O/W': { ru: 'Позволяет ли данная возможность преодолеть данную слабую сторону?', pl: 'Czy określona szansa pozwala osłabić daną słabą stronę?', en: 'Does this opportunity help overcome this weakness?' },
  'T/S': { ru: 'Ослабляет ли данная угроза данную сильную сторону?', pl: 'Czy określone zagrożenie ogranicza daną mocną stronę?', en: 'Does this threat weaken this strength?' },
  'T/W': { ru: 'Усугубляет ли данная угроза данную слабую сторону?', pl: 'Czy określone zagrożenie wzmacnia daną słabą stronę?', en: 'Does this threat deepen this weakness?' },
};
const INDUSTRY_KEY: Record<string, string> = {
  'Sales, Procurement': 'industry.sales',
  'Finance, Accounting, Banks': 'industry.finance',
  'Production': 'industry.production',
  'Logistics': 'industry.logistics',
  'Marketing, Advertising, PR': 'industry.marketing',
  'Construction': 'industry.construction',
  'Education': 'industry.education',
  'Medicine': 'industry.medicine',
  'Transport': 'industry.transport',
  'IT & Technology': 'industry.it',
  'Retail / Wholesale': 'industry.retail',
  'Services': 'industry.services',
};
const DRAFT_KEY = 'swot_draft';

function localName(nameObj: any) {
  const lang = getLang();
  return nameObj ? (nameObj[lang] || nameObj['en'] || '') : '';
}

function flattenFactors(result: any, onlyCodes?: Set<string>): Record<string, number> {
  const flat: Record<string, number> = {};
  (['s_factors', 'w_factors', 'o_factors', 't_factors'] as const).forEach(key => {
    (result?.[key] || []).forEach((f: any) => {
      if (f.weight > 0 && (!onlyCodes || onlyCodes.has(f.code))) flat[f.code] = f.weight;
    });
  });
  return flat;
}

function manualPrefillWeights(data: any): Record<string, number> {
  if (data?.manual_weights && Object.keys(data.manual_weights).length) {
    return { ...data.manual_weights };
  }
  if (data?.mode === 'manual') return flattenFactors(data);
  const answeredCodes = new Set(Object.keys(data?.user_answers || {}));
  return flattenFactors(data, answeredCodes.size ? answeredCodes : undefined);
}

function saveDraft(data: object) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
}
function loadDraft(): any {
  try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function SwotPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const log = createDevLogger('SWOT', '#6c63ff');
  const navType = useNavigationType();
  const location = useLocation();
  const initialLocationKeyRef = useRef(location.key);

  useEffect(() => {
    if (location.key === initialLocationKeyRef.current) return;
    flushMatrix();
    flushAnswers();
    flushWeights();
    setSection('list');
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const { lang } = useLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';

  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>('list');
  const [questPage, setQuestPage] = useState(0);
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [criteriaOpen, setCriteriaOpen] = useState(() => { try { return localStorage.getItem('swot_criteria_open') === '1'; } catch { return false; } });

  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const [pairs, setPairs] = useState<string[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [grids, setGrids] = useState<Record<string, number[][]>>({});
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [questions, setQuestions] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [selectedResultPair, setSelectedResultPair] = useState<string>('');
  const [selectedCriteriaGroup, setSelectedCriteriaGroup] = useState<string>('S');
  const factorMapRef = useRef<Record<string, string> | null>(null);
  const factorMapLangRef = useRef<string>('');
  const factorMapHadQRef = useRef<boolean>(false);
  const mountedRef = useRef(false);

  const matrixSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisIdRef = useRef(analysisId);
  const sectionRef = useRef(section);
  const gridsRef = useRef(grids);
  const pairsRef = useRef(pairs);
  const pairIndexRef = useRef(pairIndex);
  const answersRef = useRef(answers);
  const weightsRef = useRef(weights);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { sectionRef.current = section; }, [section]);
  useEffect(() => { gridsRef.current = grids; }, [grids]);
  useEffect(() => { pairsRef.current = pairs; }, [pairs]);
  useEffect(() => { pairIndexRef.current = pairIndex; }, [pairIndex]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { weightsRef.current = weights; }, [weights]);

  const flushMatrix = useCallback(async () => {
    if (matrixSaveTimer.current) { clearTimeout(matrixSaveTimer.current); matrixSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'matrix') return;
    const pair = pairsRef.current[pairIndexRef.current];
    if (!pair) return;
    const cells: Record<string, number[][]> = {
      [pair]: gridsRef.current[pair] || Array(5).fill(null).map(() => Array(5).fill(0)),
    };
    try {
      const result = await Api.setSwotMatrix(analysisIdRef.current, cells);
      setLastResult(result);
      factorMapRef.current = null;
      log('matrix flushed', pair);
    } catch {}
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'matrix') return;
    if (matrixSaveTimer.current) clearTimeout(matrixSaveTimer.current);
    matrixSaveTimer.current = setTimeout(() => { flushMatrix(); }, 800);
    return () => { if (matrixSaveTimer.current) clearTimeout(matrixSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grids]);

  useEffect(() => {
    return () => { flushMatrix(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushAnswers = useCallback(async () => {
    if (answersSaveTimer.current) { clearTimeout(answersSaveTimer.current); answersSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'questionnaire') return undefined;
    if (Object.keys(answersRef.current).length === 0) return undefined;
    try {
      const result = await Api.submitSwotAnswers(analysisIdRef.current, answersRef.current);
      setLastResult(result);
      factorMapRef.current = null;
      log('answers flushed');
      return result;
    } catch (e) { logger.error('[SWOT] flushAnswers', e); return undefined; }
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'questionnaire') return;
    if (answersSaveTimer.current) clearTimeout(answersSaveTimer.current);
    answersSaveTimer.current = setTimeout(() => { flushAnswers(); }, 800);
    return () => { if (answersSaveTimer.current) clearTimeout(answersSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  useEffect(() => {
    return () => { flushAnswers(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushWeights = useCallback(async () => {
    if (weightsSaveTimer.current) { clearTimeout(weightsSaveTimer.current); weightsSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'manual') return undefined;
    if (Object.keys(weightsRef.current).length === 0) return undefined;
    try {
      const result = await Api.setSwotWeights(analysisIdRef.current, weightsRef.current);
      setLastResult(result);
      factorMapRef.current = null;
      log('weights flushed');
      return result;
    } catch (e) { logger.error('[SWOT] flushWeights', e); return undefined; }
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'manual') return;
    if (weightsSaveTimer.current) clearTimeout(weightsSaveTimer.current);
    weightsSaveTimer.current = setTimeout(() => { flushWeights(); }, 800);
    return () => { if (weightsSaveTimer.current) clearTimeout(weightsSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  useEffect(() => {
    return () => { flushWeights(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartNRef = useRef<HTMLCanvasElement>(null);
  const chartSRef = useRef<HTMLCanvasElement>(null);
  const chartNInst = useRef<Chart | null>(null);
  const chartSInst = useRef<Chart | null>(null);
  const chartStratNRef = useRef<HTMLCanvasElement>(null);
  const chartStratSRef = useRef<HTMLCanvasElement>(null);
  const chartStratNInst = useRef<Chart | null>(null);
  const chartStratSInst = useRef<Chart | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await Api.listSwot();
      setList(list);
      log('list loaded', list.length + ' analyses');
    } catch (e: any) {
      logger.error('[SWOT] loadList', e);
    }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadList();
    if (location.state?.openId) { openAnalysis(location.state.openId); return; }
    const draft = loadDraft();
    const isPageReload = navType === 'POP' &&
      (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]?.type === 'reload';
    const wasOnList = (() => { try { return sessionStorage.getItem(DRAFT_KEY + '_on_list') === '1'; } catch { return false; } })();
    if (isPageReload && draft?.analysisId && !wasOnList) {
      openAnalysis(draft.analysisId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') { try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {} return; }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft({ analysisId, section });
  }, [analysisId, section]);

  useEffect(() => { const t = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0); return () => clearTimeout(t); }, [section]);
  useEffect(() => { const t = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0); return () => clearTimeout(t); }, [questPage]);
  useEffect(() => { const t = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0); return () => clearTimeout(t); }, [pairIndex]);

  useEffect(() => {
    if (section !== 'results') {
      chartNInst.current?.destroy(); chartNInst.current = null;
      chartSInst.current?.destroy(); chartSInst.current = null;
      chartStratNInst.current?.destroy(); chartStratNInst.current = null;
      chartStratSInst.current?.destroy(); chartStratSInst.current = null;
    }
  }, [section]);

  useEffect(() => {
    if (section === 'results' && lastResult?.nsr) {
      setTimeout(() => {
        renderCharts(lastResult.nsr);
        if (lastResult.type === 'swot-tows' && lastResult.strategy) renderStrategyCharts(lastResult.strategy);
      }, 50);
    }
  }, [section, lastResult, lang]);

  useEffect(() => {
    if (section !== 'results' || !lastResult?.nsr) return;
    const obs = new MutationObserver(() => {
      setTimeout(() => {
        renderCharts(lastResult.nsr);
        if (lastResult.type === 'swot-tows' && lastResult.strategy) renderStrategyCharts(lastResult.strategy);
      }, 0);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [section, lastResult]);

  function buildFactorMap(result: any, q: any): Record<string, string> {
    const hasQ = !!(q?.criteria);
    if (factorMapRef.current && factorMapLangRef.current === getLang() && factorMapHadQRef.current === hasQ) {
      return factorMapRef.current;
    }
    const map: Record<string, string> = {};
    ['s_factors','w_factors','o_factors','t_factors'].forEach(key => {
      (result?.[key] || []).forEach((f: any) => { map[f.code] = f.name || ''; });
    });
    if (q?.criteria) {
      q.criteria.forEach((c: any) => { if (!map[c.code]) map[c.code] = localName(c.name); });
    }
    factorMapLangRef.current = getLang();
    factorMapHadQRef.current = hasQ;
    factorMapRef.current = map;
    return map;
  }

  async function createAnalysis(type: string) {
    if (busy) return;
    if (!user?.profile?.industry) { showToast(t('swot.profile_required'), 'error'); return; }
    setBusy(true);
    try {
      log('creating', type);
      const a = await Api.createSwot(type, undefined);
      log('created', a.id);
      await openAnalysis(a.id);
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[SWOT] createAnalysis', e); }
    finally { setBusy(false); }
  }

  async function openAnalysis(id: string) {
    log('open', id);
    try {
      const data = await Api.getSwot(id);
      setAnalysisId(id);
      factorMapRef.current = null;
      const p = PAIRS_BY_TYPE[data.type] || [];
      setPairs(p);
      setLastResult(data);

      const g: Record<string, number[][]> = {};
      if (data.criteria) {
        Object.keys(data.criteria).forEach(pair => {
          const grid = data.criteria[pair];
          if (Array.isArray(grid) && Array.isArray(grid[0])) g[pair] = grid;
        });
      }
      setGrids(g);

      if (data.status === 'completed') {
        clearDraft();
        try { const q = await Api.getSwotQuestions(); factorMapRef.current = null; setQuestions(q); } catch {}
        setSection('results');
        return;
      }

      const groupReady = (factors: any[] | undefined) => {
        const arr = factors || [];
        if (arr.length !== 5) return false;
        const sum = arr.reduce((acc, f) => acc + (Number(f.weight) || 0), 0);
        return arr.every(f => Number(f.weight) > 0) && Math.abs(sum - 1) < WEIGHT_SUM_TOLERANCE;
      };
      const shapeValid = groupReady(data.s_factors) && groupReady(data.w_factors) &&
                         groupReady(data.o_factors) && groupReady(data.t_factors);
      const questionnaireGenuinelyComplete = WEIGHT_CODES.every(c => data.user_answers && data.user_answers[c] !== undefined);
      const factorsReady = shapeValid && (data.mode === 'manual' || questionnaireGenuinelyComplete);
      const hasMatrixProgress = Object.keys(g).length > 0;

      const draft = loadDraft();
      const resumeStep1 = draft?.analysisId === id &&
        (draft.section === 'questionnaire' || draft.section === 'manual')
        ? draft.section as 'questionnaire' | 'manual' : null;

      if (!resumeStep1 && (hasMatrixProgress || factorsReady)) {
        try { const q = await Api.getSwotQuestions(); factorMapRef.current = null; setQuestions(q); } catch {}
        const idx = p.findIndex(pair => !g[pair]);
        setPairIndex(idx === -1 ? 0 : idx);
        setSection('matrix');
        return;
      }

      if (resumeStep1 === 'manual' || (!resumeStep1 && data.mode === 'manual')) {
        setWeights(manualPrefillWeights(data));
        setSection('manual');
        return;
      }

      await openQuestionnaire(false, data.user_answers || {});
    } catch (e: any) {
      showToast(t('swot.load_error') + ' ' + (e.message || e), 'error');
      logger.error('[SWOT] openAnalysis', e);
    }
  }

  async function openQuestionnaire(keepAnswers: boolean, resumeAnswers?: Record<string, number>) {
    try {
      const q = await Api.getSwotQuestions();
      setQuestions(q);
      if (!keepAnswers) {
        setAnswers(resumeAnswers && Object.keys(resumeAnswers).length ? resumeAnswers : {});
        setQuestPage(0);
      }
      setSection('questionnaire');
    } catch (e: any) {
      const msg = (e.detail || e.message || '').toString();
      if (msg.includes('set_industry_in_profile')) showToast(t('swot.profile_required'), 'error');
      else showToast(t('swot.load_questions_error') + ' ' + msg, 'error');
      setSection('list');
    }
  }

  async function handleSubmitAnswers() {
    if (!questions || busy) return;
    const codes = questions.criteria_codes || [];
    const missing = codes.filter((c: string) => !answers[c]);
    if (missing.length) {
      showToast(t('swot.answer_required') + ' ' + missing.join(', ') + ')', 'error');
      return;
    }
    if (answersSaveTimer.current) { clearTimeout(answersSaveTimer.current); answersSaveTimer.current = null; }
    setBusy(true);
    try {
      const result = await Api.submitSwotAnswers(analysisId!, answers);
      setLastResult(result);
      factorMapRef.current = null;
      setPairIndex(0);
      log('answers submitted → matrix');
      setSection('matrix');
    } catch (e: any) {
      showToast(t('swot.save_answers_error') + ' ' + (e.message || e), 'error');
      logger.error('[SWOT] submitAnswers', e);
    } finally { setBusy(false); }
  }

  function weightGroupSum(group: string): number {
    return [1, 2, 3, 4, 5].reduce((acc, i) => acc + (weights[`${group}${i}`] || 0), 0);
  }
  function weightGroupOk(group: string): boolean {
    return Math.abs(weightGroupSum(group) - 1.0) < WEIGHT_SUM_TOLERANCE;
  }

  function handleNormalizeGroup(group: string) {
    const codes = [1, 2, 3, 4, 5].map(i => `${group}${i}`);
    const raw = codes.map(c => weights[c] || 0);
    const total = raw.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const normalized = raw.map(w => Math.round((w / total) * 100) / 100);
    const diff = Math.round((1 - normalized.reduce((a, b) => a + b, 0)) * 100) / 100;
    if (diff !== 0) {
      const maxIdx = normalized.indexOf(Math.max(...normalized));
      normalized[maxIdx] = Math.round((normalized[maxIdx] + diff) * 100) / 100;
    }
    setWeights(prev => {
      const next = { ...prev };
      codes.forEach((c, i) => { next[c] = normalized[i]; });
      return next;
    });
    showToast(t('swot.weights_normalized'));
  }

  function handleWeightInput(code: string, raw: string) {
    const parsed = parseFloat(raw);
    const value = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
    const decimals = raw.split('.')[1];
    if (decimals && decimals.length > 2) {
      showToast(t('swot.weight_rounded'));
    }
    setWeights(prev => ({ ...prev, [code]: value }));
  }

  async function handleSaveWeights() {
    if (busy) return;
    const unfilled = WEIGHT_CODES.filter(c => !(weights[c] > 0));
    if (unfilled.length) {
      showToast(t('swot.weights_fill_required') + ' (' + unfilled.join(', ') + ')', 'error');
      return;
    }
    const badGroups = WEIGHT_GROUPS.filter(g => !weightGroupOk(g));
    if (badGroups.length) {
      showToast(t('swot.weights_must_equal_1') + ' ' + badGroups.join(', '), 'error');
      return;
    }
    if (weightsSaveTimer.current) { clearTimeout(weightsSaveTimer.current); weightsSaveTimer.current = null; }
    setBusy(true);
    try {
      const result = await Api.setSwotWeights(analysisId!, weights);
      setLastResult(result);
      factorMapRef.current = null;
      setPairIndex(0);
      log('weights saved → matrix');
      setSection('matrix');
    } catch (e: any) {
      showToast(t('swot.save_weights_error') + ' ' + (e.message || e), 'error');
      logger.error('[SWOT] handleSaveWeights', e);
    } finally { setBusy(false); }
  }

  async function handleBackToStep1() {
    if (busy) return;
    setBusy(true);
    try {
      await flushMatrix();
      if (lastResult?.mode === 'manual') {
        setWeights(manualPrefillWeights(lastResult));
        setSection('manual');
        return;
      }
      if (Object.keys(answersRef.current).length === 0 &&
          lastResult?.user_answers && Object.keys(lastResult.user_answers).length) {
        setAnswers(lastResult.user_answers);
      }
      if (!questions) { await openQuestionnaire(true); }
      setQuestPage(3);
      setSection('questionnaire');
    } finally { setBusy(false); }
  }

  function toggleCell(pair: string, ri: number, ci: number) {
    setGrids(prev => {
      const g = prev[pair] ? prev[pair].map(r => [...r]) : Array(5).fill(null).map(() => Array(5).fill(0));
      g[ri][ci] = g[ri][ci] ? 0 : 1;
      return { ...prev, [pair]: g };
    });
  }

  async function savePairAndAdvance() {
    if (busy) return;
    if (matrixSaveTimer.current) { clearTimeout(matrixSaveTimer.current); matrixSaveTimer.current = null; }
    const pair = pairs[pairIndex];
    const cells: Record<string, number[][]> = {};
    cells[pair] = grids[pair] || Array(5).fill(null).map(() => Array(5).fill(0));
    setBusy(true);
    try {
      const result = await Api.setSwotMatrix(analysisId!, cells);
      setLastResult(result);
      factorMapRef.current = null;
      log('pair saved', pair);
    } catch (e: any) {
      showToast(t('swot.matrix_save_error'), 'error');
      logger.error('[SWOT] saveMatrix pair=' + pair, e);
      setBusy(false);
      return;
    }
    if (pairIndex < pairs.length - 1) {
      setPairIndex(i => i + 1);
      setBusy(false);
    } else {
      try {
        const result = await Api.completeSwot(analysisId!);
        setLastResult(result);
        setList(prev => prev.map(x => x.id === analysisId ? { ...x, status: 'completed' as const } : x));
        clearDraft();
        log('completed → results');
        setSection('results');
      } catch (e: any) {
        showToast(t('swot.complete_error') + ' ' + (e.message || e), 'error');
        logger.error('[SWOT] completeSwot', e);
      } finally { setBusy(false); }
    }
  }

  function getChartTheme() {
    const isDark = (document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'dark') !== 'light';
    return {
      text:  isDark ? '#a0a3b8' : '#5a5f7a',
      grid:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)',
      bg:    isDark ? '#1a1d2e' : '#ffffff',
    };
  }

  function barDataset(label: string, data: number[], colors: string[]) {
    return {
      label,
      data,
      backgroundColor: colors,
      borderRadius: 0,
      borderSkipped: false as const,
      barPercentage: 0.45,
      categoryPercentage: 0.65,
    };
  }
  function barOptions(th: ReturnType<typeof getChartTheme>, stepSize?: number) {
    return {
      responsive: true,
      maintainAspectRatio: true,
      layout: { padding: { top: 16, bottom: 4, left: 4, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: th.bg === '#ffffff' ? '#fff' : '#1e2130',
          borderColor: 'rgba(99,102,241,0.3)',
          borderWidth: 1,
          titleColor: th.text,
          bodyColor: th.text,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: (items: any[]) => {
              const raw = items[0]?.label;
              return Array.isArray(raw) ? raw.join(' ') : (raw ?? '');
            },
            label: (item: any) => {
              const val = typeof item.raw === 'number' ? (Number.isInteger(item.raw) ? item.raw : item.raw.toFixed(2)) : item.raw;
              return ` ${item.dataset.label}: ${val}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ...(stepSize ? { ticks: { stepSize, color: th.text, font: { size: 11 } } } : { ticks: { color: th.text, font: { size: 11 } } }),
          grid: { color: th.grid },
          border: { display: false },
        },
        x: {
          ticks: { color: th.text, font: { size: 11 }, maxRotation: 0 },
          grid: { display: false },
          border: { display: false },
        },
      },
    };
  }

  function renderCharts(nsr: any) {
    const pairsKeys = Object.keys(nsr).sort();
    const nVals = pairsKeys.map(p => nsr[p].total_n);
    const sVals = pairsKeys.map(p => nsr[p].total_s);
    const palette = ['#6366f1','#22c55e','#ef4444','#f97316','#a855f7','#3b82f6','#78716c','#64748b'];
    const th = getChartTheme();

    if (chartNRef.current) {
      chartNInst.current?.destroy();
      chartNInst.current = new Chart(chartNRef.current, {
        type: 'bar',
        data: { labels: pairsKeys, datasets: [barDataset(t('swot.n_label'), nVals, pairsKeys.map((_, i) => palette[i % palette.length]))] },
        options: barOptions(th, 1),
      });
    }
    if (chartSRef.current) {
      chartSInst.current?.destroy();
      chartSInst.current = new Chart(chartSRef.current, {
        type: 'radar',
        data: { labels: pairsKeys, datasets: [{ label: t('swot.s_label'), data: sVals, backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366f1', borderWidth: 2, pointBackgroundColor: '#6366f1', pointRadius: 4 }] },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item: any) => {
                  const val = typeof item.raw === 'number' ? (Number.isInteger(item.raw) ? item.raw : item.raw.toFixed(2)) : item.raw;
                  return ` ${item.dataset.label}: ${val}`;
                },
              },
            },
          },
          scales: {
            r: {
              beginAtZero: true,
              ticks: { color: th.text, backdropColor: 'transparent', font: { size: 10 } },
              grid: { color: th.grid },
              angleLines: { color: th.grid },
              pointLabels: { color: th.text, font: { size: 11 } },
            },
          },
        },
      });
    }
  }

  function renderStrategyCharts(strategy: any[]) {
    const th = getChartTheme();
    const palette = ['#ef4444', '#f97316', '#22c55e', '#a855f7'];
    const labels = strategy.map((s: any) => [t('swot.strategy.' + s.name) || s.name, t('swot.strategy_word')]);
    const nVals  = strategy.map((s: any) => s.total_n);
    const sVals  = strategy.map((s: any) => Number(s.total_s));

    if (chartStratNRef.current) {
      chartStratNInst.current?.destroy();
      chartStratNInst.current = new Chart(chartStratNRef.current, {
        type: 'bar',
        data: { labels, datasets: [barDataset(t('swot.col_n_full'), nVals, palette)] },
        options: barOptions(th, 1),
      });
    }
    if (chartStratSRef.current) {
      chartStratSInst.current?.destroy();
      chartStratSInst.current = new Chart(chartStratSRef.current, {
        type: 'bar',
        data: { labels, datasets: [barDataset(t('swot.col_s_full'), sVals, palette)] },
        options: barOptions(th),
      });
    }
  }

  const currentPair = pairs[pairIndex] || '';
  const fmap = lastResult ? buildFactorMap(lastResult, questions) : {};
  const pParts = currentPair.split('/');
  const rg = pParts[0] || '';
  const cg = pParts[1] || '';
  const rowCodes = [1,2,3,4,5].map(i => `${rg}${i}`);
  const colCodes = [1,2,3,4,5].map(i => `${cg}${i}`);
  const currentGrid = grids[currentPair] || Array(5).fill(null).map(() => Array(5).fill(0));

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>

      {section === 'list' && (
        <section id="listSection">
          <h1 id="swotPageTitle">{t('swot.page_title')}</h1>
          <p id="swotPageDesc" style={{ color: 'var(--text-secondary)' }}>{t('swot.page_desc')}</p>
          <div style={{ display: 'flex', gap: 10, margin: '20px 0', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" id="newSwotBtn" disabled={busy} onClick={() => createAnalysis('swot')}>{t('swot.new_swot')}</button>
            <button className="btn btn-primary" id="newTowsBtn" disabled={busy} onClick={() => createAnalysis('tows')}>{t('swot.new_tows')}</button>
            <button className="btn btn-secondary" id="newSwotTowsBtn" disabled={busy} onClick={() => createAnalysis('swot-tows')}>{t('swot.new_swottows')}</button>
          </div>
          <div className="analysis-list-grid" id="cardsGrid">
            {loadingList && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
            {!loadingList && list.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>{t('common.no_analyses')}</p>}
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle analysisId={a.id} displayTitle={getDisplayTitle(a.type, a.title)} onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {TYPE_LABELS[a.type]} · {a.status === 'completed' ? t('status.completed') : t('status.in_progress')} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                {a.snapshot_industry && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                    {INDUSTRY_KEY[a.snapshot_industry] ? t(INDUSTRY_KEY[a.snapshot_industry]) : a.snapshot_industry}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" data-open={a.id} onClick={() => openAnalysis(a.id)}>{t('common.open')}</button>
                  <button className="btn btn-danger" data-del={a.id} onClick={async () => {
                    if (!confirm(t('common.confirm_delete'))) return;
                    try {
                      await Api.deleteSwot(a.id);
                      if (loadDraft()?.analysisId === a.id) clearDraft();
                      showToast(t('common.analysis_deleted'));
                      loadList();
                    } catch (e: any) { showToast(t('swot.delete_error'), 'error'); }
                  }}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'questionnaire' && questions && (() => {
        const GROUPS = ['S','W','O','T'] as const;
        const currentGroup = GROUPS[questPage];
        const groupCriteria = (questions.criteria || []).filter((c: any) => c.code[0] === currentGroup);
        const isFirst = questPage === 0;
        const isLast = questPage === 3;
        const unansweredOnPage = groupCriteria.filter((c: any) => answers[c.code] === undefined);

        function handleNextPage() {
          if (unansweredOnPage.length > 0) {
            showToast(t('swot.answer_required') + ' ' + unansweredOnPage.map((c: any) => c.code).join(', ') + ')', 'error');
            return;
          }
          setQuestPage(p => p + 1);
        }

        return (
          <section id="questionnaireSection">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button className="btn btn-secondary" id="backToListFromQ" disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try { await flushAnswers(); setSection('list'); loadList(); } finally { setBusy(false); }
                }}>
                {t('common.back_list')}
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
                {questPage + 1} / 4 — {t(`swot.group.${currentGroup}`)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0 }}>{t('swot.step1_title')}</h2>
              <button className="btn btn-secondary" id="toManualWeightsBtn" disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    if (answersSaveTimer.current) { clearTimeout(answersSaveTimer.current); answersSaveTimer.current = null; }
                    const result = await flushAnswers() ?? lastResult;
                    setWeights(manualPrefillWeights(result));
                    setSection('manual');
                  } finally { setBusy(false); }
                }}>
                {t('swot.manual_entry_btn')}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }} id="questionnaireSubtitle">
              {t('swot.industry_prefix')} {localName(questions.activity_name)} {t('swot.questions_info')}
            </p>
            <GuidePanel id="guideSwot1" titleKey="guide.swot.step1.title" descKey="guide.swot.step1.desc" rulesKeys={['guide.swot.step1.r1','guide.swot.step1.r2','guide.swot.step1.r3','guide.swot.step1.r4']} />

            <h3 style={{ color: 'var(--accent)', margin: '20px 0 12px' }}>{t(`swot.group.${currentGroup}`)}</h3>

            <div id="questionnaireCards" className="questionnaire-grid" style={{ marginTop: 0 }}>
              {groupCriteria.map((c: any) => {
                const scale = questions.scales[c.scale] || questions.scales['_S'];
                const qtext = c.questions?.[0] ? (c.questions[0][lang] || c.questions[0]['en']) : '';
                return (
                  <div key={c.code} className="question-card" data-code={c.code}>
                    <div className="question-code">{c.code} — {localName(c.name)}</div>
                    <div className="question-text">{qtext}</div>
                    <div className="likert-row">
                      {(scale || []).map((opt: any, idx: number) => {
                        const val = idx + 1;
                        const selected = answers[c.code] === val;
                        return (
                          <button key={val}
                            className={`likert-btn${selected ? ' selected' : ''}`}
                            data-code={c.code} data-val={val}
                            onClick={() => setAnswers(prev => ({ ...prev, [c.code]: val }))}>
                            {val}<br /><span style={{ fontSize: 11 }}>{opt[lang] || opt['en']}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, gap: 10 }}>
              <div>
                {!isFirst && (
                  <button className="btn btn-secondary" id="prevPageBtn"
                    onClick={() => setQuestPage(p => p - 1)}>
                    {t('swot.q_prev')}
                  </button>
                )}
              </div>
              <div>
                {isLast ? (
                  <button className="btn btn-primary" id="submitAnswersBtn" disabled={busy}
                    onClick={handleSubmitAnswers}>{t('swot.submit_answers')}</button>
                ) : (
                  <button className="btn btn-primary" id="nextPageBtn"
                    onClick={handleNextPage}>{t('swot.q_next')}</button>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      {section === 'manual' && (() => {
        return (
          <section id="manualWeightsSection">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button className="btn btn-secondary" id="backToListFromManual" disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try { await flushWeights(); setSection('list'); loadList(); } finally { setBusy(false); }
                }}>
                {t('common.back_list')}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0 }}>{t('swot.manual_step1_title')}</h2>
              <button className="btn btn-secondary" id="toQuestionnaireBtn" disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    if (weightsSaveTimer.current) { clearTimeout(weightsSaveTimer.current); weightsSaveTimer.current = null; }
                    const result = await flushWeights() ?? lastResult;
                    await openQuestionnaire(false, result?.user_answers || {});
                  } finally { setBusy(false); }
                }}>
                {t('swot.to_questionnaire_btn')}
              </button>
            </div>
            <GuidePanel id="guideSwotManual" titleKey="guide.swot.manual.title" descKey="guide.swot.manual.desc" rulesKeys={['guide.swot.manual.r1','guide.swot.manual.r2','guide.swot.manual.r3']} />

            {WEIGHT_GROUPS.map(g => {
              const sum = weightGroupSum(g);
              const ok = weightGroupOk(g);
              return (
                <div key={g} className="card" style={{ marginTop: 16, padding: '20px 24px' }} data-group={g}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{t(`swot.group.${g}`)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: ok ? 'var(--success)' : 'var(--warning)', fontSize: 13, fontWeight: 600 }}>
                        {t('swot.weights_sum')} {sum.toFixed(2)} / 1.00
                      </span>
                      <button className="btn btn-secondary" id={`normalizeBtn${g}`} style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleNormalizeGroup(g)}>
                        {t('swot.normalize')}
                      </button>
                    </div>
                  </div>
                  {[1, 2, 3, 4, 5].map(i => {
                    const code = `${g}${i}`;
                    return (
                      <div key={code} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }} data-code={code}>
                        <div style={{ flex: '0 0 48px', fontWeight: 600 }}>{code}</div>
                        <input
                          className="input" type="number" step={0.01} min={0} max={1}
                          value={weights[code] ?? ''}
                          onChange={e => handleWeightInput(code, e.target.value)}
                          style={{ flex: 1 }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" id="saveWeightsBtn" disabled={busy} onClick={handleSaveWeights}>
                {t('swot.q_next')}
              </button>
            </div>
          </section>
        );
      })()}

      {section === 'matrix' && currentPair && (
        <section id="matrixSection">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" id="backToListFromMatrix" disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try { await flushMatrix(); setSection('list'); loadList(); } finally { setBusy(false); }
                }}>
                {t('common.back_list')}
              </button>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
              {pairIndex + 1} / {pairs.length} — {currentPair}
            </span>
          </div>
          <h2 style={{ marginTop: 20, marginBottom: 2 }}>{t('swot.step2_title')}</h2>
          <GuidePanel id="guideSwot2" titleKey="guide.swot.step2.title" descKey="guide.swot.step2.desc" rulesKeys={['guide.swot.step2.r1','guide.swot.step2.r2','guide.swot.step2.r3']} />
          <div className="card" style={{ marginTop: 12 }}>
            <h3 id="matrixPairTitle" style={{ margin: '0 0 10px 0', textAlign: 'center' }}>
              {t(`swot.group.${rg}`)} / {t(`swot.group.${cg}`)}
            </h3>
            <div className="matrix-wrap">
              <table className="matrix-table" id="matrixTable">
                <thead>
                  {(() => { const pq = PAIR_QUESTIONS[currentPair]; return pq ? (
                    <tr>
                      <td colSpan={colCodes.length + 1} style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 13, padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        {pq[lang as 'en'|'pl'|'ru'] || pq.en}
                      </td>
                    </tr>
                  ) : null; })()}
                  <tr>
                    <th className="matrix-corner">{currentPair}</th>
                    {colCodes.map(cc => (
                      <th key={cc}>{cc}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowCodes.map((rc, ri) => (
                    <tr key={rc}>
                      <td className="row-label">{rc}</td>
                      {colCodes.map((cc, ci) => {
                        const marked = currentGrid[ri]?.[ci] === 1;
                        return (
                          <td key={cc}
                            className={`cell-toggle${marked ? ' marked' : ''}`}
                            data-ri={ri} data-ci={ci}
                            onClick={() => toggleCell(currentPair, ri, ci)}>
                            {marked ? '✓' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="criteria-panel">
              <button className="criteria-toggle" id="criteriaToggleBtn"
                onClick={() => setCriteriaOpen(o => { const n = !o; try { localStorage.setItem('swot_criteria_open', n ? '1' : '0'); } catch {} return n; })}>
                {criteriaOpen ? '▼' : '▶'} {t('swot.criteria_desc')}
              </button>
              <div className={`criteria-content${criteriaOpen ? ' open' : ''}`} id="criteriaContent">
                <div className="criteria-list">
                  {[rg, cg].map(g => (
                    <div key={g}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--accent)' }}>
                        {t(`swot.group.${g}`)}
                      </div>
                      {[1,2,3,4,5].map(i => {
                        const code = `${g}${i}`;
                        return (
                          <div key={code} className="criteria-item">
                            <b>{code}</b>: {fmap[code] || '—'}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {questions?.criteria && (
                  <>
                    <hr style={{ margin: '10px 0', borderColor: 'var(--border)' }} />
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {[rg, cg].map(g =>
                        (questions.criteria as any[])
                          .filter((c: any) => c.code[0] === g)
                          .map((c: any) => {
                            const qtext = c.questions?.[0] ? (c.questions[0][lang] || c.questions[0]['en']) : '';
                            return (
                              <div key={c.code} style={{ marginBottom: 4 }}>
                                <b>{c.code}</b>: {qtext}
                              </div>
                            );
                          })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="pair-nav">
            {pairIndex === 0 ? (
              <button className="btn btn-secondary" id="backFromMatrix" disabled={busy} onClick={handleBackToStep1}>
                {lastResult?.mode === 'manual' ? t('swot.back_manual') : t('swot.back_questionnaire')}
              </button>
            ) : (
              <button className="btn btn-secondary" id="prevPairBtn"
                onClick={async () => {
                  if (busy || pairIndex === 0) return;
                  setBusy(true);
                  try { await flushMatrix(); setPairIndex(i => i - 1); } finally { setBusy(false); }
                }}
                disabled={busy}>← {t('swot.prev_pair')}</button>
            )}
            <button className="btn btn-primary" id="nextPairBtn" disabled={busy} onClick={savePairAndAdvance}>
              {pairIndex < pairs.length - 1 ? t('swot.next_pair') : t('swot.complete_btn')}
            </button>
          </div>
        </section>
      )}

      {section === 'results' && lastResult && (
        <section id="resultsSection">
          <button className="btn btn-secondary" id="backFromResults"
            onClick={() => { setSection('list'); loadList(); }}>{t('common.back_list')}</button>
          <h2 style={{ marginTop: 20, marginBottom: 2, fontSize: 20, textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--text-primary)' }} id="resultsTitle">
            {t('swot.results_prefix')}{TYPE_LABELS[lastResult.type]}
          </h2>
          {(lastResult.snapshot_industry || questions?.activity_name) && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 8 }}>
              {t('swot.industry_prefix')}{' '}
              {lastResult.snapshot_industry
                ? (INDUSTRY_KEY[lastResult.snapshot_industry] ? t(INDUSTRY_KEY[lastResult.snapshot_industry]) : lastResult.snapshot_industry)
                : localName(questions.activity_name)}
            </p>
          )}
          <GuidePanel id="guideSwot3" titleKey="guide.swot.step3.title" descKey="guide.swot.step3.desc" rulesKeys={['guide.swot.step3.r1','guide.swot.step3.r2','guide.swot.step3.r3']} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('swot.sec.criteria')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
          </div>

          <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('swot.criteria_title')}</h3>
            <div className="swot-criteria-flex" style={{ alignItems: 'flex-start' }}>

              {(() => {
                const sF: any[] = lastResult.s_factors || [];
                const wF: any[] = lastResult.w_factors || [];
                const oF: any[] = lastResult.o_factors || [];
                const tF: any[] = lastResult.t_factors || [];
                const maxSW = Math.max(sF.length, wF.length, 1);
                const maxOT = Math.max(oF.length, tF.length, 1);
                const gn = (g: string) => t('swot.group.' + g).replace(/\s*\([^)]*\)/, '').trim();

                const thBase: React.CSSProperties = {
                  padding: '7px 8px', border: '1px solid var(--border)',
                  fontWeight: 700, textAlign: 'center', fontSize: 12,
                  whiteSpace: 'normal', lineHeight: 1.35,
                };
                const tdBase: React.CSSProperties = {
                  padding: '5px 10px', border: '1px solid var(--border)',
                  textAlign: 'center', fontSize: 12,
                };

                return (
                  <div className="swot-criteria-left" style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '25%' }} /><col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} /><col style={{ width: '25%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ ...thBase, background: 'rgba(76,175,80,0.15)', color: '#4caf50' }}>{gn('S')}</th>
                          <th style={{ ...thBase, background: 'rgba(76,175,80,0.08)', color: '#4caf50' }}>{t('swot.waga')}</th>
                          <th style={{ ...thBase, background: 'rgba(244,67,54,0.15)', color: '#f44336' }}>{gn('W')}</th>
                          <th style={{ ...thBase, background: 'rgba(244,67,54,0.08)', color: '#f44336' }}>{t('swot.waga')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxSW }).map((_, i) => (
                          <tr key={i}>
                            <td style={{ ...tdBase, fontWeight: 600 }}>{sF[i]?.code || ''}</td>
                            <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{sF[i] ? sF[i].weight.toFixed(2) : ''}</td>
                            <td style={{ ...tdBase, fontWeight: 600 }}>{wF[i]?.code || ''}</td>
                            <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{wF[i] ? wF[i].weight.toFixed(2) : ''}</td>
                          </tr>
                        ))}
                        <tr>
                          <th style={{ ...thBase, background: 'rgba(33,150,243,0.15)', color: '#2196f3' }}>{gn('O')}</th>
                          <th style={{ ...thBase, background: 'rgba(33,150,243,0.08)', color: '#2196f3' }}>{t('swot.waga')}</th>
                          <th style={{ ...thBase, background: 'rgba(255,152,0,0.15)', color: '#ff9800' }}>{gn('T')}</th>
                          <th style={{ ...thBase, background: 'rgba(255,152,0,0.08)', color: '#ff9800' }}>{t('swot.waga')}</th>
                        </tr>
                        {Array.from({ length: maxOT }).map((_, i) => (
                          <tr key={i}>
                            <td style={{ ...tdBase, fontWeight: 600 }}>{oF[i]?.code || ''}</td>
                            <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{oF[i] ? oF[i].weight.toFixed(2) : ''}</td>
                            <td style={{ ...tdBase, fontWeight: 600 }}>{tF[i]?.code || ''}</td>
                            <td style={{ ...tdBase, color: 'var(--text-secondary)' }}>{tF[i] ? tF[i].weight.toFixed(2) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

              <div className="swot-criteria-right" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
                  {([
                    { code: 'S', color: '#4caf50' },
                    { code: 'W', color: '#f44336' },
                    { code: 'O', color: '#2196f3' },
                    { code: 'T', color: '#ff9800' },
                  ] as { code: string; color: string }[]).map((g, idx, arr) => (
                    <button key={g.code}
                      onClick={() => setSelectedCriteriaGroup(g.code)}
                      style={{
                        padding: '5px 18px', fontSize: 12, cursor: 'pointer', fontWeight: 700,
                        border: 'none',
                        borderRight: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                        background: selectedCriteriaGroup === g.code ? g.color : 'var(--surface)',
                        color: selectedCriteriaGroup === g.code ? '#fff' : 'var(--text-secondary)',
                        transition: 'background 0.15s, color 0.15s',
                      }}>
                      {g.code}
                    </button>
                  ))}
                </div>

                {(() => {
                  const keyMap: Record<string, string> = { S: 's_factors', W: 'w_factors', O: 'o_factors', T: 't_factors' };
                  const colorMap: Record<string, string> = { S: '#4caf50', W: '#f44336', O: '#2196f3', T: '#ff9800' };
                  const factors: any[] = lastResult[keyMap[selectedCriteriaGroup]] || [];
                  const activeColor = colorMap[selectedCriteriaGroup];
                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        {t(`swot.group.${selectedCriteriaGroup}`)}
                      </div>
                      {factors.map((f: any, idx: number) => (
                        <div key={f.code} style={{
                          display: 'flex', alignItems: 'baseline', gap: 8,
                          padding: '5px 0',
                          borderBottom: idx < factors.length - 1 ? '1px solid var(--border)' : 'none',
                          fontSize: 13,
                        }}>
                          <span style={{
                            fontWeight: 700, fontSize: 11, minWidth: 28,
                            color: activeColor,
                          }}>{f.code}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{fmap[f.code] || f.name || f.code}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('swot.sec.matrix')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
          </div>

          {lastResult.nsr && Object.keys(lastResult.nsr).length > 0 && (() => {
            const nsrPairs = Object.keys(lastResult.nsr).sort();
            const activePair = (selectedResultPair && lastResult.nsr[selectedResultPair])
              ? selectedResultPair : nsrPairs[0];
            const p = lastResult.nsr[activePair];
            const grid: number[][] = lastResult.criteria?.[activePair] || [];
            const [rg, cg] = activePair.split('/');

            const wMap: Record<string, number> = {};
            (['s_factors','w_factors','o_factors','t_factors'] as const).forEach(key => {
              (lastResult[key] || []).forEach((f: any) => { wMap[f.code] = f.weight; });
            });

            const rowItems: any[] = p.rows || [];
            const colItems: any[] = p.cols || [];
            const rowMap: Record<string, any> = {};
            rowItems.forEach((r: any) => { rowMap[r.code] = r; });
            const colMap: Record<string, any> = {};
            colItems.forEach((c: any) => { colMap[c.code] = c; });
            const rowCodes = rowItems.map((r: any) => r.code);
            const colCodes = colItems.map((c: any) => c.code);

            function rankColor(r: number) {
              if (!r) return undefined;
              if (r === 1) return '#4caf50';
              if (r === 2) return '#8bc34a';
              if (r === 3) return '#ff9800';
              if (r === 4) return '#ef6c00';
              return '#f44336';
            }

            const groupName = (g: string) => t('swot.group.' + g).replace(/\s*\([^)]*\)/, '').trim();
            const prefix = ['S/O','S/T','W/O','W/T'].includes(activePair) ? 'SWOT' : 'TOWS';
            const pairTitle = `${prefix} ⇒ ${groupName(rg)} / ${groupName(cg)}`;
            const pairQ = PAIR_QUESTIONS[activePair];
            const pairQuestion = pairQ ? (pairQ[lang as 'en'|'pl'|'ru'] || pairQ.en) : '';

            const interactions: string[] = [];
            rowCodes.forEach((rc: string, ri: number) => {
              colCodes.forEach((cc: string, ci: number) => {
                if ((grid[ri]?.[ci] ?? 0) === 1) {
                  interactions.push(`${rc}/${cc} — ${fmap[rc] || rc} / ${fmap[cc] || cc}`);
                }
              });
            });

            const th: React.CSSProperties = { padding: '5px 8px', border: '1px solid var(--border)', background: 'var(--th-bg)', fontWeight: 600, textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 'normal' };
            const td: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', textAlign: 'center', fontSize: 12 };
            const tdL: React.CSSProperties = { ...th };
            const tdE: React.CSSProperties = { padding: '4px 8px', border: 'none', textAlign: 'center', fontSize: 12 };

            return (
              <div style={{ marginTop: 20 }} id="nsrSection">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'nowrap' }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('swot.select_pair')}:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select className="input" value={activePair}
                      onChange={e => setSelectedResultPair(e.target.value)}
                      style={{ padding: '4px 10px', fontSize: 13 }}>
                      {nsrPairs.map(pair => {
                        const [prg, pcg] = pair.split('/');
                        const gn = (g: string) => t('swot.group.' + g).replace(/\s*\([^)]*\)/, '').trim();
                        return (
                          <option key={pair} value={pair}>
                            {gn(prg)} / {gn(pcg)} ({pair})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="card" style={{ overflowX: 'auto', padding: 16 }}>
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{pairTitle}</div>
                    {pairQuestion && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{pairQuestion}</div>}
                  </div>

                  <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />
                      {colCodes.map((cc: string) => <col key={cc} style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />)}
                      <col style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />
                      <col style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />
                      <col style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />
                      <col style={{ width: `${Math.round(100 / (colCodes.length + 5))}%` }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={th}>{activePair}</th>
                        {colCodes.map((cc: string) => (
                          <th key={cc} style={th}>{cc}</th>
                        ))}
                        <th style={{ ...th, color: 'var(--text-secondary)' }}>{t('swot.waga')}</th>
                        <th style={th}>N</th>
                        <th style={th}>S</th>
                        <th style={th}>R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowCodes.map((rc: string, ri: number) => {
                        const row = rowMap[rc] || {};
                        return (
                          <tr key={rc}>
                            <td style={tdL}>{rc}</td>
                            {colCodes.map((cc: string, ci: number) => {
                              const val = grid[ri]?.[ci] ?? 0;
                              return (
                                <td key={cc} style={{ ...td, background: val ? 'rgba(59,130,246,0.18)' : undefined, fontWeight: val ? 700 : undefined, color: val ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                  {val || '0'}
                                </td>
                              );
                            })}
                            <td style={{ ...td, color: 'var(--text-secondary)' }}>{(wMap[rc] || 0).toFixed(2)}</td>
                            <td style={td}>{row.n ?? 0}</td>
                            <td style={td}>{+Number(row.s ?? 0).toFixed(2)}</td>
                            <td style={{ ...td, fontWeight: 700, color: rankColor(row.r) }}>{row.r || ''}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={{ ...tdL, color: 'var(--text-secondary)', fontWeight: 700 }}>{t('swot.waga')}</td>
                        {colCodes.map((cc: string) => <td key={cc} style={{ ...td, color: 'var(--text-secondary)' }}>{(wMap[cc] || 0).toFixed(2)}</td>)}
                        <td colSpan={4} style={tdE}></td>
                      </tr>
                      <tr>
                        <td style={{ ...tdL, fontWeight: 700 }}>N</td>
                        {colCodes.map((cc: string) => <td key={cc} style={td}>{colMap[cc]?.n ?? 0}</td>)}
                        <td style={tdE}></td>
                        <td style={{ ...td, fontWeight: 700 }}>{p.total_n}</td>
                        <td colSpan={2} style={tdE}></td>
                      </tr>
                      <tr>
                        <td style={{ ...tdL, fontWeight: 700 }}>S</td>
                        {colCodes.map((cc: string) => <td key={cc} style={td}>{+Number(colMap[cc]?.s ?? 0).toFixed(2)}</td>)}
                        <td colSpan={2} style={tdE}></td>
                        <td style={{ ...td, fontWeight: 700 }}>{+Number(p.total_s).toFixed(2)}</td>
                        <td style={tdE}></td>
                      </tr>
                      <tr>
                        <td style={{ ...tdL, fontWeight: 700 }}>R</td>
                        {colCodes.map((cc: string) => (
                          <td key={cc} style={{ ...td, fontWeight: 700, color: rankColor(colMap[cc]?.r) }}>{colMap[cc]?.r || ''}</td>
                        ))}
                        <td colSpan={4} style={tdE}></td>
                      </tr>
                    </tbody>
                  </table>

                  {interactions.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        {t('swot.interactions_title')} ({interactions.length}):
                      </div>
                      {interactions.map((item, i) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '2px 0' }}>• {item}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('swot.sec.stats')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
          </div>

          {lastResult.nsr && Object.keys(lastResult.nsr).length > 0 && (() => {
            const nsrPairs = Object.keys(lastResult.nsr).sort();
            const gn = (g: string) => t('swot.group.' + g).replace(/\s*\([^)]*\)/, '').trim();
            const dominantPair = nsrPairs.reduce((best, p) =>
              (lastResult.nsr[p].total_s > (lastResult.nsr[best]?.total_s ?? 0)) ? p : best, nsrPairs[0]);
            return (
              <>
                <div className="charts-row">
                  <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 380 }}>
                    <h4 style={{ textAlign: 'center', marginBottom: 12 }}>{t('swot.chart_n_title')}</h4>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                      <canvas ref={chartNRef} id="chartN" style={{ width: '100%', maxHeight: 320 }}></canvas>
                    </div>
                  </div>
                  <div className="chart-card">
                    <h4 style={{ textAlign: 'center', marginBottom: 12 }}>{t('swot.chart_s_title')}</h4>
                    <canvas ref={chartSRef} id="chartS" height={280}></canvas>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 20 }}>
                  <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('swot.nsr_table_title')}</h3>
                  <div style={{ overflowX: 'auto' }}>
                  <table className="strategy-table" style={{ marginTop: 0, border: '1px solid var(--border)' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>{t('swot.col_pair')}</th>
                        <th>{t('swot.col_n_full')}</th>
                        <th>{t('swot.col_s_full')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nsrPairs.map((pair) => {
                        const [prg, pcg] = pair.split('/');
                        const p = lastResult.nsr[pair];
                        const isDom = pair === dominantPair;
                        return (
                          <tr key={pair} className={isDom ? 'dominant' : ''}>
                            <td style={{ textAlign: 'left' }}>
                              {isDom && <span style={{ marginRight: 6 }}>★</span>}
                              {gn(prg)} / {gn(pcg)} ({pair})
                            </td>
                            <td style={{ textAlign: 'center' }}>{p.total_n}</td>
                            <td style={{ textAlign: 'center' }}>{+Number(p.total_s).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  {dominantPair && (
                    <p style={{ marginTop: 12, marginBottom: 0, fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>
                      {t('swot.dominant_pair')}&nbsp;
                      {(() => { const [prg, pcg] = dominantPair.split('/'); return `${gn(prg)} / ${gn(pcg)} (${dominantPair})`; })()}
                    </p>
                  )}
                </div>
              </>
            );
          })()}

          {lastResult.type === 'swot-tows' && lastResult.strategy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('swot.sec.strategy')}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
            </div>
          )}

          {lastResult.type === 'swot-tows' && lastResult.strategy && (
            <>
              <div className="charts-row" style={{ marginTop: 20 }}>
                <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
                  <h4 style={{ textAlign: 'center', marginBottom: 12 }}>{t('swot.chart_n_title')}</h4>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <canvas ref={chartStratNRef} id="chartStratN" style={{ width: '100%', maxHeight: 260 }}></canvas>
                  </div>
                </div>
                <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
                  <h4 style={{ textAlign: 'center', marginBottom: 12 }}>{t('swot.chart_s_title')}</h4>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <canvas ref={chartStratSRef} id="chartStratS" style={{ width: '100%', maxHeight: 260 }}></canvas>
                  </div>
                </div>
              </div>

              <div className="card" id="strategyCard" style={{ marginTop: 20 }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('swot.strategy_title')}</h3>
              <div style={{ overflowX: 'auto' }}>
              <table className="strategy-table" id="strategyTable" style={{ border: '1px solid var(--border)' }}>
                <thead>
                  <tr>
                    <th>{t('swot.col_strategy')}</th>
                    <th>{t('swot.col_tables')}</th>
                    <th>N</th>
                    <th>S</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.strategy.map((s: any) => {
                    const isDom = s.name === lastResult.dominant_strategy;
                    return (
                      <tr key={s.name} className={isDom ? 'dominant' : ''}>
                        <td>{t('swot.strategy.' + s.name) || s.name}{isDom ? ' ★' : ''}</td>
                        <td>{s.tables?.join(' + ')}</td>
                        <td>{s.total_n}</td>
                        <td>{s.total_s != null ? +Number(s.total_s).toFixed(2) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {lastResult.dominant_strategy && (
                <p id="dominantText" style={{ marginTop: 12, fontWeight: 600, color: 'var(--accent)' }}>
                  {t('swot.dominant_strategy')} {t('swot.strategy.' + lastResult.dominant_strategy) || lastResult.dominant_strategy}
                </p>
              )}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" id="exportBtn"
              onClick={async () => { try { await Api.exportSwot(analysisId!, lastResult?.title ? fileSlug(lastResult.title, lastResult.created_at) : undefined); } catch { showToast(t('common.export_error'), 'error'); } }}>
              {t('common.export_excel')}
            </button>
            {lastResult.type !== 'swot-tows' && (
              <button className="btn btn-secondary" id="extendBtn"
                onClick={async () => {
                  try {
                    const res = await Api.extendSwot(analysisId!);
                    showToast(t('swot.extended_info') + ' ' + (res.missing_pairs || []).join(', '));
                    await openAnalysis(res.new_analysis_id);
                  } catch (e: any) { showToast(t('common.save_error') + ': ' + (e.message || e), 'error'); }
                }}>{t('swot.extend_btn')}</button>
            )}
            <button className="btn btn-danger" id="deleteBtn"
              onClick={async () => {
                if (!confirm(t('common.confirm_delete'))) return;
                try {
                  await Api.deleteSwot(analysisId!);
                  if (loadDraft()?.analysisId === analysisId) clearDraft();
                  showToast(t('common.analysis_deleted'));
                  setSection('list'); loadList();
                } catch (e: any) { showToast(t('swot.delete_error'), 'error'); }
              }}>{t('common.delete_analysis')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
