import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { useNavigationType, useLocation } from 'react-router-dom';
import { Api, fileSlug } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';
import { GuidePanel } from '@/components/GuidePanel';
import { logger, createDevLogger } from '@/utils/logger';
import type { AnalysisOut, ScheduleTask } from '@/types/api.types';
import EditableTitle from '@/components/EditableTitle';
import { getDisplayTitle } from '@/utils/analysisTitle';

type Section = 'list' | 'board';

const DRAFT_KEY = 'sched_draft';
function saveDraft(data: object) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {} }
function loadDraft(): any { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
const BAR_COLORS = ['#E84393', '#C77DFF', '#6C63FF', '#4F8EF7', '#00BCD4', '#3ECF8E'];

function StatusIcon({ task }: { task: ScheduleTask }) {
  const today = new Date().toISOString().slice(0, 10);
  if (task.progress === 100) {
    return (
      <span title={t('sch.status_done')} style={{ color: 'var(--success, #3ECF8E)', display: 'inline-flex', verticalAlign: 'middle' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18"/>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M4.5 8l2.5 2.5L11.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  if (task.end_date && task.end_date <= today) {
    return (
      <span title={t('sch.status_overdue')} style={{ color: 'var(--danger, #EF4444)', display: 'inline-flex', verticalAlign: 'middle' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18"/>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 4.5v3.8M8 10.5v.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </span>
    );
  }
  if (task.progress > 0) {
    return (
      <span title={t('sch.status_progress')} style={{ color: 'var(--accent)', display: 'inline-flex', verticalAlign: 'middle' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18"/>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 5v3l1.8 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  return (
    <span title={t('sch.status_pending')} style={{ color: 'var(--text-secondary)', display: 'inline-flex', verticalAlign: 'middle' }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    </span>
  );
}
const DAY_W = 32;

function escHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function daysToDate(baseMs: number, days: number) {
  return new Date(baseMs + days * 86400000).toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const { showToast } = useToast();
  const log = createDevLogger('SCHEDULE', '#00bcd4');
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
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<AnalysisOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [timelineStart, setTimelineStart] = useState('');
  const [timelineEnd, setTimelineEnd] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskResponsible, setTaskResponsible] = useState('');
  const [taskStart, setTaskStart] = useState('');
  const [taskEnd, setTaskEnd] = useState('');
  const ganttRef = useRef<HTMLDivElement>(null);
  const timelineStartMs = useRef(0);
  const timelineTotalDays = useRef(1);
  const tasksRef = useRef<ScheduleTask[]>([]);
  const analysisIdRef = useRef<string | null>(null);
  const labelWRef = useRef(150);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number>(-1);
  const dragIndexRef = useRef<number>(-1);

  const [connectMode, setConnectMode] = useState(false);
  const connectModeRef = useRef(false);
  const connectFromRef = useRef<string | null>(null);

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { analysisIdRef.current = analysisId; }, [analysisId]);
  useEffect(() => { connectModeRef.current = connectMode; }, [connectMode]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const l = await Api.listSchedule(); setList(l); log('list loaded', l.length + ' analyses'); }
    catch (e: any) { logger.error('[SCHED] loadList', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!analysisId) return;
    if (section === 'list') { try { sessionStorage.setItem(DRAFT_KEY + '_on_list', '1'); } catch {} return; }
    try { sessionStorage.removeItem(DRAFT_KEY + '_on_list'); } catch {}
    saveDraft({ analysisId, section });
  }, [analysisId, section]);

  useEffect(() => { const t = setTimeout(() => { const el = document.querySelector('.main-content'); if (el) el.scrollTop = 0; }, 0); return () => clearTimeout(t); }, [section]);

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
    setTasks([]);
    setStats(null);
    setTimelineStart('');
    setTimelineEnd('');
    setAnalysisId(id);
    analysisIdRef.current = id;
    setSection('board');
    setConnectMode(false);
    connectModeRef.current = false;
    connectFromRef.current = null;
    try {
      await refreshBoard(id);
    } catch (e: any) { showToast(t('common.save_error'), 'error'); logger.error('[SCH] openBoard', e); setSection('list'); }
  }

  async function refreshBoard(id?: string) {
    const aid = id ?? analysisIdRef.current!;
    const data = await Api.getSchedule(aid);
    if (aid !== analysisIdRef.current) return;
    setTasks(data.tasks || []);
    setStats(data.stats);
    setTimelineStart((data as any).timeline_start || '');
    setTimelineEnd((data as any).timeline_end || '');
  }

  useLayoutEffect(() => {
    if (section === 'board' && tasks.length > 0 && timelineStart && timelineEnd) {
      renderGantt();
    } else if (section === 'board' && ganttRef.current) {
      ganttRef.current.innerHTML = `<p style="color:var(--text-secondary)">${t('sch.gantt_empty')}</p>`;
    }
  }, [tasks, timelineStart, timelineEnd, section]);


  function renderGantt() {
    const container = ganttRef.current;
    if (!container) return;

    const startMs   = new Date(timelineStart).getTime();
    const endMs     = new Date(timelineEnd).getTime();
    timelineStartMs.current  = startMs;
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    timelineTotalDays.current = totalDays;

    const days: { date: Date; dayNum: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * 86400000);
      days.push({ date: d, dayNum: d.getDate() });
    }

    const weeks: { label: string; count: number }[] = [];
    let wi = 0;
    while (wi < days.length) {
      const count = Math.min(7, days.length - wi);
      weeks.push({ label: days[wi].date.toISOString().slice(0, 10), count });
      wi += count;
    }

    const weekCellsHtml = weeks.map(w =>
      `<div class="gantt-week-cell" style="width:${w.count * DAY_W}px">${w.label}</div>`
    ).join('');

    const dayCellsHtml = days.map(d =>
      `<div class="gantt-day-cell">${d.dayNum}</div>`
    ).join('');

    const lw = labelWRef.current;
    const headerHtml = `
      <div class="gantt-header-row gantt-header-top">
        <div class="gantt-col-label" style="width:${lw}px; position:relative">
          <div class="gantt-label-resize-handle" id="labelResizeHandle"></div>
        </div>
        <div class="gantt-weeks-wrap">${weekCellsHtml}</div>
      </div>
      <div class="gantt-header-row gantt-header-days">
        <div class="gantt-col-label" style="width:${lw}px"></div>
        <div class="gantt-days-wrap">${dayCellsHtml}</div>
      </div>`;

    const rowsHtml = tasks.map((task, idx) => {
      const offsetDays  = Math.max(0, Math.round((new Date(task.start_date).getTime() - startMs) / 86400000));
      const durDays     = Math.max(1, Math.round((new Date(task.end_date).getTime() - new Date(task.start_date).getTime()) / 86400000) + 1);
      const leftPx  = offsetDays * DAY_W;
      const widthPx = durDays * DAY_W;
      const color = BAR_COLORS[idx % BAR_COLORS.length];
      return `
        <div class="gantt-row" data-row-id="${task.id}">
          <div class="gantt-label" style="width:${lw}px" title="${escHtml(task.title)}"><span class="gantt-label-num">${idx + 1}</span>${escHtml(task.title)}</div>
          <div class="gantt-track" style="width:${totalDays * DAY_W}px">
            <div class="gantt-bar" data-task-id="${task.id}"
                 style="left:${leftPx}px;width:${widthPx}px;background:${color}"
                 title="${task.start_date} → ${task.end_date}">
              <div class="gantt-bar-resize-left" data-resize-left-id="${task.id}"></div>
              ${task.progress > 0 ? task.progress + '%' : ''}
              <div class="gantt-bar-resize" data-resize-id="${task.id}"></div>
            </div>
            <div class="gantt-bar-connector" data-connector-id="${task.id}"
                 style="left:${leftPx + widthPx - 7}px"></div>
          </div>
        </div>`;
    }).join('');

    const svgDefs = `<defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" />
      </marker>
    </defs>`;

    container.innerHTML =
      headerHtml +
      `<div class="gantt-rows-wrap">${rowsHtml}<svg class="gantt-svg" id="depSvg">${svgDefs}</svg></div>`;

    bindGanttInteractions();
    bindLabelResize();
    bindConnectors();
    drawDependencyArrows(tasks);
  }


  function bindLabelResize() {
    const container = ganttRef.current;
    if (!container) return;
    const handle = container.querySelector<HTMLElement>('#labelResizeHandle');
    if (!handle) return;
    const cont = container;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = labelWRef.current;

      function onMove(ev: MouseEvent) {
        const newW = Math.max(60, Math.min(400, startW + ev.clientX - startX));
        labelWRef.current = newW;
        cont.querySelectorAll<HTMLElement>('.gantt-col-label').forEach(el => { el.style.width = newW + 'px'; });
        cont.querySelectorAll<HTMLElement>('.gantt-label').forEach(el => { el.style.width = newW + 'px'; });
        const svg = cont.querySelector<SVGSVGElement>('#depSvg');
        if (svg) svg.style.width = (newW + timelineTotalDays.current * DAY_W) + 'px';
        const todayLine = cont.querySelector<SVGLineElement>('.today-line');
        if (todayLine) {
          const todayMs = new Date().setHours(0, 0, 0, 0);
          const todayOffset = Math.round((todayMs - timelineStartMs.current) / 86400000);
          const x = String(newW + todayOffset * DAY_W + DAY_W / 2);
          todayLine.setAttribute('x1', x);
          todayLine.setAttribute('x2', x);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        renderGantt();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }


  function drawDependencyArrows(currentTasks: ScheduleTask[]) {
    const container = ganttRef.current;
    if (!container) return;
    const svg = container.querySelector<SVGSVGElement>('#depSvg');
    if (!svg) return;

    svg.querySelectorAll('.dep-arrow, .dep-arrow-hit, .today-line').forEach(el => el.remove());

    const wrap = container.querySelector<HTMLElement>('.gantt-rows-wrap');
    if (!wrap) return;

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const todayOffset = Math.round((todayMs - timelineStartMs.current) / 86400000);
    if (todayOffset >= 0 && todayOffset < timelineTotalDays.current) {
      const todayX = labelWRef.current + todayOffset * DAY_W + DAY_W / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'today-line');
      line.setAttribute('x1', String(todayX));
      line.setAttribute('x2', String(todayX));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', String(wrap.offsetHeight));
      svg.appendChild(line);
    }

    const taskById: Record<string, ScheduleTask> = {};
    currentTasks.forEach(t => { taskById[t.id] = t; });

    currentTasks.forEach(task => {
      const depOn: string[] = (task as any).depends_on || [];
      if (!depOn.length) return;
      depOn.forEach(depId => {
        if (!taskById[depId]) return;
        const fromRow = wrap.querySelector<HTMLElement>(`[data-row-id="${depId}"]`);
        const toRow   = wrap.querySelector<HTMLElement>(`[data-row-id="${task.id}"]`);
        if (!fromRow || !toRow) return;
        const fromBar = fromRow.querySelector<HTMLElement>('.gantt-bar');
        const toBar   = toRow.querySelector<HTMLElement>('.gantt-bar');
        if (!fromBar || !toBar) return;

        const wrapRect = wrap.getBoundingClientRect();
        const fromRect = fromBar.getBoundingClientRect();
        const toRect   = toBar.getBoundingClientRect();

        const x1 = fromRect.right - wrapRect.left;
        const y1 = fromRect.top   - wrapRect.top + fromRect.height / 2;
        const x2 = toRect.left    - wrapRect.left;
        const y2 = toRect.top     - wrapRect.top + toRect.height / 2;
        const midX = (x1 + x2) / 2;

        const d = `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
        const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitPath.setAttribute('class', 'dep-arrow-hit');
        hitPath.setAttribute('d', d);
        hitPath.setAttribute('title', 'Click to remove dependency');
        svg.appendChild(hitPath);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'dep-arrow');
        path.setAttribute('d', d);
        svg.appendChild(path);

        const removeDep = async () => {
          const newDeps = (task.depends_on || []).filter((dd: any) => String(dd) !== String(depId));
          await handleUpdateTask(task.id, { depends_on: newDeps });
        };
        hitPath.addEventListener('click', removeDep);
        path.addEventListener('click', removeDep);
      });
    });

    svg.style.height = wrap.offsetHeight + 'px';
    svg.style.width  = (labelWRef.current + timelineTotalDays.current * DAY_W) + 'px';
  }


  function bindConnectors() {
    const container = ganttRef.current;
    if (!container) return;

    container.querySelectorAll<HTMLElement>('.gantt-bar-connector').forEach(connector => {
      connector.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        if (!connectModeRef.current) return;

        const clickedId = connector.dataset.connectorId!;

        if (!connectFromRef.current) {
          connectFromRef.current = clickedId;
          container.querySelectorAll('.gantt-bar-connector').forEach(c => c.classList.remove('selected'));
          connector.classList.add('selected');
        } else {
          const fromId = connectFromRef.current;
          connectFromRef.current = null;
          container.querySelectorAll('.gantt-bar-connector').forEach(c => c.classList.remove('selected'));

          if (clickedId !== fromId) {
            const currentTask = tasksRef.current.find(t => t.id === clickedId);
            const existingDeps: string[] = (currentTask?.depends_on || []).map(String);
            if (!existingDeps.includes(String(fromId))) {
              handleUpdateTask(clickedId, { depends_on: [...existingDeps, fromId] });
            }
          }
        }
      });
    });
  }

  function enterConnectMode() {
    const container = ganttRef.current;
    setConnectMode(true);
    connectModeRef.current = true;
    connectFromRef.current = null;
    if (container) container.classList.add('connect-mode');
  }

  function exitConnectMode() {
    const container = ganttRef.current;
    setConnectMode(false);
    connectModeRef.current = false;
    connectFromRef.current = null;
    if (container) {
      container.classList.remove('connect-mode');
      container.querySelectorAll('.gantt-bar-connector').forEach(c => c.classList.remove('selected'));
    }
  }


  function bindGanttInteractions() {
    const container = ganttRef.current;
    if (!container) return;
    const tasksById: Record<string, ScheduleTask> = {};
    tasksRef.current.forEach(t => { tasksById[t.id] = t; });

    container.querySelectorAll<HTMLElement>('.gantt-bar').forEach(bar => {
      const taskId = bar.dataset.taskId!;
      const task   = tasksById[taskId];
      if (!task) return;
      const resizeHandle     = bar.querySelector<HTMLElement>('.gantt-bar-resize');
      const resizeLeftHandle = bar.querySelector<HTMLElement>('.gantt-bar-resize-left');

      bar.addEventListener('mousedown', (e: MouseEvent) => {
        const t = e.target as HTMLElement;
        if (t.classList.contains('gantt-bar-resize') || t.classList.contains('gantt-bar-resize-left')) return;
        startBarDrag(e, bar, task, 'move');
      });
      resizeHandle?.addEventListener('mousedown', (e: MouseEvent) => {
        e.stopPropagation();
        startBarDrag(e, bar, task, 'resize');
      });
      resizeLeftHandle?.addEventListener('mousedown', (e: MouseEvent) => {
        e.stopPropagation();
        startBarDrag(e, bar, task, 'resize-left');
      });

      bar.addEventListener('touchstart', (e: TouchEvent) => {
        const touch = e.touches[0];
        const rRect  = resizeHandle?.getBoundingClientRect();
        const lRect  = resizeLeftHandle?.getBoundingClientRect();
        const isResizeRight = rRect && touch.clientX >= rRect.left - 10 && touch.clientX <= rRect.right  + 10;
        const isResizeLeft  = lRect && touch.clientX >= lRect.left - 10 && touch.clientX <= lRect.right  + 10;
        startBarDragTouch(e, bar, task, isResizeRight ? 'resize' : isResizeLeft ? 'resize-left' : 'move');
      }, { passive: true });
    });
  }


  function startBarDrag(
    e: MouseEvent,
    bar: HTMLElement,
    task: ScheduleTask,
    mode: 'move' | 'resize' | 'resize-left',
  ) {
    e.preventDefault();
    const startX    = e.clientX;
    const origLeft  = parseInt(bar.style.left,  10);
    const origWidth = parseInt(bar.style.width, 10);
    const startDateMs = new Date(task.start_date).getTime();
    const endDateMs   = new Date(task.end_date).getTime();
    let newStartDate  = task.start_date;
    let newEndDate    = task.end_date;

    bar.style.cursor = 'ew-resize';
    if (mode === 'move') bar.style.cursor = 'grabbing';

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      if (mode === 'move') {
        const offsetDays = Math.round((origLeft + dx) / DAY_W);
        const lenDays    = Math.round((endDateMs - startDateMs) / 86400000);
        const snappedLeft = offsetDays * DAY_W;
        bar.style.left = snappedLeft + 'px';
        newStartDate = daysToDate(timelineStartMs.current, offsetDays);
        newEndDate   = daysToDate(timelineStartMs.current, offsetDays + lenDays);
      } else if (mode === 'resize') {
        const durDays  = Math.max(1, Math.round((origWidth + dx) / DAY_W));
        const newWidth = durDays * DAY_W;
        bar.style.width = newWidth + 'px';
        const startOff = Math.round(origLeft / DAY_W);
        newStartDate = task.start_date;
        newEndDate   = daysToDate(timelineStartMs.current, startOff + durDays - 1);
      } else {
        const rightEdge  = origLeft + origWidth;
        const durDays    = Math.max(1, Math.round((rightEdge - (origLeft + dx)) / DAY_W));
        const newWidth   = durDays * DAY_W;
        const newLeft    = rightEdge - newWidth;
        bar.style.left   = newLeft  + 'px';
        bar.style.width  = newWidth + 'px';
        newStartDate = daysToDate(timelineStartMs.current, Math.round(newLeft / DAY_W));
        newEndDate   = task.end_date;
      }
      drawDependencyArrows(tasksRef.current);
    }

    async function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      bar.style.cursor = '';
      if (newStartDate !== task.start_date || newEndDate !== task.end_date) {
        try {
          await Api.updateScheduleTask(analysisIdRef.current!, task.id, {
            start_date: newStartDate,
            end_date:   newEndDate,
          });
          await refreshBoard();
        } catch (e: any) { showToast(t('common.save_error'), 'error'); }
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }


  function startBarDragTouch(
    e: TouchEvent,
    bar: HTMLElement,
    task: ScheduleTask,
    mode: 'move' | 'resize' | 'resize-left',
  ) {
    const startX    = e.touches[0].clientX;
    const origLeft  = parseInt(bar.style.left,  10);
    const origWidth = parseInt(bar.style.width, 10);
    const startDateMs = new Date(task.start_date).getTime();
    const endDateMs   = new Date(task.end_date).getTime();
    let newStartDate  = task.start_date;
    let newEndDate    = task.end_date;
    bar.classList.add('dragging');

    function onTouchMove(ev: TouchEvent) {
      ev.preventDefault();
      const dx = ev.touches[0].clientX - startX;
      if (mode === 'move') {
        const offsetDays  = Math.round((origLeft + dx) / DAY_W);
        const lenDays     = Math.round((endDateMs - startDateMs) / 86400000);
        bar.style.left    = (offsetDays * DAY_W) + 'px';
        newStartDate = daysToDate(timelineStartMs.current, offsetDays);
        newEndDate   = daysToDate(timelineStartMs.current, offsetDays + lenDays);
      } else if (mode === 'resize') {
        const durDays  = Math.max(1, Math.round((origWidth + dx) / DAY_W));
        const newWidth = durDays * DAY_W;
        bar.style.width = newWidth + 'px';
        const startOff = Math.round(origLeft / DAY_W);
        newStartDate = task.start_date;
        newEndDate   = daysToDate(timelineStartMs.current, startOff + durDays - 1);
      } else {
        const rightEdge = origLeft + origWidth;
        const durDays   = Math.max(1, Math.round((rightEdge - (origLeft + dx)) / DAY_W));
        const newWidth  = durDays * DAY_W;
        const newLeft   = rightEdge - newWidth;
        bar.style.left  = newLeft  + 'px';
        bar.style.width = newWidth + 'px';
        newStartDate = daysToDate(timelineStartMs.current, Math.round(newLeft / DAY_W));
        newEndDate   = task.end_date;
      }
      drawDependencyArrows(tasksRef.current);
    }

    async function onTouchEnd() {
      bar.removeEventListener('touchmove', onTouchMove);
      bar.removeEventListener('touchend',  onTouchEnd);
      bar.classList.remove('dragging');
      if (newStartDate !== task.start_date || newEndDate !== task.end_date) {
        try {
          await Api.updateScheduleTask(analysisIdRef.current!, task.id, {
            start_date: newStartDate,
            end_date:   newEndDate,
          });
          await refreshBoard();
        } catch (e: any) { showToast(t('common.save_error'), 'error'); }
      }
    }

    bar.addEventListener('touchmove', onTouchMove, { passive: false });
    bar.addEventListener('touchend',  onTouchEnd);
  }


  async function handleAddTask() {
    if (!taskTitle || !taskStart || !taskEnd) {
      showToast(t('sch.fill_task_fields'), 'error');
      return;
    }
    if (taskEnd < taskStart) {
      showToast(t('sch.error_end_before_start'), 'error');
      return;
    }
    try {
      await Api.addScheduleTask(analysisIdRef.current!, {
        title:       taskTitle,
        responsible: taskResponsible || null,
        start_date:  taskStart,
        end_date:    taskEnd,
        progress:    0,
      } as any);
      setTaskTitle(''); setTaskResponsible('');
      setTaskStart(''); setTaskEnd('');
      await refreshBoard();
    } catch (err: any) {
      showToast(parseApiError(err) || t('sch.add_error'), 'error');
      logger.error('[SCHED] addTask', err);
    }
  }

  function parseApiError(err: any): string {
    const detail = err?.detail;
    if (!detail) return '';
    if (Array.isArray(detail)) {
      if (typeof detail[0] === 'string') {
        if (detail.includes('end_date_must_be_after_start_date')) return t('sch.error_end_before_start');
        return detail.join(', ');
      }
      const msgs: string[] = detail.map((d: any) => d?.msg ?? JSON.stringify(d));
      if (msgs.join(' ').toLowerCase().includes('end_date')) return t('sch.error_end_before_start');
      return msgs.join('; ');
    }
    if (typeof detail === 'string') return detail;
    return JSON.stringify(detail);
  }

  async function handleUpdateTask(taskId: string, fields: Record<string, any>) {
    if (fields.start_date || fields.end_date) {
      const s = fields.start_date ?? tasksRef.current.find(x => x.id === taskId)?.start_date;
      const e = fields.end_date   ?? tasksRef.current.find(x => x.id === taskId)?.end_date;
      if (s && e && e < s) { showToast(t('sch.error_end_before_start'), 'error'); return; }
    }
    try {
      await Api.updateScheduleTask(analysisIdRef.current!, taskId, fields);
      await refreshBoard();
    } catch (err: any) {
      showToast(parseApiError(err) || t('sch.add_error'), 'error');
      logger.error('[SCHED] updateTask', err);
    }
  }

  async function handleUpdateProgress(taskId: string, val: number) {
    await handleUpdateTask(taskId, { progress: val });
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await Api.deleteScheduleTask(analysisIdRef.current!, taskId);
      await refreshBoard();
    } catch (e: any) { showToast(t('common.save_error'), 'error'); }
  }

  function handleDragStart(e: React.DragEvent, taskId: string, index: number) {
    setDragId(taskId);
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }

  function handleDragEnter(index: number) {
    if (dragIndexRef.current !== index) setDropIndex(index);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropIndex(-1);
    dragIndexRef.current = -1;
  }

  async function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    const fromIdx = dragIndexRef.current;
    if (fromIdx === -1 || fromIdx === dropIdx) { handleDragEnd(); return; }
    const reordered = [...tasks];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setTasks(reordered);
    handleDragEnd();
    try {
      await Api.reorderScheduleTasks(analysisIdRef.current!, reordered.map(t => t.id));
    } catch (err: any) {
      showToast(t('sch.add_error') + ' ' + JSON.stringify(err?.detail), 'error');
      await refreshBoard();
    }
  }

  return (
    <div>
      {section === 'list' && (
        <section id="listSection">
          <h1 id="schedPageTitle">{t('sched.page_title')}</h1>
          <p id="schedPageDesc" style={{ color: 'var(--text-secondary)' }}>{t('sched.page_desc')}</p>
          <button className="btn btn-primary" id="newBtn" style={{ margin: '16px 0' }} disabled={busy} onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const a = await Api.createSchedule();
              openBoard(a.id);
            } catch (e: any) { showToast(t('common.save_error'), 'error'); }
            finally { setBusy(false); }
          }}>{t('abc.new_btn')}</button>
          {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}
          {!loading && list.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>{t('common.no_analyses')}</p>
          )}
          <div className="analysis-list-grid" id="cardsGrid">
            {list.map(a => (
              <div key={a.id} className="card">
                <EditableTitle analysisId={a.id} displayTitle={getDisplayTitle("schedule", a.title)} onRenamed={raw => setList(list.map(x => x.id === a.id ? { ...x, title: raw } : x))} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {a.task_count != null ? `${a.task_count} ${t('status.tasks')}` : '—'} · {new Date(a.created_at).toLocaleDateString(locale)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" onClick={() => openBoard(a.id)}>{t('common.open')}</button>
                  <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={async () => {
                    if (!confirm(t('common.confirm_delete'))) return;
                    try {
                      await Api.deleteSchedule(a.id);
                      if (loadDraft()?.analysisId === a.id) clearDraft();
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

      {section === 'board' && (
        <section id="boardSection">
          <button className="btn btn-secondary" id="backBtn"
            onClick={() => { setSection('list'); loadList(); }}>
            {t('common.back_list')}
          </button>
          <GuidePanel id="guideSch1" titleKey="guide.sch.step1.title" descKey="guide.sch.step1.desc" rulesKeys={['guide.sch.step1.r1','guide.sch.step1.r2','guide.sch.step1.r3','guide.sch.step1.r4']} />
          <h1 style={{ marginTop: 20, marginBottom: 4 }}>{t('sched.board_title')}</h1>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="sched-task-form">
              <input className="input" id="taskTitle" placeholder={t('sch.task_name_ph') || 'Task name'}
                value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              <input className="input" id="taskResponsible" placeholder={t('sch.responsible_ph') || 'Responsible'}
                value={taskResponsible} onChange={e => setTaskResponsible(e.target.value)} />
              <input className="input" type="date" id="taskStart"
                value={taskStart} onChange={e => setTaskStart(e.target.value)} />
              <input className="input" type="date" id="taskEnd"
                value={taskEnd} onChange={e => setTaskEnd(e.target.value)} />
              <button className="btn btn-primary" id="addTaskBtn" onClick={handleAddTask}>{t('common.add')}</button>
            </div>
          </div>

          {stats && (
            <div className="card" style={{ marginTop: 16 }} id="statsCard">
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <b>{stats.total}</b>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('sch.stat_total')}</div>
                </div>
                <div>
                  <b style={{ color: 'var(--success, #3ECF8E)' }}>{stats.completed}</b>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('sch.stat_completed')}</div>
                </div>
                <div>
                  <b style={{ color: 'var(--danger)' }}>{stats.overdue}</b>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('sch.stat_overdue')}</div>
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{t('sched.gantt_heading') || 'Gantt chart'}</h3>
              <button
                className={`btn btn-secondary${connectMode ? ' btn-active' : ''}`}
                style={{ fontSize: 12, padding: '4px 10px', ...(connectMode ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}
                onClick={() => connectMode ? exitConnectMode() : enterConnectMode()}
              >
                {connectMode ? t('sch.connect_cancel') : t('sch.connect_btn')}
              </button>
            </div>
            <div id="ganttContainer" ref={ganttRef} className="gantt-wrap"
              style={{ marginTop: 16, minHeight: 40, position: 'relative' }} />
          </div>

          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 24, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}></th>
                  <th style={{ width: 32, padding: '8px 6px', borderBottom: '1px solid var(--border)' }}></th>
                  <th style={{ width: 28, padding: '8px 4px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{t('sch.th_task')}</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{t('sch.th_responsible')}</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{t('sch.th_start')}</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{t('sch.th_end')}</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{t('sch.th_progress')}</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody id="tasksBody">
                {tasks.map((task, idx) => {
                  const rk = `${task.id}|${task.title}|${task.responsible ?? ''}|${task.start_date}|${task.end_date}|${task.progress}`;
                  const isDragging = dragId === task.id;
                  const isDropTarget = dropIndex === idx && dragId !== null && dragId !== task.id;
                  return (
                  <tr key={rk}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, idx)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      opacity: isDragging ? 0.4 : 1,
                      borderTop: isDropTarget ? '2px solid var(--accent)' : undefined,
                      transition: 'opacity 0.15s',
                    }}>
                    <td
                      draggable
                      onDragStart={e => handleDragStart(e, task.id, idx)}
                      onDragEnd={handleDragEnd}
                      style={{ padding: '4px 4px', textAlign: 'center', cursor: 'grab', color: 'var(--text-secondary)', userSelect: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: 'block', margin: 'auto', pointerEvents: 'none' }}>
                        <circle cx="4.5" cy="3.5" r="1.2" fill="currentColor"/>
                        <circle cx="9.5" cy="3.5" r="1.2" fill="currentColor"/>
                        <circle cx="4.5" cy="7" r="1.2" fill="currentColor"/>
                        <circle cx="9.5" cy="7" r="1.2" fill="currentColor"/>
                        <circle cx="4.5" cy="10.5" r="1.2" fill="currentColor"/>
                        <circle cx="9.5" cy="10.5" r="1.2" fill="currentColor"/>
                      </svg>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <StatusIcon task={task} />
                    </td>
                    <td style={{ padding: '4px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, userSelect: 'none' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '4px 6px', minWidth: 160 }}>
                      <textarea className="table-input" rows={1} defaultValue={task.title}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== task.title) handleUpdateTask(task.id, { title: v }); }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
                    </td>
                    <td style={{ padding: '4px 6px', minWidth: 110 }}>
                      <textarea className="table-input" rows={1} defaultValue={task.responsible ?? ''}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (task.responsible ?? '')) handleUpdateTask(task.id, { responsible: v || null }); }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="table-input" type="date" defaultValue={task.start_date}
                        onBlur={e => { if (e.target.value && e.target.value !== task.start_date) handleUpdateTask(task.id, { start_date: e.target.value }); }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="table-input" type="date" defaultValue={task.end_date}
                        onBlur={e => { if (e.target.value && e.target.value !== task.end_date) handleUpdateTask(task.id, { end_date: e.target.value }); }} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="table-input" type="number" min="0" max="100" style={{ width: 64 }}
                        defaultValue={task.progress}
                        onBlur={e => handleUpdateProgress(task.id, Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))} />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          title={task.progress === 100 ? t('sch.mark_undone') : t('sch.mark_done')}
                          onClick={() => handleUpdateProgress(task.id, task.progress === 100 ? 0 : 100)}
                          style={{
                            padding: '4px 8px', borderRadius: 6, border: '1px solid',
                            cursor: 'pointer', fontSize: 14, lineHeight: 1,
                            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                            background: task.progress === 100 ? 'rgba(62,207,142,0.15)' : 'transparent',
                            color: task.progress === 100 ? 'var(--success, #3ECF8E)' : 'var(--text-secondary)',
                            borderColor: task.progress === 100 ? 'var(--success, #3ECF8E)' : 'var(--border)',
                          }}
                        >✓</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleDeleteTask(task.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" id="exportBtn"
              onClick={() => Api.exportSchedule(analysisIdRef.current!, list.find(a => a.id === analysisIdRef.current)?.title ? fileSlug(list.find(a => a.id === analysisIdRef.current)!.title, list.find(a => a.id === analysisIdRef.current)!.created_at) : undefined)}>
              {t('common.export_excel')}
            </button>
            <button className="btn btn-secondary" id="deleteBtn" style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(t('common.confirm_delete'))) return;
                try {
                  await Api.deleteSchedule(analysisIdRef.current!);
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
