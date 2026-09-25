import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Api } from '@/api/api';
import { t } from '@/i18n/i18n';

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  useEffect(() => {
    Api.me().then(u => {
      const serverTheme = (u as any).theme === 'light' ? 'light' : 'dark';
      const localTheme = localStorage.getItem('theme');
      if (!localTheme) {
        applyTheme(serverTheme);
        setTheme(serverTheme);
      } else {
        setTheme(localTheme === 'light' ? 'light' : 'dark');
      }
    }).catch(() => {
      const localTheme = localStorage.getItem('theme');
      if (localTheme) setTheme(localTheme === 'light' ? 'light' : 'dark');
    });
  }, []);

  async function switchTheme(th: string) {
    applyTheme(th);
    setTheme(th);
    try {
      await Api.updateAccount({ theme: th } as any);
    } catch (e) {
      console.error('[switchTheme] API error:', e);
      showToast(t('settings.theme_not_saved'), 'error');
    }
  }

  async function handleChangePassword() {
    if (newPass.length < 8) { showToast(t('settings.pass_too_short'), 'error'); return; }
    try {
      await Api.changePassword({ old_password: oldPass, new_password: newPass });
      showToast(t('settings.pass_changed'));
      setOldPass('');
      setNewPass('');
    } catch (err: any) {
      showToast(err?.detail === 'incorrect_old_password' ? t('settings.pass_wrong') : t('settings.pass_error'), 'error');
    }
  }

  async function handleDeleteAccount() {
    if (!confirm(t('settings.delete_confirm1'))) return;
    if (!confirm(t('settings.delete_confirm2'))) return;
    try {
      await Api.deleteAccount();
      logout();
    } catch {
      showToast(t('settings.delete_error'), 'error');
    }
  }

  return (
    <div className="page-wrap">
      <h1 className="page-title" id="settingsPageTitle">{t('settings.page_title')}</h1>

      <div className="card" style={{ marginTop: 20, maxWidth: 640 }}>
        <h3 id="settingsPassTitle">{t('settings.change_pass_title')}</h3>
        <div className="field">
          <label id="settingsCurrPassLbl">{t('settings.curr_pass_lbl')}</label>
          <input className="input" id="oldPassword" type="password" value={oldPass} onChange={e => setOldPass(e.target.value)} />
        </div>
        <div className="field">
          <label id="settingsNewPassLbl">{t('settings.new_pass_lbl')}</label>
          <input className="input" id="newPassword" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} minLength={8} />
        </div>
        <button className="btn btn-primary" id="changePasswordBtn" onClick={handleChangePassword}>
          {t('settings.save_pass_btn')}
        </button>
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 640 }}>
        <h3 id="settingsThemeTitle">{t('settings.theme_title')}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }} id="settingsThemeDesc">
          {t('settings.theme_desc_lbl')}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" id="themeDarkBtn" style={{ flex: 1 }} onClick={() => switchTheme('dark')}>
            {t('settings.dark_btn')}
          </button>
          <button className="btn btn-secondary" id="themeLightBtn" style={{ flex: 1 }} onClick={() => switchTheme('light')}>
            {t('settings.light_btn')}
          </button>
        </div>
        <p id="themeCurrentLabel" style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>
          {t(theme === 'light' ? 'settings.theme_current_light' : 'settings.theme_current_dark')}
        </p>
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 640, borderColor: 'var(--danger)' }}>
        <h3 style={{ color: 'var(--danger)' }} id="settingsDeleteTitle">{t('settings.delete_title')}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }} id="settingsDeleteDesc">
          {t('settings.delete_desc')}
        </p>
        <button className="btn btn-danger" id="deleteAccountBtn" onClick={handleDeleteAccount}>
          {t('settings.delete_btn')}
        </button>
      </div>
    </div>
  );
}
