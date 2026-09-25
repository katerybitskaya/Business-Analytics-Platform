import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigationType, useLocation } from 'react-router-dom';
import { Api, fileSlug } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';
import { GuidePanel } from '@/components/GuidePanel';
import { logger, createDevLogger } from '@/utils/logger';
import type { AnalysisOut, AbcXyzResultOut } from '@/types/api.types';
import EditableTitle from '@/components/EditableTitle';
import { getDisplayTitle } from '@/utils/analysisTitle';

type Section = 'list' | 'edit' | 'results';
type EditItem = { name: string; quantity: string; unit_cost: string };

const DRAFT_KEY = 'abc_draft';
function saveDraft(data: object) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {} }
function loadDraft(): any { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

const cellBorder = '1px solid var(--border)';
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', border: cellBorder,
  background: 'var(--th-bg)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700,
  color: 'var(--text-primary)',
};
const tdStyle: React.CSSProperties = {
  padding: '6px 10px', border: cellBorder, fontSize: 13,
};


function roundedItems(items: EditItem[]) {
  return items
    .filter(i => i.name.trim() && parseFloat(i.quantity) > 0 && parseFloat(i.unit_cost) > 0)
    .map(i => ({
      name: i.name,
      quantity: Math.round(parseFloat(i.quantity)),
      unit_cost: Math.round(parseFloat(i.unit_cost) * 100) / 100,
    }));
}

function categoryText(abcClass?: string, xyzClass?: string): string {
  if (!abcClass || !xyzClass) return '';
  return t(`abc.category.${abcClass}${xyzClass}`);
}

function secDiv(label: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '32px 0 4px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
        letterSpacing: 1.1, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export default function AbcXyzPage() {
  const { showToast } = useToast();
  const log = createDevLogger('ABC/XYZ', '#ff9800');
  const navType = useNavigationType();
  const location = useLocation();
  const initialLocationKeyRef = useRef(location.key);
  const itemsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (location.key === initialLocationKeyRef.current) return;
    flushItems();
    setSection('list');
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const [section, setSection] = useState<Section>('list');
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [period, setPeriod] = useState('');
  const [items, setItems] = useState<EditItem[]>([{ name: '', quantity: '', unit_cost: '' }]);
  const [result, setResult] = useState<AbcXyzResultOut | null>(null);
  const mountedRef = useRef(false);

  const itemsRef = useRef(items);
  const periodRef = useRef(period);
  const analysisIdRef = useRef(analysisId);
  const sectionRef = useRef(section);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { periodRef.current = period; }, [period]);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { sectionRef.current = section; }, [section]);

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await Api.listAbcXyz();
      setList(data);
      log('list loaded', data.length + ' analyses');
    } catch (e: any) {
      logger.error('[ABC] loadList', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') { try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {} return; }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft({ analysisId, section });
  }, [analysisId, section]);

  const flushItems = useCallback(async () => {
    if (itemsSaveTimer.current) { clearTimeout(itemsSaveTimer.current); itemsSaveTimer.current = null; }
    if (!analysisIdRef.current || sectionRef.current !== 'edit') return;
    const validItems = roundedItems(itemsRef.current);
    if (!validItems.length) return;
    try {
      await Api.setAbcXyzItems(analysisIdRef.current, { period_label: periodRef.current || undefined, items: validItems } as any);
      log('items flushed');
    } catch (e: any) { logger.error('[ABC] flushItems', e); }
  }, []);

  useEffect(() => {
    if (!analysisId || section !== 'edit') return;
    if (itemsSaveTimer.current) clearTimeout(itemsSaveTimer.current);
    itemsSaveTimer.current = setTimeout(() => { flushItems(); }, 800);
    return () => { if (itemsSaveTimer.current) clearTimeout(itemsSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, period]);

  useEffect(() => {
    return () => { flushItems(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0);
    return () => clearTimeout(id);
  }, [section]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadList();
    if (location.state?.openId) { openAnalysis(location.state.openId); return; }
    const draft = loadDraft();
    const isPageReload = navType === 'POP' &&
      (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]?.type === 'reload';
    const wasOnList = (() => { try { return sessionStorage.getItem(DRAFT_KEY + '_on_list') === '1'; } catch { return false; } })();
    if (isPageReload && draft?.analysisId && !wasOnList) openAnalysis(draft.analysisId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNew() {
    if (busy) return;
    setBusy(true);
    try {
      log('creating new');
      const a = await Api.createAbcXyz();
      setAnalysisId(a.id);
      setPeriod('');
      setItems([{ name: '', quantity: '', unit_cost: '' }]);
      log('created', a.id);
      setSection('edit');
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[ABC] handleNew', e); }
    finally { setBusy(false); }
  }

  async function openAnalysis(id: string) {
    log('open', id);
    try {
      const data = await Api.getAbcXyz(id);
      setAnalysisId(id);
      if (data.items.length > 0 && (data.items[0] as any).abc_class) {
        setResult(data as any);
        clearDraft();
        setSection('results');
      } else {
        setItems(data.items.length > 0
          ? data.items.map((i: any) => ({ name: i.name, quantity: String(i.quantity), unit_cost: String(i.unit_cost) }))
          : [{ name: '', quantity: '', unit_cost: '' }]);
        setPeriod(data.period_label || '');
        setSection('edit');
      }
    } catch (e: any) { logger.error('[ABC] openAnalysis', e); }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    if (!confirm(t('common.confirm_delete'))) return;
    setBusy(true);
    try {
      await Api.deleteAbcXyz(id);
      if (loadDraft()?.analysisId === id) clearDraft();
      log('deleted', id);
      showToast(t('abc.deleted'));
      loadList();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[ABC] handleDelete', e); }
    finally { setBusy(false); }
  }

  function updateItem(idx: number, field: keyof EditItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleComplete() {
    if (busy) return;
    const validItems = roundedItems(items);
    if (!validItems.length) { showToast(t('abc.fill_error'), 'error'); return; }
    setBusy(true);
    try {
      await Api.setAbcXyzItems(analysisId!, { period_label: period || undefined, items: validItems } as any);
      const res = await Api.completeAbcXyz(analysisId!);
      setResult(res);
      setList(prev => prev.map(x => x.id === analysisId ? { ...x, status: 'completed' as const } : x));
      clearDraft();
      log('completed → results');
      setSection('results');
    } catch (err: any) {
      showToast(t('abc.complete_error'), 'error');
      logger.error('[ABC] handleComplete', err);
    } finally { setBusy(false); }
  }

  async function handleDeleteResult() {
    if (busy) return;
    if (!confirm(t('common.confirm_delete'))) return;
    setBusy(true);
    try {
      await Api.deleteAbcXyz(analysisId!);
      if (loadDraft()?.analysisId === analysisId) clearDraft();
      showToast(t('abc.deleted'));
      setSection('list');
      loadList();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[ABC] handleDeleteResult', e); }
    finally { setBusy(false); }
  }

  const sorted = result ? [...result.items].sort((a, b) => (b.sales_value || 0) - (a.sales_value || 0)) : [];
  const byCell: Record<string, string[]> = {};
  result?.matrix?.forEach((c: any) => { byCell[`${c.abc_class}${c.xyz_class}`] = c.items; });

  return (
    <div>
      {section === 'list' && (
        <section id="listSection">
          <h1 id="abcPageTitle">{t('abc.page_title')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('abc.page_desc')}</p>
          <button className="btn btn-primary" id="newBtn" style={{ margin: '16px 0' }} disabled={busy} onClick={handleNew}>
            {t('abc.new_btn')}
          </button>
          {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
          {loadError && <p style={{ color: 'var(--danger)' }}>{t('common.load_error')}</p>}
          {!loading && !loadError && list.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>{t('common.no_analyses')}</p>
          )}
          <div className="analysis-list-grid" id="cardsGrid">
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle
                  analysisId={a.id}
                  displayTitle={getDisplayTitle('abc-xyz', a.title)}
                  onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))}
                />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {a.status === 'completed' ? t('status.completed') : t('status.in_progress')} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => openAnalysis(a.id)}>{t('common.open')}</button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => handleDelete(a.id)}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'edit' && (
        <section id="editSection">
          <button className="btn btn-secondary" id="backFromEdit" onClick={async () => { await flushItems(); setSection('list'); loadList(); }}>
            {t('common.back_list')}
          </button>
          <GuidePanel id="guideAbc1" titleKey="guide.abc.step1.title" descKey="guide.abc.step1.desc" rulesKeys={['guide.abc.step1.r1', 'guide.abc.step1.r2']} />
          <h1 style={{ marginTop: 20, marginBottom: 4 }}>{t('abc.edit_title')}</h1>
          <div className="card" style={{ marginTop: 16 }}>
            <label style={{ display: 'block', marginBottom: 16 }}>
              {t('abc.period_label')}
              <input className="input" id="periodInput" value={period} onChange={e => setPeriod(e.target.value)}
                onBlur={() => flushItems()}
                style={{ marginTop: 6 }} placeholder={t('abc.period_ph')} />
            </label>
            <div style={{ overflowX: 'auto' }}>
              <table id="itemsTable" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('abc.col.product')}</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('abc.col.sales')}</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('abc.col.unit_cost')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="itemsBody">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 8px' }}>
                        <input className="input" value={item.name}
                          onChange={e => updateItem(idx, 'name', e.target.value)}
                          onBlur={() => flushItems()} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input className="input" type="number" min="0" step="1" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          onBlur={e => {
                            const raw = parseFloat(e.target.value);
                            if (!isNaN(raw) && !Number.isInteger(raw)) {
                              updateItem(idx, 'quantity', String(Math.round(raw)));
                              showToast(t('abc.qty_rounded'), 'error');
                            }
                            flushItems();
                          }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input className="input" type="number" min="0" step="0.1" value={item.unit_cost}
                          onChange={e => updateItem(idx, 'unit_cost', e.target.value)}
                          onBlur={e => {
                            const rawStr = e.target.value;
                            const raw = parseFloat(rawStr);
                            if (!isNaN(raw)) {
                              const decimals = rawStr.match(/\.(\d+)/)?.[1].length || 0;
                              const rounded = Math.round(raw * 100) / 100;
                              if (decimals > 2) {
                                updateItem(idx, 'unit_cost', String(rounded));
                                showToast(t('abc.price_rounded'), 'error');
                              } else if (rounded !== raw) {
                                updateItem(idx, 'unit_cost', String(rounded));
                              }
                            }
                            flushItems();
                          }} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <button className="btn btn-secondary" onClick={() => removeItem(idx)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary" id="addRowBtn" style={{ marginTop: 12 }}
              onClick={() => setItems(prev => [...prev, { name: '', quantity: '', unit_cost: '' }])}>
              {t('abc.add_row')}
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" id="completeBtn" disabled={busy} onClick={handleComplete}>
              {t('abc.complete_btn')}
            </button>
          </div>
        </section>
      )}

      {section === 'results' && result && (
        <section id="resultsSection">
          <button className="btn btn-secondary" id="backFromResults" onClick={() => { setSection('list'); loadList(); }}>
            {t('common.back_list')}
          </button>
          <h2 id="abcResultsTitle" style={{
            marginTop: 20, marginBottom: 2,
            fontSize: 20, textTransform: 'none', letterSpacing: 0, fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            {t('abc.results_title')}
          </h2>
          <GuidePanel id="guideAbc2" titleKey="guide.abc.step2.title" descKey="guide.abc.step2.desc" rulesKeys={['guide.abc.step2.r1', 'guide.abc.step2.r2', 'guide.abc.step2.r3', 'guide.abc.step2.r4']} />

          {secDiv(t('abc.full_table'))}
          <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>
              {t('abc.full_table')}
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table id="resultTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      t('abc.col.product'),
                      t('abc.col.sales'),
                      t('abc.col.unit_cost'),
                      t('abc.col.value'),
                      t('abc.col.share'),
                      t('abc.col.cumulative'),
                      t('abc.col.cv'),
                      t('abc.col.abc_class'),
                      t('abc.col.xyz_class'),
                      t('abc.col.category'),
                    ].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody id="resultBody">
                  {sorted.map((i: any, idx: number) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{i.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{i.quantity}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{+((i.unit_cost || 0).toFixed(2))}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{+((i.sales_value || 0).toFixed(2))}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{Math.round((i.share_pct || 0) * 100)}%</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{Math.round((i.cumulative_pct || 0) * 100)}%</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{+((i.cv || 0).toFixed(2))}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span className={`abc-letter abc-letter-${i.abc_class}`}>{i.abc_class}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span className={`abc-letter abc-letter-${i.xyz_class}`}>{i.xyz_class}</span>
                      </td>
                      <td style={tdStyle}>{categoryText(i.abc_class, i.xyz_class)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {secDiv(t('abc.matrix_title'))}
          <div className="card" style={{ marginTop: 16, padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: 'var(--text-secondary)' }}>
              {t('abc.matrix_title')}
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table id="matrixTable" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 48, textAlign: 'center' }}></th>
                    {['X', 'Y', 'Z'].map(x => (
                      <th key={x} style={{ ...thStyle, textAlign: 'center', minWidth: 160 }}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {['A', 'B', 'C'].map(a => (
                    <tr key={a}>
                      <th style={{ ...thStyle, textAlign: 'center' }}>{a}</th>
                      {['X', 'Y', 'Z'].map(x => (
                        <td key={x} style={{ ...tdStyle, verticalAlign: 'top', minWidth: 160 }}>
                          {(byCell[`${a}${x}`] || []).join(', ') || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" id="exportBtn"
              onClick={() => Api.exportAbcXyz(analysisId!, result.title ? fileSlug(result.title, result.created_at) : undefined)}>
              {t('common.export_excel')}
            </button>
            <button className="btn btn-secondary" id="deleteBtn" style={{ color: 'var(--danger)' }}
              disabled={busy} onClick={handleDeleteResult}>
              {t('common.delete_analysis')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
