import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigationType, useLocation } from 'react-router-dom';
import { Api, fileSlug } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';
import { GuidePanel } from '@/components/GuidePanel';
import { logger, createDevLogger } from '@/utils/logger';
import type { AnalysisOut, EisenhowerTask } from '@/types/api.types';
import EditableTitle from '@/components/EditableTitle';
import { getDisplayTitle } from '@/utils/analysisTitle';

type Section = 'list' | 'board';

const DRAFT_KEY = 'eis_draft';
function saveDraft(data: object) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {} }
function loadDraft(): any { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

const QUADRANT_NUMS: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4 };

const QUAD_COLORS_LIGHT: Record<string, string> = {
  '1': 'rgba(255,199,206,0.12)',
  '2': 'rgba(198,239,206,0.12)',
  '3': 'rgba(255,235,156,0.12)',
  '4': 'rgba(217,225,242,0.12)',
};
const QUAD_COLORS_DARK: Record<string, string> = {
  '1': 'rgba(239,68,68,0.18)',
  '2': 'rgba(34,197,94,0.16)',
  '3': 'rgba(234,179,8,0.16)',
  '4': 'rgba(99,102,241,0.16)',
};

interface BoardData {
  unscored: EisenhowerTask[];
  quadrants: Record<string, EisenhowerTask[]>;
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

interface TaskCardProps {
  task: EisenhowerTask;
  isDark: boolean;
  draggedIdRef: React.MutableRefObject<string | null>;
  onTouchStart: (e: React.TouchEvent, task: EisenhowerTask) => void;
  onRemove: (id: string) => void;
}

function TaskCard({ task, isDark, draggedIdRef, onTouchStart, onRemove }: TaskCardProps) {
  return (
    <div
      className="eis-task"
      draggable
      style={isDark ? { background: '#1a1d2e', color: '#ffffff' } : undefined}
      onTouchStart={e => onTouchStart(e, task)}
      onDragStart={e => {
        draggedIdRef.current = task.id;
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).classList.add('dragging');
      }}
      onDragEnd={e => {
        draggedIdRef.current = null;
        (e.currentTarget as HTMLElement).classList.remove('dragging');
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ flex: 1, wordBreak: 'break-word', fontSize: 14, lineHeight: 1.4 }}>
          {task.title}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(task.id); }}
          title={t('common.delete')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, width: 26, height: 26, borderRadius: 6,
            background: 'transparent', border: '1px solid transparent',
            cursor: 'pointer', color: 'var(--text-secondary)',
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = 'rgba(239,68,68,0.12)';
            b.style.color = 'var(--danger)';
            b.style.borderColor = 'rgba(239,68,68,0.3)';
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = 'transparent';
            b.style.color = 'var(--text-secondary)';
            b.style.borderColor = 'transparent';
          }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export default function EisenhowerPage() {
  const { showToast } = useToast();
  const log = createDevLogger('EISENHOWER', '#e91e63');
  const navType = useNavigationType();
  const location = useLocation();
  const initialLocationKeyRef = useRef(location.key);

  useEffect(() => {
    if (location.key === initialLocationKeyRef.current) return;
    setSection('list');
    loadList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const [section, setSection] = useState<Section>('list');
  const mountedRef = useRef(false);

  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light');
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  const QUAD_COLORS = isDark ? QUAD_COLORS_DARK : QUAD_COLORS_LIGHT;
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const analysisIdRef = useRef<string | null>(null);
  const [board, setBoard] = useState<BoardData>({ unscored: [], quadrants: {} });
  const [quadInput, setQuadInput] = useState<Record<string, string>>({});
  const [unscoredInput, setUnscoredInput] = useState('');
  const draggedId = useRef<string | null>(null);

  const touchGhostRef = useRef<HTMLElement | null>(null);
  const touchDeltaRef = useRef({ x: 0, y: 0 });
  const touchDraggingCardRef = useRef<HTMLElement | null>(null);
  const applyDropRef = useRef<(taskId: string, zone: string) => Promise<void>>(async () => {});

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const l = await Api.listEisenhower(); setList(l); log('list loaded', l.length + ' analyses'); }
    catch (e: any) { logger.error('[EIS] loadList', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') { try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {} return; }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft({ analysisId, section });
  }, [analysisId, section]);

  useEffect(() => {
    const timer = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0);
    return () => clearTimeout(timer);
  }, [section]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadList();
    if (location.state?.openId) { openBoard(location.state.openId); return; }
    const draft = loadDraft();
    const isPageReload = navType === 'POP' &&
      (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]?.type === 'reload';
    const wasOnList = (() => { try { return sessionStorage.getItem(DRAFT_KEY + '_on_list') === '1'; } catch { return false; } })();
    if (isPageReload && draft?.analysisId && !wasOnList) openBoard(draft.analysisId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openBoard(id: string) {
    log('open', id);
    setBoard({ unscored: [], quadrants: {} });
    setAnalysisId(id);
    analysisIdRef.current = id;
    setSection('board');
    try {
      await refreshBoard(id);
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[EIS] openBoard', e); setSection('list'); }
  }

  async function refreshBoard(id?: string) {
    const aid = id ?? analysisIdRef.current!;
    const data = await Api.getEisenhower(aid);
    if (aid !== analysisIdRef.current) return;
    setBoard({ unscored: (data as any).unscored || [], quadrants: (data as any).quadrants || {} });
  }

  async function handleDeleteFromList(id: string) {
    if (!confirm(t('common.confirm_delete'))) return;
    try {
      await Api.deleteEisenhower(id);
      if (loadDraft()?.analysisId === id) clearDraft();
      showToast(t('common.analysis_deleted'));
      loadList();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  async function removeTask(taskId: string) {
    if (!confirm(t('eis.confirm_delete_task'))) return;
    try {
      await Api.deleteEisenhowerTask(analysisId!, taskId);
      await refreshBoard();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  async function handleAddToUnscored() {
    const title = unscoredInput.trim();
    if (!title) return;
    try {
      await Api.addEisenhowerTask(analysisId!, { title } as any);
      setUnscoredInput('');
      await refreshBoard();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  async function handleAddToQuad(q: string) {
    const title = (quadInput[q] || '').trim();
    if (!title) return;
    try {
      await Api.addEisenhowerTask(analysisId!, { title, quadrant: QUADRANT_NUMS[q] } as any);
      setQuadInput(prev => ({ ...prev, [q]: '' }));
      await refreshBoard();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  async function applyDrop(taskId: string, zone: string) {
    try {
      if (zone === 'tray') {
        await Api.updateEisenhowerTask(analysisId!, taskId, { quadrant: null } as any);
      } else {
        const q = QUADRANT_NUMS[zone];
        if (!q) return;
        await Api.updateEisenhowerTask(analysisId!, taskId, { quadrant: q } as any);
      }
      await refreshBoard();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  useEffect(() => { applyDropRef.current = applyDrop; });

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!touchGhostRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      touchGhostRef.current.style.top  = (touch.clientY - touchDeltaRef.current.y) + 'px';
      touchGhostRef.current.style.left = (touch.clientX - touchDeltaRef.current.x) + 'px';
      touchGhostRef.current.style.display = 'none';
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      touchGhostRef.current.style.display = '';
      document.querySelectorAll('[data-drop-zone]').forEach(z => z.classList.remove('drag-over'));
      const dropZone = el?.closest('[data-drop-zone]');
      if (dropZone) dropZone.classList.add('drag-over');
    }

    async function onTouchEnd(e: TouchEvent) {
      if (touchGhostRef.current) { touchGhostRef.current.remove(); touchGhostRef.current = null; }
      if (touchDraggingCardRef.current) {
        touchDraggingCardRef.current.classList.remove('dragging');
        touchDraggingCardRef.current = null;
      }
      document.querySelectorAll('[data-drop-zone]').forEach(z => z.classList.remove('drag-over'));
      if (!draggedId.current) return;
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = el?.closest('[data-drop-zone]') as HTMLElement | null;
      if (dropZone) await applyDropRef.current(draggedId.current, dropZone.dataset.dropZone!);
      draggedId.current = null;
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd as unknown as EventListener);
    };
  }, []);

  function handleTaskTouchStart(e: React.TouchEvent, task: EisenhowerTask) {
    draggedId.current = task.id;
    const card = e.currentTarget as HTMLElement;
    const touch = e.touches[0];
    const rect = card.getBoundingClientRect();
    touchDeltaRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.style.cssText =
      `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;` +
      `opacity:0.7;pointer-events:none;z-index:9999;border-radius:10px;` +
      `background:var(--bg-elevated,var(--surface));box-shadow:var(--shadow,0 4px 12px rgba(0,0,0,0.3));`;
    document.body.appendChild(ghost);
    touchGhostRef.current = ghost;
    touchDraggingCardRef.current = card;
    card.classList.add('dragging');
  }

  const QUAD_LABELS: Record<string, string> = {
    '1': `Q1 — ${t('eis.q1')}`,
    '2': `Q2 — ${t('eis.q2')}`,
    '3': `Q3 — ${t('eis.q3')}`,
    '4': `Q4 — ${t('eis.q4')}`,
  };

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }
  function onDragLeave(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  return (
    <div>
      {section === 'list' && (
        <section id="listSection">
          <h1 id="eisPageTitle">{t('eis.page_title')}</h1>
          <p id="eisPageDesc" style={{ color: 'var(--text-secondary)' }}>{t('eis.page_desc')}</p>
          <button className="btn btn-primary" id="newBtn" style={{ margin: '16px 0' }} disabled={busy} onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const a = await Api.createEisenhower();
              openBoard(a.id);
            } catch (e: any) { showToast(t('common.save_error'), 'error'); }
            finally { setBusy(false); }
          }}>{t('abc.new_btn')}</button>
          {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
          {!loading && list.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>{t('eis.no_analyses')}</p>
          )}
          <div className="analysis-list-grid" id="cardsGrid">
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle analysisId={a.id} displayTitle={getDisplayTitle("eisenhower", a.title)} onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {a.task_count != null ? `${a.task_count} ${t('status.tasks')}` : '—'} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" onClick={() => openBoard(a.id)}>{t('common.open')}</button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)' }}
                    onClick={() => handleDeleteFromList(a.id)}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'board' && (
        <section id="boardSection">
          <button className="btn btn-secondary" id="backBtn"
            onClick={() => { setSection('list'); loadList(); }}>
            {t('common.back_list')}
          </button>
          <GuidePanel id="guideEis1" titleKey="guide.eis.step1.title" descKey="guide.eis.step1.desc" rulesKeys={['guide.eis.step1.r1','guide.eis.step1.r2']} />
          <h1 style={{ marginTop: 20, marginBottom: 16 }}>{t('eis.board_title')}</h1>

          <div className="eis-board-grid">
            {(['1','2','3','4'] as const).map(q => (
              <div key={q}
                className="card eis-quadrant"
                data-drop-zone={q}
                style={{ background: QUAD_COLORS[q], display: 'flex', flexDirection: 'column' }}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={async e => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.remove('drag-over');
                  if (draggedId.current) await applyDrop(draggedId.current, q);
                }}>
                <b style={{ marginBottom: 8, display: 'block', fontSize: 13 }}>{QUAD_LABELS[q]}</b>
                <div id={`quad-${q}`} style={{ flex: 1 }}>
                  {(board.quadrants[q] || []).length === 0
                    ? <p className="eis-drop-hint">{t('eis.drop_hint')}</p>
                    : (board.quadrants[q] || []).map(task => <TaskCard key={task.id} task={task} isDark={isDark} draggedIdRef={draggedId} onTouchStart={handleTaskTouchStart} onRemove={removeTask} />)}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}
                  onClick={e => e.stopPropagation()}>
                  <input
                    className="input"
                    style={{ flex: 1, fontSize: 13, padding: '5px 8px' }}
                    placeholder={t('eis.task_placeholder')}
                    value={quadInput[q] || ''}
                    onChange={e => setQuadInput(prev => ({ ...prev, [q]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddToQuad(q)}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '5px 14px', fontSize: 18, lineHeight: 1 }}
                    onClick={() => handleAddToQuad(q)}
                  >+</button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>{t('eis.unscored')}</h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              className="input"
              style={{ flex: 1, fontSize: 13, padding: '5px 8px' }}
              placeholder={t('eis.task_placeholder')}
              value={unscoredInput}
              onChange={e => setUnscoredInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddToUnscored()}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '5px 14px', fontSize: 18, lineHeight: 1 }}
              onClick={handleAddToUnscored}
            >+</button>
          </div>
          <div className="card" id="unscoredTray" data-drop-zone="tray"
            style={{ minHeight: 64, padding: '12px 16px' }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={async e => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).classList.remove('drag-over');
              if (draggedId.current) await applyDrop(draggedId.current, 'tray');
            }}>
            {board.unscored.length === 0
              ? <p className="eis-drop-hint" style={{ margin: 0 }}>{t('eis.drop_hint')}</p>
              : board.unscored.map(task => <TaskCard key={task.id} task={task} isDark={isDark} draggedIdRef={draggedId} onTouchStart={handleTaskTouchStart} onRemove={removeTask} />)}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" id="exportBtn"
              onClick={() => Api.exportEisenhower(analysisId!, list.find(a => a.id === analysisId)?.title ? fileSlug(list.find(a => a.id === analysisId)!.title, list.find(a => a.id === analysisId)!.created_at) : undefined)}>
              {t('common.export_excel')}
            </button>
            <button className="btn btn-secondary" id="deleteBtn" style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(t('eis.confirm_delete_analysis'))) return;
                try {
                  await Api.deleteEisenhower(analysisId!);
                  clearDraft();
                  showToast(t('common.analysis_deleted'));
                  setSection('list'); loadList();
                } catch (e: any) { showToast(t('common.save_error'), 'error'); }
              }}>{t('common.delete_analysis')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
