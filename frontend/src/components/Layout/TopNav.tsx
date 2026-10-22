import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSidebar } from '@/context/SidebarContext';
import { useLang } from '@/context/LangContext';
import { useToast } from '@/context/ToastContext';
import { Api } from '@/api/api';
import { t } from '@/i18n/i18n';
import type { Lang } from '@/i18n/i18n';
import { IconMenu, IconLogo, IconMoon, IconSun } from '@/components/Icons';
import { applyTheme, getCurrentTheme, getStoredTheme, type Theme } from '@/utils/theme';

export function TopNav() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toggle } = useSidebar();
  const { lang, switchLang } = useLang();
  const { showToast } = useToast();
  const [theme, setTheme] = useState<Theme>(getCurrentTheme());

  // First visit in this browser: take the theme saved in the account.
  useEffect(() => {
    if (!user || getStoredTheme()) return;
    const serverTheme: Theme = user.theme === 'light' ? 'light' : 'dark';
    applyTheme(serverTheme);
    setTheme(serverTheme);
  }, [user?.id]);

  async function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
    try {
      await Api.updateAccount({ theme: next });
    } catch {
      showToast(t('settings.theme_not_saved'), 'error');
    }
  }

  const userName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : '';

  const themeLabel = theme === 'light' ? t('theme.to_dark') : t('theme.to_light');

  return (
    <nav className="topnav">
      <button className="topnav-burger" id="topBurger" aria-label="Menu" onClick={toggle}>
        <IconMenu size={22} />
      </button>
      <div
        className="topnav-logo"
        id="topNavLogo"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/dashboard')}
      >
        <span className="brand-mark"><IconLogo size={18} /></span>
        <span className="topnav-logo-text">Business Analytics</span>
      </div>
      <div className="topnav-right">
        <span className="topnav-user" id="topNavUser">{userName}</span>
        <button
          className="topnav-theme"
          id="themeToggleBtn"
          title={themeLabel}
          aria-label={themeLabel}
          onClick={toggleTheme}
        >
          {theme === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
        </button>
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
