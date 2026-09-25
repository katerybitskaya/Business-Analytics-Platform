import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Api } from '@/api/api';
import { t, getLang } from '@/i18n/i18n';
import { getDisplayTitle, typeLabel } from '@/utils/analysisTitle';
import type { AnalysisOut } from '@/types/api.types';

const LIVE_TYPES = new Set(['eisenhower', 'schedule']);

function typeToPath(type: string): string {
  if (type === 'swot' || type === 'tows' || type === 'swot-tows') return '/analyses/swot';
  return `/analyses/${type}`;
}

function analysisLabel(a: AnalysisOut): string {
  if (LIVE_TYPES.has(a.type)) {
    return a.task_count != null ? `${a.task_count} ${t('status.tasks')}` : '—';
  }
  return a.status === 'in_progress' ? t('status.in_progress')
       : a.status === 'completed'   ? t('status.completed')
       : a.status;
}

const CARDS = [
  { href: '/analyses/swot',              icon: '🧭', title: 'SWOT / TOWS',       descKey: 'card.swot.desc' },
  { href: '/analyses/abc-xyz',           icon: '📦', title: 'ABC / XYZ',         descKey: 'card.abc.desc' },
  { href: '/analyses/eisenhower',        icon: '🗂️', titleKey: 'analysis.eisenhower', descKey: 'card.eis.desc' },
  { href: '/analyses/schedule',          icon: '📅', titleKey: 'analysis.schedule',   descKey: 'card.sch.desc' },
  { href: '/analyses/punktowa-dostawcy', icon: '🚚', titleKey: 'analysis.punktowa_dos', descKey: 'card.dos.desc' },
  { href: '/analyses/punktowa-odbiorcy', icon: '🤝', titleKey: 'analysis.punktowa_odb', descKey: 'card.odb.desc' },
  { href: '/analyses/audyt',             icon: '📋', titleKey: 'analysis.audyt',         descKey: 'card.aud.desc' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<AnalysisOut[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { loadRecent(); }, []);

  async function loadRecent() {
    const results = await Promise.allSettled([
      Api.listSwot(), Api.listAbcXyz(), Api.listEisenhower(),
      Api.listSchedule(), Api.listPunktowa(), Api.listAudyt(),
    ]);
    const collected: AnalysisOut[] = [];
    let anyError = false;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        collected.push(...r.value);
      } else {
        anyError = true;
      }
    }
    if (collected.length === 0 && anyError) {
      setLoadError(true);
    } else {
      const sorted = collected
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8);
      setRecent(sorted);
      if (anyError) console.warn('[Dashboard] Some lists failed to load');
    }
  }

  const lang = getLang();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'pl' ? 'pl-PL' : 'en-GB';
  const showBanner = user && !user.profile?.industry;

  return (
    <div>
      <p className="dash-greeting" id="greeting">
        {t('dash.greeting')}{user ? `, ${user.first_name}!` : '!'}
      </p>

      {showBanner && (
        <div className="banner" id="profileBanner" style={{ display: 'flex' }}>
          <span id="bannerText">{t('dash.profile_banner')}</span>
          <a className="btn btn-secondary" href="#" id="bannerBtn"
            onClick={e => { e.preventDefault(); navigate('/profile'); }}>
            {t('dash.profile_btn')}
          </a>
        </div>
      )}

      <div className="section-header" id="dashAnalysesTitle">{t('dash.analyses')}</div>
      <div className="quick-grid">
        {CARDS.map(card => (
          <div key={card.href} className="card quick-card" onClick={() => navigate(card.href)}>
            <div className="quick-card-icon">{card.icon}</div>
            <h3>{('title' in card) ? card.title : t((card as any).titleKey)}</h3>
            <p id={`card${card.href.split('/').pop()}Desc`}>{t(card.descKey)}</p>
          </div>
        ))}
      </div>

      <div className="section-header" id="dashRecentTitle" style={{ marginTop: 0 }}>{t('dash.recent')}</div>
      <div id="recentContainer" style={{ marginTop: 10 }}>
        {recent === null && !loadError && (
          <p style={{ color: 'var(--text-secondary)', padding: '16px 4px' }}>{t('dash.loading')}</p>
        )}
        {loadError && (
          <p style={{ color: 'var(--danger)', padding: '16px 4px' }}>{t('dash.load_error')}</p>
        )}
        {recent !== null && recent.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', padding: '16px 4px' }}>{t('dash.no_analyses')}</p>
        )}
        {recent && recent.length > 0 && (
          <div className="card" style={{ padding: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            <table id="recentTable">
              <thead>
                <tr>
                  <th>{t('table.title')}</th>
                  <th>{t('table.type')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.date')}</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {recent.map(a => (
                  <tr key={a.id}
                    onClick={() => navigate(typeToPath(a.type), { state: { openId: a.id } })}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td>{getDisplayTitle(a.type, a.title) || '—'}</td>
                    <td>{typeLabel(a.type)}</td>
                    <td>{analysisLabel(a)}</td>
                    <td>{new Date(a.created_at).toLocaleDateString(locale)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingRight: 12 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
