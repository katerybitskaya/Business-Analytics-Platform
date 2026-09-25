import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { t } from '@/i18n/i18n';
import { useSidebar } from '@/context/SidebarContext';

const ANALYSES = [
  { to: '/analyses/swot',              key: 'analysis.swot' },
  { to: '/analyses/abc-xyz',           key: 'analysis.abc_xyz' },
  { to: '/analyses/eisenhower',        key: 'analysis.eisenhower' },
  { to: '/analyses/schedule',          key: 'analysis.schedule' },
  { to: '/analyses/punktowa-dostawcy', key: 'analysis.punktowa_dos' },
  { to: '/analyses/punktowa-odbiorcy', key: 'analysis.punktowa_odb' },
  { to: '/analyses/audyt',             key: 'analysis.audyt' },
];

export function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen, toggle } = useSidebar();

  const onAnalysisPage = location.pathname.startsWith('/analyses/');
  const [groupOpen, setGroupOpen] = useState(onAnalysisPage);

  useEffect(() => {
    if (onAnalysisPage) setGroupOpen(true);
  }, [onAnalysisPage]);

  function navTo(path: string) {
    navigate(path);
    if (isOpen) toggle();
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside id="sidebar" className={'sidebar' + (isOpen ? ' open' : '')}>
      <div className="nav-section-label" id="nlMain">{t('nav.main')}</div>

      <div
        className={'nav-item' + (isActive('/dashboard') ? ' active' : '')}
        onClick={() => navTo('/dashboard')}
      >
        <span className="nav-icon">🏠</span>
        <span id="nlHome">{t('nav.home')}</span>
      </div>

      <div className={'nav-group' + (groupOpen ? ' open' : '')} id="navGroupAnalyses">
        <div
          className="nav-item"
          id="nlAnalysesToggle"
          onClick={e => { e.stopPropagation(); setGroupOpen(v => !v); }}
        >
          <span className="nav-icon">📁</span>
          <span id="nlAnalyses">{t('nav.my_analyses')}</span>
          <span className="nav-arrow">▶</span>
        </div>
        <div className="nav-submenu">
          {ANALYSES.map(a => (
            <div
              key={a.to}
              className={'nav-item' + (isActive(a.to) ? ' active' : '')}
              onClick={() => navTo(a.to)}
            >
              <span>{t(a.key)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="nav-spacer" />
      <div className="nav-divider" />

      <div
        className={'nav-item' + (isActive('/profile') ? ' active' : '')}
        onClick={() => navTo('/profile')}
      >
        <span className="nav-icon">👤</span>
        <span id="nlProfile">{t('nav.profile')}</span>
      </div>

      <div
        className={'nav-item' + (isActive('/settings') ? ' active' : '')}
        onClick={() => navTo('/settings')}
      >
        <span className="nav-icon">⚙️</span>
        <span id="nlSettings">{t('nav.settings')}</span>
      </div>

      <div className="nav-item" id="logoutBtn" onClick={logout}>
        <span className="nav-icon">🚪</span>
        <span id="nlLogout">{t('nav.logout')}</span>
      </div>
    </aside>
  );
}
