import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSidebar } from '@/context/SidebarContext';
import { useLang } from '@/context/LangContext';
import type { Lang } from '@/i18n/i18n';

export function TopNav() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toggle } = useSidebar();
  const { lang, switchLang } = useLang();

  const userName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : '';

  return (
    <nav className="topnav">
      <button className="topnav-burger" id="topBurger" aria-label="Menu" onClick={toggle}>
        ☰
      </button>
      <div
        className="topnav-logo"
        id="topNavLogo"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/dashboard')}
      >
        📊 Business Analytics
      </div>
      <div className="topnav-right">
        <span className="topnav-user" id="topNavUser">{userName}</span>
        <div className="topnav-lang">
          {(['en', 'pl', 'ru'] as Lang[]).map(l => (
            <button
              key={l}
              data-lang-btn={l}
              className={lang === l ? 'lang-active' : ''}
              onClick={() => switchLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
