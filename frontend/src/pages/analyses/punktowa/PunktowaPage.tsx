import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigationType, useLocation } from 'react-router-dom';
import { Api, fileSlug } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';
import { GuidePanel } from '@/components/GuidePanel';
import { logger, createDevLogger } from '@/utils/logger';
import type { AnalysisOut } from '@/types/api.types';
import { Chart, registerables } from 'chart.js';
import EditableTitle from '@/components/EditableTitle';
import { getDisplayTitle } from '@/utils/analysisTitle';
Chart.register(...registerables);

type Section = 'list' | 'setup' | 'subjects' | 'scores' | 'results';
type Criterion = { id?: string; name: string; weight: number };
type Subject = { id?: string; name: string };

function saveDraft(key: string, data: object) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function loadDraft(key: string): any {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

function translateBackendErrors(detail: any): string {
  if (!Array.isArray(detail)) return t('punk.complete_error');
  return detail.map((e: string) => {
    if (e === 'punktowa_no_criteria') return t('punk.criteria_required');
    if (e.startsWith('weights_sum')) {
      const m = e.match(/[\d.]+$/);
      const sum = m ? parseFloat(m[0]).toFixed(3) : '?';
      return t('punk.weights_must_equal_1').replace('{sum}', sum);
    }
    if (e === 'punktowa_min_2_subjects') return t('punk.min_2_subjects');
    if (e.startsWith('missing_scores')) {
      const n = e.match(/\d+/)?.[0] || '?';
      return t('punk.fill_all_scores') + ` (${n})`;
    }
    if (e.startsWith('scores_out_of_range')) {
      const n = e.match(/\d+/)?.[0] || '?';
      return t('punk.out_of_range_scores').replace('{n}', n);
    }
    return e;
  }).join(' · ');
}

export default function PunktowaPage({ ptype }: { ptype: string }) {
  const { showToast } = useToast();
  const log = createDevLogger('PUNKTOWA', '#4caf50');
  const navType = useNavigationType();
  const location = useLocation();
  const initialLocationKeyRef = useRef(location.key);

  useEffect(() => {
    if (location.key === initialLocationKeyRef.current) return;
    flushCriteria();
    flushSubjects();
    flushScores();
    setSection('list');
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const DRAFT_KEY = `punk_draft_${ptype}`;
  const [section, setSection] = useState<Section>('list');
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scoresMap, setScoresMap] = useState<Record<string, any>>({});
  const [scaleMin, setScaleMin] = useState(1);
  const [scaleMax, setScaleMax] = useState(5);
  const [results, setResults] = useState<any>(null);
  const [visibleSubjectIds, setVisibleSubjectIds] = useState<string[]>([]);
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<Set<string>>(new Set());
  const radarRef = useRef<HTMLCanvasElement>(null);
  const radarChart = useRef<Chart | null>(null);
  const mountedRef = useRef(false);

  const criteriaSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subjectsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoresSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analysisIdRef = useRef(analysisId);
  const sectionRef = useRef(section);
  const criteriaRef = useRef(criteria);
  const subjectsRef = useRef(subjects);
  const scoresMapRef = useRef(scoresMap);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { sectionRef.current = section; }, [section]);
  useEffect(() => { criteriaRef.current = criteria; }, [criteria]);
  useEffect(() => { subjectsRef.current = subjects; }, [subjects]);
  useEffect(() => { scoresMapRef.current = scoresMap; }, [scoresMap]);

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';
  const isOdb = ptype === 'punktowa-odbiorcy';
  const titleKey = isOdb ? 'punk.page_odb_title' : 'punk.page_dos_title';

  function weightSum() {
    return criteria.reduce((acc, c) => acc + (c.weight || 0), 0);
  }
  function weightOk(sum?: number) {
    return Math.abs((sum ?? weightSum()) - 1.0) < 0.005;
  }

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const l = await Api.listPunktowa(ptype);
      setList(l);
      log('list loaded', l.length + ' analyses');
    } catch (e: any) { logger.error('[PUNK] loadList', e); }
    finally { setLoading(false); }
  }, [ptype]);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') {
      try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {}
      return;
    }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft(DRAFT_KEY, { analysisId, section });
  }, [analysisId, section, DRAFT_KEY]);

  useEffect(() => {
    const id = setTimeout(() => {
      const el = document.querySelector('.main-content');
      if (el) el.scrollTop = 0;
    }, 0);
    return () => clearTimeout(id);
  }, [section]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadList();
    if (location.state?.openId) { openAnalysis(location.state.openId); return; }
    const draft = loadDraft(DRAFT_KEY);
    const isPageReload = navType === 'POP' &&
      (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]?.type === 'reload';
    const wasOnList = (() => { try { return sessionStorage.getItem(DRAFT_KEY + '_on_list') === '1'; } catch { return false; } })();
    if (isPageReload && draft?.analysisId && !wasOnList) openAnalysis(draft.analysisId, draft.section);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushCriteria = useCallback(async () => {
    if (criteriaSaveTimer.current) { clearTimeout(criteriaSaveTimer.current); criteriaSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'setup') return;
    const valid = criteriaRef.current.filter(c => c.name.trim() && c.weight > 0);
    if (!valid.length) return;
    try {
      await Api.setPunktowaCriteria(analysisIdRef.current, valid as any);
      log('criteria flushed');
    } catch {}
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'setup') return;
    if (criteriaSaveTimer.current) clearTimeout(criteriaSaveTimer.current);
    criteriaSaveTimer.current = setTimeout(() => { flushCriteria(); }, 800);
    return () => { if (criteriaSaveTimer.current) clearTimeout(criteriaSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria]);

  const flushSubjects = useCallback(async () => {
    if (subjectsSaveTimer.current) { clearTimeout(subjectsSaveTimer.current); subjectsSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'subjects') return;
    const names = subjectsRef.current.map(s => s.name.trim()).filter(Boolean);
    if (names.length < 1) return;
    try {
      await Api.setPunktowaSubjects(analysisIdRef.current, names);
      log('subjects flushed');
    } catch {}
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'subjects') return;
    if (subjectsSaveTimer.current) clearTimeout(subjectsSaveTimer.current);
    subjectsSaveTimer.current = setTimeout(() => { flushSubjects(); }, 800);
    return () => { if (subjectsSaveTimer.current) clearTimeout(subjectsSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  function triggerScaleSave(min: number, max: number) {
    if (scaleSaveTimer.current) clearTimeout(scaleSaveTimer.current);
    scaleSaveTimer.current = setTimeout(async () => {
      if (!analysisId || max <= min) return;
      try {
        await Api.setPunktowaScale(analysisId, { scale_min: min, scale_max: max });
        log('scale auto-saved', min, max);
      } catch {}
    }, 600);
  }

  async function handleScoreBlur(key: string, val: string) {
    const raw = parseFloat(val);
    if (isNaN(raw) || !analysisId) return;
    const score = Math.round(raw * 100) / 100;
    setScoresMap(prev => ({ ...prev, [key]: String(score) }));
    const [criterion_id, subject_id] = key.split('/');
    if (!criterion_id || !subject_id) return;
    try {
      await Api.setPunktowaScores(analysisId, [{ criterion_id, subject_id, score }] as any);
    } catch {}
  }

  const flushScores = useCallback(async () => {
    if (scoresSaveTimer.current) { clearTimeout(scoresSaveTimer.current); scoresSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'scores') return;
    const scores: any[] = [];
    for (const c of criteriaRef.current) {
      for (const s of subjectsRef.current) {
        const val = scoresMapRef.current[`${c.id}/${s.id}`];
        const n = Math.round(parseFloat(val) * 100) / 100;
        if (!isNaN(n)) scores.push({ criterion_id: c.id, subject_id: s.id, score: n });
      }
    }
    if (scores.length) {
      try { await Api.setPunktowaScores(analysisIdRef.current, scores as any); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'scores') return;
    if (scoresSaveTimer.current) clearTimeout(scoresSaveTimer.current);
    scoresSaveTimer.current = setTimeout(() => { flushScores(); }, 800);
    return () => { if (scoresSaveTimer.current) clearTimeout(scoresSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresMap]);

  useEffect(() => {
    return () => { flushCriteria(); flushSubjects(); flushScores(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openAnalysis(id: string, preferSection?: Section) {
    log('open', id, preferSection ?? '');
    try {
      const data = await Api.getPunktowa(id) as any;
      setAnalysisId(id);
      if (data.results && data.results.length) {
        setResults(data);
        clearDraft(DRAFT_KEY);
        setSection('results');
      } else {
        setCriteria(data.criteria || []);
        setSubjects(data.subjects || []);
        setScoresMap(data.scores || {});
        setScaleMin(data.scale_min ?? 1);
        setScaleMax(data.scale_max ?? 5);
        if (preferSection && preferSection !== 'list' && preferSection !== 'results') {
          setSection(preferSection);
        } else {
          setSection('setup');
        }
      }
    } catch (e: any) { logger.error('[PUNK] openAnalysis', e); setSection('list'); }
  }

  async function handleSaveCriteria() {
    const valid = criteria.filter(c => c.name.trim() && c.weight > 0);
    if (valid.length < 2) { showToast(t('punk.criteria_required'), 'error'); return; }
    const sum = valid.reduce((acc, c) => acc + c.weight, 0);
    if (!weightOk(sum)) {
      showToast(
        t('punk.weights_must_equal_1').replace('{sum}', sum.toFixed(2)),
        'error'
      );
      return;
    }
    try {
      const saved = await Api.setPunktowaCriteria(analysisId!, valid as any) as any;
      setCriteria(saved as Criterion[]);
      setSection('subjects');
    } catch (err: any) {
      showToast(t('punk.error_prefix') + ' ' + JSON.stringify(err?.detail), 'error');
      logger.error('[PUNK] saveCriteria', err);
    }
  }

  async function handleNormalize() {
    if (!analysisId) return;
    try {
      await Api.setPunktowaCriteria(analysisId, criteria.filter(c => c.name.trim()) as any);
      const normalized = await Api.normalizePunktowaCriteria(analysisId) as any;
      setCriteria((normalized.criteria || normalized) as Criterion[]);
      showToast(t('punk.weights_normalized'));
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  async function handleSaveSubjects() {
    const names = subjects.map(s => s.name.trim()).filter(Boolean);
    if (names.length < 2) { showToast(t('punk.min_2_subjects'), 'error'); return; }
    try {
      const saved = await Api.setPunktowaSubjects(analysisId!, names) as any;
      setSubjects(saved as Subject[]);
      setSection('scores');
    } catch (err: any) {
      showToast(t('punk.error_prefix') + ' ' + JSON.stringify(err?.detail), 'error');
      logger.error('[PUNK] saveSubjects', err);
    }
  }

  async function handleComplete() {
    if (busy) return;
    for (const c of criteria) {
      for (const s of subjects) {
        const val = scoresMap[`${c.id}/${s.id}`];
        if (val === undefined || val === '') {
          showToast(t('punk.fill_all_scores'), 'error');
          return;
        }
      }
    }
    const outOfRange = criteria.flatMap(c =>
      subjects.filter(s => {
        const v = parseFloat(scoresMap[`${c.id}/${s.id}`]);
        return !isNaN(v) && (v < scaleMin || v > scaleMax);
      })
    );
    if (outOfRange.length > 0) {
      showToast(t('punk.out_of_range_scores').replace('{n}', String(outOfRange.length)), 'error');
      return;
    }
    const scores: any[] = [];
    for (const c of criteria) {
      for (const s of subjects) {
        const val = scoresMap[`${c.id}/${s.id}`];
        scores.push({ criterion_id: c.id, subject_id: s.id, score: parseFloat(val) });
      }
    }
    setBusy(true);
    try {
      await Api.setPunktowaScores(analysisId!, scores as any);
      const res = await Api.completePunktowa(analysisId!) as any;
      setResults(res);
      setList(prev => prev.map(x => x.id === analysisId ? { ...x, status: 'completed' as const } : x));
      clearDraft(DRAFT_KEY);
      setSection('results');
    } catch (err: any) {
      const msg = translateBackendErrors(err?.detail);
      showToast(msg, 'error');
      logger.error('[PUNK] complete', err);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (section === 'results' && results && radarRef.current) renderRadar(results, results.top_subjects);
  }, [section, results]);

  function renderRadar(data: any, subjectIds: string[]) {
    if (radarChart.current) radarChart.current.destroy();
    if (!radarRef.current) return;
    const labelColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary').trim() || '#e0e0e0';
    const colors = ['#6C63FF', '#8CB35C', '#F5A623', '#EF4444', '#4F8EF7', '#EC4899', '#10B981'];
    const labels = (data.criteria || []).map((c: any) => {
      const name: string = c.name;
      if (name.length <= 18) return name;
      const mid = Math.floor(name.length / 2);
      const after = name.indexOf(' ', mid);
      const before = name.lastIndexOf(' ', mid);
      const splitIdx = after !== -1 && (before === -1 || after - mid <= mid - before) ? after : before;
      return splitIdx > 0 ? [name.slice(0, splitIdx), name.slice(splitIdx + 1)] : name;
    });
    const scaleMax = data.scale_max || 5;
    const allSubjects: any[] = data.subjects || [];
    const datasets = (subjectIds || []).map((sid: string) => {
      const globalIdx = allSubjects.findIndex((s: any) => s.id === sid);
      const color = colors[(globalIdx >= 0 ? globalIdx : 0) % colors.length];
      const name = allSubjects[globalIdx]?.name || '?';
      return {
        label: name,
        data: (data.criteria || []).map((c: any) => parseFloat((data.scores || {})[`${c.id}/${sid}`] ?? 0)),
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });
    setVisibleSubjectIds(subjectIds || []);
    setHiddenSubjectIds(new Set());
    radarChart.current = new Chart(radarRef.current, {
      type: 'radar',
      data: { labels, datasets },
      options: {
        responsive: true,
        scales: {
          r: {
            suggestedMin: 0,
            suggestedMax: scaleMax,
            grid: { color: 'rgba(128,128,128,0.2)' },
            angleLines: { color: 'rgba(128,128,128,0.2)' },
            ticks: {
              display: true,
              count: Math.min(scaleMax, 6),
              backdropColor: 'transparent',
              font: { size: 9 },
              color: 'rgba(128,128,128,0.7)',
            },
            pointLabels: {
              font: { size: 9 },
              color: labelColor,
              padding: 8,
            },
          },
        },
        layout: { padding: 30 },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  const wSum = weightSum();
  const wOk = weightOk(wSum);

  function isScoreOutOfRange(val: any): boolean {
    const n = parseFloat(val);
    return !isNaN(n) && (n < scaleMin || n > scaleMax);
  }

  return (
    <>
      {section === 'list' && (
        <section id="listSection">
          <h1 id="punkPageTitle">{t(titleKey)}</h1>
          <p id="punkPageDesc" style={{ color: 'var(--text-secondary)' }}>{t('punk.page_desc')}</p>
          <button className="btn btn-primary" id="newBtn" style={{ margin: '16px 0' }} disabled={busy} onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const a = await Api.createPunktowa(ptype);
              await openAnalysis(a.id, 'setup');
            } catch (e: any) { showToast(t('common.save_error'), 'error'); }
            finally { setBusy(false); }
          }}>
            <span id="punkNewBtn">{t('punk.new_btn')}</span>
          </button>
          <div className="analysis-list-grid" id="cardsGrid">
            {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
            {!loading && list.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>{t('common.no_analyses')}</p>}
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle
                  analysisId={a.id}
                  displayTitle={getDisplayTitle(a.type, a.title)}
                  onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))}
                />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {a.status === 'completed' ? t('status.completed') : t('status.in_progress')} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" data-open={a.id} onClick={() => {
                    const d = loadDraft(DRAFT_KEY);
                    openAnalysis(a.id, d?.analysisId === a.id ? d?.section : undefined);
                  }}>{t('common.open')}</button>
                  <button className="btn btn-secondary" data-delete={a.id} style={{ color: 'var(--danger)' }} onClick={async () => {
                    if (!confirm(t('common.confirm_delete'))) return;
                    try {
                      await Api.deletePunktowa(a.id);
                      if (loadDraft(DRAFT_KEY)?.analysisId === a.id) clearDraft(DRAFT_KEY);
                      showToast(t('common.analysis_deleted'));
                      loadList();
                    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
                  }}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'setup' && (
        <section id="setupSection">
          <button className="btn btn-secondary" id="backFromSetup" onClick={async () => { await flushCriteria(); setSection('list'); loadList(); }}>
            {t('punk.back_list')}
          </button>
          <h1 id="punkStep1Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('punk.step1_title')}</h1>
          <GuidePanel
            id="guidePunk1"
            titleKey="guide.punk.step1.title"
            descKey="guide.punk.step1.desc"
            rulesKeys={['guide.punk.step1.r1', 'guide.punk.step1.r2']}
          />

          <div className="card" style={{ marginTop: 16 }}>
            <div id="criteriaRows">
              {criteria.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 3 }}>
                    {idx === 0 && (
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {t('punk.col_criterion')}
                      </div>
                    )}
                    <input
                      className="input" value={c.name}
                      onChange={e => setCriteria(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && (
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {t('punk.col_weight')}
                      </div>
                    )}
                    <input
                      className="input" type="number" step={0.01} min={0.01} max={1}
                      value={c.weight}
                      onChange={e => setCriteria(prev => prev.map((x, i) => i === idx ? { ...x, weight: parseFloat(e.target.value) || 0 } : x))}
                    />
                  </div>
                  <button className="btn btn-secondary" style={{ marginBottom: 0 }}
                    onClick={() => setCriteria(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                </div>
              ))}
            </div>

            <button
              className="btn btn-secondary" id="addCriterionBtn" style={{ marginTop: 8 }}
              onClick={() => setCriteria(prev => [...prev, { name: '', weight: 0.1 }])}
            >
              {t('punk.add_criterion')}
            </button>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span
                id="weightSumText"
                style={{ color: wOk ? 'var(--success)' : 'var(--warning)' }}
              >
                {t('punk.weights_sum')} {wSum.toFixed(2)} / 1.00
              </span>
              <button className="btn btn-secondary" id="normalizeBtn" onClick={handleNormalize}>
                {t('punk.normalize')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" id="saveCriteriaBtn" onClick={handleSaveCriteria}>
              {t('punk.next')} →
            </button>
          </div>
        </section>
      )}

      {section === 'subjects' && (
        <section id="subjectsSection">
          <button className="btn btn-secondary" id="backToListFromSubj" onClick={async () => { await flushSubjects(); setSection('list'); loadList(); }}>
            {t('punk.back_list')}
          </button>
          <h1 id="punkStep2Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('punk.step2_title')}</h1>
          <GuidePanel
            id="guidePunk2"
            titleKey={isOdb ? 'guide.punk.step2.title.odb' : 'guide.punk.step2.title.dos'}
            descKey={isOdb ? 'guide.punk.step2.desc.odb' : 'guide.punk.step2.desc.dos'}
            rulesKeys={['guide.punk.step2.r1']}
          />

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--text-primary)' }}>
              {t(isOdb ? 'punk.list_odb_title' : 'punk.list_dos_title')}
            </div>
            <div id="subjectRows">
              {subjects.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="input" placeholder={t('punk.subject_ph')} value={s.name}
                    onChange={e => setSubjects(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  />
                  <button className="btn btn-secondary" onClick={() => setSubjects(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary" id="addSubjectBtn" style={{ marginTop: 8 }}
              onClick={() => setSubjects(prev => [...prev, { name: '' }])}
            >
              {t('punk.add_subject')}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn btn-secondary" id="backFromSubjects" onClick={async () => { await flushSubjects(); setSection('setup'); }}>
              {t('punk.back_criteria')}
            </button>
            <button className="btn btn-primary" id="saveSubjectsBtn" onClick={handleSaveSubjects}>
              {t('punk.next')} →
            </button>
          </div>
        </section>
      )}

      {section === 'scores' && (
        <section id="scoresSection">
          <button className="btn btn-secondary" id="backToListFromScores" onClick={async () => {
            await flushScores();
            setSection('list'); loadList();
          }}>
            {t('punk.back_list')}
          </button>
          <h1 id="punkStep3Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('punk.step3_title')}</h1>
          <GuidePanel
            id="guidePunk3"
            titleKey="guide.punk.step3.title"
            descKey={isOdb ? 'guide.punk.step3.desc.odb' : 'guide.punk.step3.desc.dos'}
            rulesKeys={['guide.punk.step3.r1', 'guide.punk.step3.r2', 'guide.punk.step3.r3', 'guide.punk.step3.r4']}
          />

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 14 }}>{t('punk.scale_label')}</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>{t('punk.scale_from')}</span>
                <input
                  className="input" type="number" id="scaleMin" value={scaleMin}
                  style={{ width: 70 }} min={0} step={1}
                  onChange={e => {
                    const raw = parseInt(e.target.value);
                    const v = isNaN(raw) ? 0 : Math.max(0, raw);
                    setScaleMin(v);
                    if (v < scaleMax) triggerScaleSave(v, scaleMax);
                  }}
                  onBlur={() => { if (scaleMin >= scaleMax) showToast(t('common.scale_max_error'), 'error'); }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>{t('punk.scale_to')}</span>
                <input
                  className="input" type="number" id="scaleMax" value={scaleMax}
                  style={{ width: 70 }} min={scaleMin + 1} step={1}
                  onChange={e => {
                    const raw = parseInt(e.target.value);
                    if (isNaN(raw)) return;
                    setScaleMax(raw);
                    if (raw > scaleMin) triggerScaleSave(scaleMin, raw);
                  }}
                  onBlur={() => { if (scaleMax <= scaleMin) showToast(t('common.scale_max_error'), 'error'); }}
                />
              </label>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <table id="scoresTable" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', minWidth: 160 }}>{t('punk.col_criterion')}</th>
                  {subjects.map(s => (
                    <th key={s.id} style={{
                      padding: '8px 4px', minWidth: 90, maxWidth: 110,
                      verticalAlign: 'middle', lineHeight: 1.3, textAlign: 'center',
                      whiteSpace: 'normal', wordBreak: 'break-word',
                    }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>
                      {c.name}
                    </td>
                    {subjects.map(s => {
                      const key = `${c.id}/${s.id}`;
                      const val = scoresMap[key] ?? '';
                      const outOfRange = val !== '' && isScoreOutOfRange(val);
                      return (
                        <td key={s.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <input
                            className="input" type="number" step={1} min={scaleMin} max={scaleMax}
                            style={{
                              width: 80,
                              textAlign: 'center',
                              borderColor: outOfRange ? 'var(--danger)' : '',
                              background: outOfRange ? 'rgba(239,68,68,0.08)' : '',
                            }}
                            value={val}
                            onChange={e => setScoresMap(prev => ({ ...prev, [key]: e.target.value }))}
                            onBlur={e => handleScoreBlur(key, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn btn-secondary" id="backFromScores" onClick={async () => {
              await flushScores();
              setSection('subjects');
            }}>
              {t('punk.back_subjects')}
            </button>
            <button className="btn btn-primary" id="completeBtn" disabled={busy} onClick={handleComplete}>
              {t('punk.complete')}
            </button>
          </div>
        </section>
      )}

      {section === 'results' && results && (() => {
        const resCriteria: any[] = results.criteria || [];
        const resSubjects: any[] = results.subjects || [];
        const resScores: Record<string, number> = results.scores || {};
        const resResults: any[] = results.results || [];
        const total = resResults.length;
        const chartColors = ['#6C63FF', '#8CB35C', '#F5A623', '#EF4444', '#4F8EF7', '#EC4899', '#10B981'];
        const resultBySubject: Record<string, any> = {};
        resResults.forEach((r: any) => { resultBySubject[r.subject_id] = r; });

        const cellBorder = '1px solid var(--border)';

        const secDiv = (label: string) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        );

        const thStyle: React.CSSProperties = {
          padding: '8px 10px', textAlign: 'left', border: cellBorder,
          background: 'var(--surface)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700,
        };
        const tdStyle: React.CSSProperties = {
          padding: '6px 10px', border: cellBorder, fontSize: 13,
        };
        const footLabelStyle: React.CSSProperties = {
          padding: '6px 10px', border: cellBorder,
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          background: 'var(--th-bg)', textAlign: 'left', whiteSpace: 'nowrap',
        };
        const footTdBase: React.CSSProperties = {
          padding: '6px 10px', border: cellBorder,
          fontSize: 13, fontWeight: 500, textAlign: 'center',
        };
        return (
          <section id="resultsSection">
            <button className="btn btn-secondary" id="backFromResults" onClick={() => { setSection('list'); loadList(); }}>
              {t('punk.back_list')}
            </button>
            <h2 id="punkResultsTitle" style={{ marginTop: 20, marginBottom: 2, fontSize: 20, textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{t('punk.results_title')}</h2>
            <GuidePanel
              id="guidePunkRes"
              titleKey="guide.punk.res.title"
              descKey="guide.punk.res.desc"
              rulesKeys={['guide.punk.res.r1', 'guide.punk.res.r2']}
            />

            {secDiv(t('punk.sec.criteria'))}
            <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('punk.criteria_table_title')}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 44, textAlign: 'center', background: 'var(--th-bg)', color: 'var(--text-primary)' }}>{t('punk.col_lp')}</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)' }}>{t('punk.col_criterion')}</th>
                      <th style={{ ...thStyle, textAlign: 'center', width: 80, background: 'var(--th-bg)', color: 'var(--text-primary)' }}>{t('punk.col_weight')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resCriteria.map((c: any, i: number) => (
                      <tr key={c.id}>
                        <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{i + 1}</td>
                        <td style={tdStyle}>{c.name}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{+Number(c.weight).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...tdStyle, background: 'rgba(59,130,246,0.18)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' as const }} colSpan={2}>
                        {t('punk.col_weight_total')}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', background: 'rgba(59,130,246,0.18)', fontWeight: 700 }}>
                        {+resCriteria.reduce((s: number, c: any) => s + Number(c.weight), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {secDiv(t('punk.sec.scores'))}
            <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('punk.scores_table_title')}</h3>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: 'var(--accent-soft)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>
                  {t('punk.scale_range')}: {results.scale_min} – {results.scale_max}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 62 }} />
                  {resSubjects.map((_: any, i: number) => <col key={i} style={{ width: 80 }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', verticalAlign: 'middle', background: 'var(--th-bg)', color: 'var(--text-primary)', padding: '8px 4px' }}>{t('punk.col_lp')}</th>
                    <th rowSpan={2} style={{ ...thStyle, verticalAlign: 'middle', background: 'var(--th-bg)', color: 'var(--text-primary)' }}>{t('punk.col_criterion')}</th>
                    <th rowSpan={2} style={{ ...thStyle, textAlign: 'center', verticalAlign: 'middle', background: 'var(--th-bg)', color: 'var(--text-primary)', padding: '8px 4px', fontSize: 11, whiteSpace: 'normal' }}>{t('punk.col_weight')}</th>
                    {resSubjects.map((s: any, i: number) => (
                      <th key={s.id} style={{ ...thStyle, textAlign: 'center', borderBottom: 'none', paddingBottom: 2, background: 'var(--th-bg)' }}>
                        <span style={{ color: chartColors[i % chartColors.length], fontWeight: 700 }}>{i + 1}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {resSubjects.map((s: any, i: number) => (
                      <th key={s.id} style={{ ...thStyle, borderBottom: `3px solid ${chartColors[i % chartColors.length]}`, whiteSpace: 'normal', paddingTop: 2, fontSize: 10, fontWeight: 400, background: 'var(--th-bg)', color: 'var(--text-secondary)', verticalAlign: 'top' }}>
                        <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>{s.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resCriteria.map((c: any, i: number) => (
                    <tr key={c.id}>
                      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{i + 1}</td>
                      <td style={tdStyle}>{c.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{+Number(c.weight).toFixed(2)}</td>
                      {resSubjects.map((s: any, si: number) => (
                        <td key={s.id} style={{ ...tdStyle, textAlign: 'center', borderLeft: `2px solid ${chartColors[si % chartColors.length]}22` }}>
                          {resScores[`${c.id}/${s.id}`] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ border: 'none' }} />
                    <td style={footLabelStyle} colSpan={2}>{t('punk.row_arith')}</td>
                    {resSubjects.map((s: any) => (
                      <td key={s.id} style={footTdBase}>
                        {resultBySubject[s.id] ? +Number(resultBySubject[s.id].avg_arithmetic).toFixed(2) : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ border: 'none' }} />
                    <td style={footLabelStyle} colSpan={2}>{t('punk.row_weighted')}</td>
                    {resSubjects.map((s: any) => (
                      <td key={s.id} style={footTdBase}>
                        {resultBySubject[s.id] ? +Number(resultBySubject[s.id].avg_weighted).toFixed(2) : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ border: 'none' }} />
                    <td style={footLabelStyle} colSpan={2}>{t('punk.row_pct')}</td>
                    {resSubjects.map((s: any) => (
                      <td key={s.id} style={footTdBase}>
                        {resultBySubject[s.id] ? +Number(resultBySubject[s.id].percentage).toFixed(2) + '%' : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ border: 'none' }} />
                    <td style={{ border: 'none' }} />
                    <td style={{ ...footLabelStyle, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('punk.row_rank')}
                    </td>
                    {resSubjects.map((s: any) => {
                      const r = resultBySubject[s.id];
                      const rank = r?.rank ?? null;
                      const rankColor = rank === 1
                        ? '#4caf50'
                        : rank === 2
                          ? '#f59e0b'
                          : rank != null && rank <= Math.ceil(total / 2)
                            ? '#f97316'
                            : '#ef4444';
                      return (
                        <td key={s.id} style={{
                          ...footTdBase, fontWeight: 700,
                          color: rank != null ? rankColor : 'var(--text-primary)',
                        }}>
                          {rank ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>

            {secDiv(t('punk.sec.ranking'))}
            <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('punk.rank_table_title')}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table id="resultsTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[t('punk.col_rank'), t('punk.col_object'), t('punk.col_arith'), t('punk.col_weighted'), t('punk.col_pct')].map((label, i) => (
                        <th key={i} style={{
                          padding: '10px 12px', border: cellBorder,
                          background: 'var(--th-bg)',
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: 'var(--text-primary)',
                          textAlign: i === 0 || i > 1 ? 'center' : 'left',
                          whiteSpace: 'nowrap',
                        }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...resResults].sort((a, b) => a.rank - b.rank).map((r: any) => {
                      const isWinner = r.rank === 1;
                      const rowBg = isWinner ? 'rgba(59,130,246,0.18)' : '';
                      return (
                        <tr key={r.subject_id}>
                          <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', background: rowBg,
                            color: isWinner ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {r.rank}
                          </td>
                          <td style={{ ...tdStyle, background: rowBg, fontWeight: isWinner ? 700 : 400 }}>
                            {isWinner && <span style={{ marginRight: 6 }}>★</span>}{r.subject_name}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', background: rowBg }}>
                            {+Number(r.avg_arithmetic ?? 0).toFixed(2)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', background: rowBg, fontWeight: isWinner ? 600 : 400 }}>
                            {+Number(r.avg_weighted ?? 0).toFixed(2)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', background: rowBg, fontWeight: isWinner ? 600 : 400 }}>
                            {+Number(r.percentage ?? 0).toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {secDiv(t('punk.sec.chart'))}
            <div style={{ marginTop: 16, display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="chart-card" style={{ flex: '55 1 220px', minWidth: 200, maxWidth: 420 }}>
                <canvas id="radarChart" ref={radarRef} />
              </div>
              <div style={{ flex: '35 1 160px', minWidth: 150, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" id="showBestBtn" style={{ fontSize: 12 }}
                    onClick={() => renderRadar(results, results.top_subjects)}>
                    {t('punk.best_only')}
                  </button>
                  <button className="btn btn-secondary" id="showAllBtn" style={{ fontSize: 12 }}
                    onClick={() => renderRadar(results, resSubjects.map((s: any) => s.id))}>
                    {t('punk.show_all')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleSubjectIds.map((sid: string, datasetIdx: number) => {
                    const globalIdx = resSubjects.findIndex((s: any) => s.id === sid);
                    const subj = resSubjects[globalIdx];
                    if (!subj) return null;
                    const r = resultBySubject[sid];
                    const color = chartColors[globalIdx % chartColors.length];
                    const isHidden = hiddenSubjectIds.has(sid);
                    return (
                      <div key={sid}
                        onClick={() => {
                          if (!radarChart.current) return;
                          const nowHidden = !isHidden;
                          radarChart.current.setDatasetVisibility(datasetIdx, !nowHidden);
                          radarChart.current.update();
                          setHiddenSubjectIds(prev => {
                            const next = new Set(prev);
                            nowHidden ? next.add(sid) : next.delete(sid);
                            return next;
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                          cursor: 'pointer', opacity: isHidden ? 0.4 : 1,
                          transition: 'opacity 0.15s' }}>
                        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                          flexShrink: 0, background: isHidden ? 'var(--border)' : color,
                          transition: 'background 0.15s' }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: isHidden ? 'line-through' : 'none' }}>{subj.name}</span>
                        {r && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {+Number(r.percentage).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" id="exportBtn"
                onClick={() => {
                  const item = list.find(a => a.id === analysisId);
                  Api.exportPunktowa(analysisId!, item?.title ? fileSlug(item.title, item.created_at) : undefined);
                }}>
                {t('common.export_excel')}
              </button>
              <button className="btn btn-secondary" id="deleteBtn" style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  if (!confirm(t('punk.confirm_delete'))) return;
                  try {
                    await Api.deletePunktowa(analysisId!);
                    if (loadDraft(DRAFT_KEY)?.analysisId === analysisId) clearDraft(DRAFT_KEY);
                    showToast(t('common.analysis_deleted'));
                    setSection('list'); loadList();
                  } catch (e: any) { showToast(t('common.save_error'), 'error'); }
                }}>
                {t('common.delete_analysis')}
              </button>
            </div>
          </section>
        );
      })()}
    </>
  );
}
