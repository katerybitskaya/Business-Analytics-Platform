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

type Section = 'list' | 'setup' | 'scores' | 'results';
type Criterion = { id?: string; name: string; sort_order: number };
type Session = { scale_min: number; scale_max: number; num_auditors: number; criterion_acceptance_pct: number; system_acceptance_pct: number };

const DRAFT_KEY = 'aud_draft';
function saveDraft(data: object) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {} }
function loadDraft(): any { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

function escHtml(s: string) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const DEFAULT_SESSION: Session = { scale_min: 1, scale_max: 10, num_auditors: 5, criterion_acceptance_pct: 59, system_acceptance_pct: 55 };

function normalizeSession(raw: any): Session {
  const pi = (v: any, fb: number) => { const n = Math.round(parseFloat(String(v ?? fb))); return isNaN(n) ? fb : n; };
  return {
    scale_min: pi(raw?.scale_min, 1),
    scale_max: pi(raw?.scale_max, 10),
    num_auditors: pi(raw?.num_auditors, 5),
    criterion_acceptance_pct: pi(raw?.criterion_acceptance_pct, 59),
    system_acceptance_pct: pi(raw?.system_acceptance_pct, 55),
  };
}

export default function AudytPage() {
  const { showToast } = useToast();
  const log = createDevLogger('AUDYT', '#ff5722');
  const navType = useNavigationType();
  const location = useLocation();
  const initialLocationKeyRef = useRef(location.key);

  useEffect(() => {
    if (location.key === initialLocationKeyRef.current) return;
    flushCriteria();
    flushScores();
    setSection('list');
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const [section, setSection] = useState<Section>('list');
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [session, setSession] = useState<Session>(DEFAULT_SESSION);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [scoresMap, setScoresMap] = useState<Record<string, string>>({});
  const [verdict, setVerdict] = useState<any>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const radarChart = useRef<Chart | null>(null);
  const mountedRef = useRef(false);

  const analysisIdRef = useRef(analysisId);
  const sectionRef = useRef(section);
  const criteriaRef = useRef(criteria);
  const scoresMapRef = useRef(scoresMap);
  const sessionRef = useRef(session);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { sectionRef.current = section; }, [section]);
  useEffect(() => { criteriaRef.current = criteria; }, [criteria]);
  useEffect(() => { scoresMapRef.current = scoresMap; }, [scoresMap]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const l = await Api.listAudyt(); setList(l); log('list loaded', l.length + ' analyses'); }
    catch (e: any) { logger.error('[AUD] loadList', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') { try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {} return; }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft({ analysisId, section });
  }, [analysisId, section]);

  const criteriaSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushCriteria = useCallback(async () => {
    if (criteriaSaveTimer.current) { clearTimeout(criteriaSaveTimer.current); criteriaSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'setup') return;
    const valid = criteriaRef.current.filter(c => c.name.trim());
    if (valid.length < 1) return;
    try {
      await Api.setAudytCriteria(analysisIdRef.current, valid.map((c, i) => ({ name: c.name.trim(), sort_order: i })) as any);
    } catch {}
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'setup') return;
    if (criteriaSaveTimer.current) clearTimeout(criteriaSaveTimer.current);
    criteriaSaveTimer.current = setTimeout(() => { flushCriteria(); }, 800);
    return () => { if (criteriaSaveTimer.current) clearTimeout(criteriaSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria]);

  const scoresSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushScores = useCallback(async () => {
    if (scoresSaveTimer.current) { clearTimeout(scoresSaveTimer.current); scoresSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'scores') return;
    const scores: any[] = [];
    for (const c of criteriaRef.current) {
      for (let i = 1; i <= (sessionRef.current.num_auditors || 5); i++) {
        const val = scoresMapRef.current[`${c.id}_${i}`];
        const n = Math.round(parseFloat(val) * 100) / 100;
        if (!isNaN(n)) scores.push({ criterion_id: c.id!, auditor_number: i, score: n });
      }
    }
    if (scores.length) {
      try { await Api.saveAudytScores(analysisIdRef.current, scores); } catch {}
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
    return () => { flushCriteria(); flushScores(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const t = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0); return () => clearTimeout(t); }, [section]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadList();
    if (location.state?.openId) { openAnalysis(location.state.openId); return; }
    const draft = loadDraft();
    const isPageReload = navType === 'POP' &&
      (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]?.type === 'reload';
    const wasOnList = (() => { try { return sessionStorage.getItem(DRAFT_KEY + '_on_list') === '1'; } catch { return false; } })();
    if (isPageReload && draft?.analysisId && !wasOnList) openAnalysis(draft.analysisId, draft.section);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function openAnalysis(id: string, preferSection?: Section) {
    log('open', id, preferSection ?? '');
    try {
      const data = await Api.getAudyt(id) as any;
      setAnalysisId(id);
      setSession(normalizeSession(data.session || DEFAULT_SESSION));
      setCriteria(data.criteria || []);
      const map: Record<string, string> = {};
      (data.scores || []).forEach((s: any) => { map[`${s.criterion_id}_${s.auditor_number}`] = String(parseFloat(String(s.score))); });
      setScoresMap(map);
      if (data.verdict) {
        setVerdict(data.verdict);
        clearDraft();
        setSection('results');
      } else if (preferSection && preferSection !== 'list' && preferSection !== 'results') {
        setSection(preferSection);
      } else {
        setSection('setup');
      }
    } catch (e: any) { logger.error('[AUD] openAnalysis', e); setSection('list'); }
  }

  async function handleSaveSession(override?: Session) {
    const data = override ?? session;
    try {
      const s = await Api.updateAudytSession(analysisId!, data as any) as any;
      setSession(normalizeSession(s.session || s));
    } catch (e: any) { showToast(e.message || t('common.save_error'), 'error'); logger.error('[AUD] saveSession', e); }
  }

  async function handleToScores() {
    if (busy) return;
    if (criteria.length < 2) { showToast(t('aud.criteria_required'), 'error'); return; }
    if (criteria.some(c => !c.name.trim())) { showToast(t('aud.criteria_name_required'), 'error'); return; }
    setBusy(true);
    try {
      const updated = await Api.setAudytCriteria(
        analysisId!,
        criteria.map((c, i) => ({ name: c.name.trim(), sort_order: i })) as any
      ) as any;
      setCriteria((updated.criteria || updated) as Criterion[]);
      const state = await Api.getAudyt(analysisId!) as any;
      const map: Record<string, string> = {};
      (state.scores || []).forEach((s: any) => {
        map[`${s.criterion_id}_${s.auditor_number}`] = String(parseFloat(String(s.score)));
      });
      setScoresMap(map);
      setSection('scores');
    } catch (e: any) { showToast(e.message || t('common.save_error'), 'error'); logger.error('[AUD] toScores', e); }
    finally { setBusy(false); }
  }

  async function handleSaveScore(key: string, val: string) {
    const raw = parseFloat(val);
    if (isNaN(raw) || !analysisId) return;
    const score = Math.round(raw * 100) / 100;
    setScoresMap(prev => ({ ...prev, [key]: String(score) }));
    const lastUnderscore = key.lastIndexOf('_');
    const criterion_id = key.slice(0, lastUnderscore);
    const auditor_number = parseInt(key.slice(lastUnderscore + 1));
    if (!criterion_id || !auditor_number) return;
    try {
      await Api.saveAudytScores(analysisId!, [{ criterion_id, auditor_number, score }]);
    } catch {}
  }

  async function handleCalculate() {
    for (const c of criteria) {
      for (let i = 1; i <= numAuditors; i++) {
        const sv = scoresMap[`${c.id}_${i}`];
        if (sv === undefined || sv === '' || isNaN(parseFloat(sv))) {
          showToast(t('punk.fill_all_scores'), 'error');
          return;
        }
      }
    }
    let outOfRangeCount = 0;
    for (const c of criteria) {
      for (let i = 1; i <= numAuditors; i++) {
        const n = parseFloat(scoresMap[`${c.id}_${i}`]);
        if (!isNaN(n) && (n < session.scale_min || n > session.scale_max)) outOfRangeCount++;
      }
    }
    if (outOfRangeCount > 0) {
      showToast(t('punk.out_of_range_scores').replace('{n}', String(outOfRangeCount)), 'error');
      return;
    }
    setBusy(true);
    try {
      await flushScores();
      const v = await Api.calculateAudyt(analysisId!) as any;
      setVerdict(v.verdict || v);
      setList(prev => prev.map(x => x.id === analysisId ? { ...x, status: 'completed' as const } : x));
      clearDraft();
      setSection('results');
    } catch (e: any) { showToast(e.message || t('common.calc_error'), 'error'); logger.error('[AUD] calculate', e); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (section === 'results' && verdict && radarRef.current) renderRadar(verdict.criteria_results || []);
  }, [section, verdict]);

  function renderRadar(criteriaResults: any[]) {
    if (radarChart.current) radarChart.current.destroy();
    if (!radarRef.current) return;
    const labelColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-primary').trim() || '#e0e0e0';
    const numAud = session.num_auditors || 5;
    const wrapLabel = (name: string): string[] => {
      if (name.length <= 18) return [name];
      const mid = Math.floor(name.length / 2);
      const after = name.indexOf(' ', mid);
      const before = name.lastIndexOf(' ', mid);
      const splitIdx = after !== -1 && (before === -1 || after - mid <= mid - before) ? after : before;
      return splitIdx > 0 ? [name.slice(0, splitIdx), name.slice(splitIdx + 1)] : [name];
    };
    const labels = criteriaResults.map((r: any) => wrapLabel(r.criterion_name));
    const data = criteriaResults.map((r: any) => {
      const scores = Array.from({ length: numAud }, (_, i) => {
        const v = scoresMap[`${r.criterion_id}_${i + 1}`];
        return v !== undefined && v !== '' ? parseFloat(v) : NaN;
      }).filter(v => !isNaN(v));
      if (scores.length === 0) return 0;
      const avg = scores.reduce((a, b) => a + b, 0) / numAud;
      return session.scale_max > 0 ? Math.round((avg / session.scale_max) * 10000) / 100 : 0;
    });
    radarChart.current = new Chart(radarRef.current, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: t('aud.col_pct'),
          data,
          backgroundColor: 'transparent',
          borderColor: '#6C63FF',
          pointBackgroundColor: '#6C63FF',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#6C63FF',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        }],
      },
      options: {
        responsive: true,
        scales: {
          r: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(128,128,128,0.2)' },
            angleLines: { color: 'rgba(128,128,128,0.2)' },
            ticks: { display: true, stepSize: 20, backdropColor: 'transparent', font: { size: 9 }, color: 'rgba(128,128,128,0.7)' },
            pointLabels: { font: { size: 9 }, color: labelColor, padding: 8 },
          },
        },
        layout: { padding: 20 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.r}%` } },
        },
      },
    });
  }

  const numAuditors = session.num_auditors || 5;

  return (
    <>
      {section === 'list' && (
        <section id="listSection">
          <h1 id="audPageTitle">{t('aud.page_title')}</h1>
          <p id="audPageDesc" style={{ color: 'var(--text-secondary)' }}>{t('aud.page_desc')}</p>
          <button className="btn btn-primary" id="newBtn" style={{ margin: '16px 0' }}
            onClick={async () => {
              try {
                const a = await Api.createAudyt();
                await openAnalysis(a.id, 'setup');
              } catch (err: any) {
                showToast(err.message || t('common.save_error'), 'error');
                logger.error('[AUD] createAudyt', err);
              }
            }}>
            {t('aud.new_audit')}
          </button>
          <div className="analysis-list-grid" id="cardsGrid">
            {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
            {!loading && list.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>{t('aud.no_analyses')}</p>}
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle analysisId={a.id} displayTitle={getDisplayTitle("audyt", a.title)} onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {a.status === 'completed' ? t('status.completed') : t('status.in_progress')} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" data-open={a.id} onClick={() => { const d = loadDraft(); openAnalysis(a.id, d?.analysisId === a.id ? d?.section : undefined); }}>{t('common.open')}</button>
                  <button className="btn btn-secondary" data-delete={a.id} style={{ color: 'var(--danger)' }} onClick={async () => {
                    if (!confirm(t('aud.confirm_delete'))) return;
                    try {
                      await Api.deleteAudyt(a.id);
                      if (loadDraft()?.analysisId === a.id) clearDraft();
                      showToast(t('common.analysis_deleted'));
                      loadList();
                    } catch (err: any) { showToast(err.message || t('common.save_error'), 'error'); }
                  }}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'setup' && (
        <section id="setupSection">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button className="btn btn-secondary" id="backFromSetup" onClick={async () => { await flushCriteria(); setSection('list'); loadList(); }}>
              {t('aud.back_list')}
            </button>
          </div>
          <h1 id="audStep1Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('aud.step1_title')}</h1>
          <GuidePanel id="guidePanel1" titleKey="guide.aud.step1.title" descKey="guide.aud.step1.desc" rulesKeys={['guide.aud.step1.r1', 'guide.aud.step1.r2', 'guide.aud.step1.r3', 'guide.aud.step1.r4']} />

          <div className="card" style={{ marginTop: 16 }}>
            <h3 id="audSectionParams">{t('aud.section_params')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginTop: 12 }}>
              <label>
                <span>{t('aud.num_auditors')}</span>
                <input className="input" type="number" id="numAuditors" value={session.num_auditors} min={2} step={1} style={{ marginTop: 4 }}
                  onChange={e => setSession(prev => ({ ...prev, num_auditors: Math.round(parseInt(e.target.value)) || 2 }))}
                  onBlur={() => {
                    if (session.num_auditors < 2) {
                      const fixed = { ...session, num_auditors: 2 };
                      setSession(fixed);
                      showToast(t('common.auditors_min'), 'error');
                      handleSaveSession(fixed);
                    } else {
                      handleSaveSession();
                    }
                  }} />
              </label>
              <label>
                <span>{t('aud.criterion_pct')}</span>
                <input className="input" type="number" id="criterionPct" value={session.criterion_acceptance_pct} min={1} max={100} step={1} style={{ marginTop: 4 }}
                  onChange={e => setSession(prev => ({ ...prev, criterion_acceptance_pct: Math.round(parseInt(e.target.value)) || 1 }))}
                  onBlur={() => {
                    const clamped = Math.min(100, Math.max(1, session.criterion_acceptance_pct));
                    if (clamped !== session.criterion_acceptance_pct) {
                      const fixed = { ...session, criterion_acceptance_pct: clamped };
                      setSession(fixed);
                      showToast(t('common.pct_clamped'), 'error');
                      handleSaveSession(fixed);
                    } else {
                      handleSaveSession();
                    }
                  }} />
              </label>
              <label>
                <span>{t('aud.system_pct')}</span>
                <input className="input" type="number" id="systemPct" value={session.system_acceptance_pct} min={1} max={100} step={1} style={{ marginTop: 4 }}
                  onChange={e => setSession(prev => ({ ...prev, system_acceptance_pct: Math.round(parseInt(e.target.value)) || 1 }))}
                  onBlur={() => {
                    const clamped = Math.min(100, Math.max(1, session.system_acceptance_pct));
                    if (clamped !== session.system_acceptance_pct) {
                      const fixed = { ...session, system_acceptance_pct: clamped };
                      setSession(fixed);
                      showToast(t('common.pct_clamped'), 'error');
                      handleSaveSession(fixed);
                    } else {
                      handleSaveSession();
                    }
                  }} />
              </label>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--text-primary)' }}>
              {t('aud.section_criteria')}
            </div>
            <div id="criteriaRows">
              {criteria.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="input" style={{ flex: 1 }} value={c.name}
                    placeholder={t('aud.criterion_name_ph')}
                    onChange={e => setCriteria(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                  <button className="btn btn-secondary"
                    onClick={() => setCriteria(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" id="addCriterionBtn" style={{ marginTop: 8 }}
              onClick={() => setCriteria(prev => [...prev, { name: '', sort_order: prev.length }])}>
              {t('aud.add_criterion')}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" id="toCriteriaBtn" disabled={busy} onClick={handleToScores}>
              {t('aud.next_scores')}
            </button>
          </div>
        </section>
      )}

      {section === 'scores' && (
        <section id="scoresSection">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button className="btn btn-secondary" id="backToListFromScores" onClick={async () => { await flushScores(); setSection('list'); loadList(); }}>
              {t('aud.back_list')}
            </button>
          </div>
          <h1 id="audStep2Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('aud.step2_title')}</h1>
          <GuidePanel id="guidePanel2" titleKey="guide.aud.step2.title" descKey="guide.aud.step2.desc" rulesKeys={['guide.aud.step2.r1', 'guide.aud.step2.r2', 'guide.aud.step2.r3', 'guide.aud.step2.r4']} />

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>{t('punk.scale_label')}</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>{t('punk.scale_from')}</span>
                <input className="input" type="number" id="scaleMin" value={session.scale_min} min={0} step={1} style={{ width: 70 }}
                  onChange={e => {
                    const raw = parseInt(e.target.value);
                    const v = isNaN(raw) ? 0 : Math.max(0, raw);
                    setSession(prev => ({ ...prev, scale_min: v }));
                  }}
                  onBlur={() => {
                    if (session.scale_min >= session.scale_max) { showToast(t('common.scale_max_error'), 'error'); return; }
                    handleSaveSession();
                  }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>{t('punk.scale_to')}</span>
                <input className="input" type="number" id="scaleMax" value={session.scale_max} min={session.scale_min + 1} step={1} style={{ width: 70 }}
                  onChange={e => {
                    const raw = parseInt(e.target.value);
                    if (isNaN(raw)) return;
                    setSession(prev => ({ ...prev, scale_max: raw }));
                  }}
                  onBlur={() => {
                    if (session.scale_max <= session.scale_min) { showToast(t('common.scale_max_error'), 'error'); return; }
                    handleSaveSession();
                  }} />
              </label>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <table id="scoresTable" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', minWidth: 160 }}>{t('aud.col_criterion_header')}</th>
                  {Array.from({ length: numAuditors }, (_, i) => (
                    <th key={i} style={{ padding: '8px 4px', minWidth: 90, maxWidth: 110, textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.3 }}>A{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{escHtml(c.name)}</td>
                    {Array.from({ length: numAuditors }, (_, i) => {
                      const key = `${c.id}_${i + 1}`;
                      const val = scoresMap[key] ?? '';
                      const numVal = parseFloat(val);
                      const outOfRange = val !== '' && !isNaN(numVal) && (numVal < session.scale_min || numVal > session.scale_max);
                      return (
                        <td key={i} style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <input className="input" type="number"
                            min={session.scale_min} max={session.scale_max} step={1}
                            style={{ width: 80, textAlign: 'center', borderColor: outOfRange ? 'var(--danger)' : '', background: outOfRange ? 'rgba(239,68,68,0.08)' : '' }}
                            value={val}
                            onChange={e => setScoresMap(prev => ({ ...prev, [key]: e.target.value }))}
                            onBlur={e => handleSaveScore(key, e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn btn-secondary" id="backFromScores" onClick={async () => { await flushScores(); setSection('setup'); }}>
              {t('aud.back_params')}
            </button>
            <button className="btn btn-primary" id="calculateBtn" disabled={busy} onClick={handleCalculate}>
              {t('aud.calculate')}
            </button>
          </div>
        </section>
      )}

      {section === 'results' && verdict && (() => {
        const criteriaResults: any[] = verdict.criteria_results || [];
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
        const tdStyle: React.CSSProperties = { padding: '6px 10px', border: cellBorder, fontSize: 13 };
        const footLabelStyle: React.CSSProperties = {
          padding: '6px 10px', border: cellBorder,
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          background: 'var(--th-bg)', textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
        };
        const numAud = session.num_auditors || 5;
        const redThreshold = session.scale_max * (session.criterion_acceptance_pct / 100);

        const getVisibleScores = (r: any): number[] =>
          Array.from({ length: numAud }, (_, i) => {
            const v = scoresMap[`${r.criterion_id}_${i + 1}`];
            return v !== undefined && v !== '' ? parseFloat(v) : NaN;
          }).filter(v => !isNaN(v));
        const calcSum = (r: any): number | null => {
          const sc = getVisibleScores(r);
          return sc.length > 0 ? sc.reduce((a, b) => a + b, 0) : null;
        };
        const calcAvg = (r: any): number | null => {
          const s = calcSum(r);
          return s !== null ? s / numAud : null;
        };
        const calcPct = (r: any): number | null => {
          const a = calcAvg(r);
          return a !== null ? (a / session.scale_max) * 100 : null;
        };
        const calcAccepted = (r: any): boolean | null => {
          const p = calcPct(r);
          return p !== null ? p >= session.criterion_acceptance_pct : null;
        };

        return (
          <section id="resultsSection">
            <button className="btn btn-secondary" id="backFromResults" onClick={() => { setSection('list'); loadList(); }}>
              {t('common.back_list')}
            </button>
            <h1 id="audStep3Title" style={{ marginTop: 20, marginBottom: 4 }}>{t('aud.step3_title')}</h1>
            <GuidePanel id="guidePanel3" titleKey="guide.aud.step3.title" descKey="guide.aud.step3.desc" rulesKeys={['guide.aud.step3.r1', 'guide.aud.step3.r2']} />

            {secDiv(t('aud.sec_verdict'))}
            <div className="card" id="verdictCard" style={{ marginTop: 16, padding: '24px 28px', borderLeft: `5px solid ${verdict.system_accepted ? 'var(--success)' : 'var(--danger)'}` }}>
              <div id="verdictBadge" style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: verdict.system_accepted ? 'var(--success)' : 'var(--danger)', lineHeight: 1.4 }}>
                {verdict.system_accepted ? t('aud.verdict_accepted_text') : t('aud.verdict_rejected_text')}
              </div>
              <div id="verdictDetail" style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
                {verdict.accepted_count} {t('common.of')} {verdict.total_count} {t('aud.criteria_accepted')} ({+Number(verdict.accepted_pct).toFixed(2)}%)
              </div>
              <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />
              {([
                [t('punk.scale_range'), `${session.scale_min} – ${session.scale_max}`],
                [t('aud.num_auditors'), session.num_auditors],
                [t('aud.criterion_pct'), `${+Number(session.criterion_acceptance_pct).toFixed(2)}%`],
                [t('aud.system_pct'),    `${+Number(session.system_acceptance_pct).toFixed(2)}%`],
              ] as [string, any][]).map(([lbl, val]) => (
                <div key={lbl} style={{ fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{lbl}: </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{val}</span>
                </div>
              ))}
            </div>

            {secDiv(t('aud.sec_scores_table'))}
            <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('aud.scores_table_title')}</h3>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--text-secondary)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {t('punk.scale_range')}: {session.scale_min} – {session.scale_max}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.10)', color: 'var(--text-secondary)', border: '1px solid rgba(34,197,94,0.30)', whiteSpace: 'nowrap' }}>
                  {t('aud.criterion_pct')}: {+Number(session.criterion_acceptance_pct).toFixed(2)}%
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.10)', color: 'var(--text-secondary)', border: '1px solid rgba(99,102,241,0.30)', whiteSpace: 'nowrap' }}>
                  {t('aud.system_pct')}: {+Number(session.system_acceptance_pct).toFixed(2)}%
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 72 }} />
                    <col style={{ width: 34 }} />
                    {criteriaResults.map((_: any, i: number) => <col key={i} style={{ width: 100 }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th colSpan={2} rowSpan={2} style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center', verticalAlign: 'middle', fontSize: 12, padding: '6px 8px', borderBottom: 'none' }}>
                        {t('aud.section_criteria')}
                      </th>
                      {criteriaResults.map((_: any, idx: number) => (
                        <th key={idx} style={{ ...thStyle, background: 'var(--th-bg)', textAlign: 'center', verticalAlign: 'middle', padding: '6px 4px', borderBottom: 'none' }}>
                          <span style={{ color: 'rgba(99,102,241,0.9)', fontWeight: 700, fontSize: 13 }}>{idx + 1}</span>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {criteriaResults.map((r: any, idx: number) => (
                        <th key={idx} style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center', verticalAlign: 'bottom', padding: '4px 2px', borderBottom: `1px solid var(--border)` }}>
                          <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center', fontSize: 10, fontWeight: 500, lineHeight: 1.3, color: 'var(--text-secondary)', padding: '2px' }}>
                            {r.criterion_name}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: numAud }, (_, ai) => {
                      const auditorNum = ai + 1;
                      const isFirst = ai === 0;
                      return (
                        <tr key={`a${auditorNum}`}>
                          {isFirst && (
                            <td rowSpan={numAud} style={{ ...tdStyle, textAlign: 'center', verticalAlign: 'middle', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12, padding: '6px 4px' }}>
                              {t('aud.row_auditor')}
                            </td>
                          )}
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 400, color: 'var(--text-secondary)', padding: '6px 4px', fontSize: 12 }}>
                            {auditorNum}
                          </td>
                          {criteriaResults.map((r: any, ci: number) => {
                            const score = scoresMap[`${r.criterion_id ?? criteria[ci]?.id}_${auditorNum}`];
                            const numScore = parseFloat(score ?? '');
                            const outOfRange = !isNaN(numScore) && (numScore < session.scale_min || numScore > session.scale_max);
                            const belowThreshold = !isNaN(numScore) && numScore <= redThreshold;
                            const isRed = outOfRange || belowThreshold;
                            return (
                              <td key={ci} style={{ ...tdStyle, textAlign: 'center', padding: '6px 4px', background: isRed ? 'rgba(239,68,68,0.13)' : '', color: isRed ? 'var(--danger)' : '', fontWeight: isRed ? 600 : 400 }}>
                                {score !== undefined && score !== '' ? numScore : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {([
                      { key: 'sum',    label: t('aud.col_sum'),  val: (r: any) => { const s = calcSum(r); return s !== null ? Math.round(s) : '—'; },                                topBorder: true },
                      { key: 'avg',    label: t('aud.col_avg'),  val: (r: any) => { const a = calcAvg(r); return a !== null ? +a.toFixed(2) : '—'; },                                 topBorder: false },
                      { key: 'pct',    label: t('aud.row_pct'),  val: (r: any) => { const p = calcPct(r); return p !== null ? +p.toFixed(2) + '%' : '—'; },                          topBorder: false },
                      { key: 'status', label: t('aud.col_status'), val: (r: any) => {
                          const ok = calcAccepted(r); return ok === null ? '—' : (ok ? t('aud.accepted_short') : t('aud.rejected_short'));
                        },
                        topBorder: false,
                        color: (r: any) => { const ok = calcAccepted(r); return ok === null ? 'var(--text-secondary)' : ok ? 'var(--success)' : 'var(--danger)'; },
                        cellBg: (r: any) => { const ok = calcAccepted(r); return ok === null ? '' : ok ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.13)'; },
                      },
                    ] as any[]).map((row: any) => (
                      <tr key={row.key}>
                        <td colSpan={2} style={{ ...footLabelStyle, padding: '6px 8px', borderTop: row.topBorder ? `2px solid var(--border)` : cellBorder }}>
                          {row.label}
                        </td>
                        {criteriaResults.map((r: any, idx: number) => (
                          <td key={idx} style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, padding: '6px 4px', background: row.cellBg ? row.cellBg(r) : '', color: row.color ? row.color(r) : '', borderTop: row.topBorder ? `2px solid var(--border)` : cellBorder }}>
                            {row.val(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {secDiv(t('aud.sec_criteria'))}
            <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>{t('aud.criteria_table_title')}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', width: 40, textAlign: 'center' }}>#</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)' }}>{t('aud.col_criterion')}</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center' }}>{t('aud.col_sum')}</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center' }}>{t('aud.col_avg')}</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center', whiteSpace: 'nowrap' }}>{t('aud.col_pct')}</th>
                      <th style={{ ...thStyle, background: 'var(--th-bg)', color: 'var(--text-primary)', textAlign: 'center' }}>{t('aud.col_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaResults.map((r: any, idx: number) => {
                      const cSum = calcSum(r);
                      const cAvg = calcAvg(r);
                      const cPct = calcPct(r);
                      const cOk  = calcAccepted(r);
                      return (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={tdStyle}>{r.criterion_name}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{cSum !== null ? Math.round(cSum) : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{cAvg !== null ? +cAvg.toFixed(2) : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{cPct !== null ? +cPct.toFixed(2) + '%' : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700,
                            color: cOk === null ? 'var(--text-secondary)' : cOk ? 'var(--success)' : 'var(--danger)',
                            background: cOk === null ? '' : cOk ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.13)',
                          }}>
                            {cOk === null ? '—' : cOk ? t('aud.accepted_short') : t('aud.rejected_short')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {secDiv(t('aud.sec_chart'))}
            <div className="chart-card" style={{ marginTop: 16, padding: 20, width: 440 }}>
              <canvas id="radarChart" ref={radarRef} />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" id="exportBtn" onClick={async () => {
                try { await Api.exportAudyt(analysisId!, list.find(a => a.id === analysisId)?.title ? fileSlug(list.find(a => a.id === analysisId)!.title, list.find(a => a.id === analysisId)!.created_at) : undefined); } catch { showToast(t('common.export_error'), 'error'); }
              }}>{t('common.export_excel')}</button>
              <button className="btn btn-secondary" style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  if (!confirm(t('aud.confirm_delete'))) return;
                  try {
                    await Api.deleteAudyt(analysisId!);
                    if (loadDraft()?.analysisId === analysisId) clearDraft();
                    showToast(t('common.analysis_deleted'));
                    setSection('list'); loadList();
                  } catch (e: any) { showToast(e.message || t('common.save_error'), 'error'); }
                }}>{t('common.delete_analysis')}</button>
            </div>
          </section>
        );
      })()}
    </>
  );
}
