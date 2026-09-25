import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t, getLang } from '@/i18n/i18n';

const RP_I18N: Record<string, Record<string, string>> = {
  subtitle:  { en: "Enter your new password", pl: "Wprowadź nowe hasło", ru: "Введите новый пароль" },
  lbl_pwd:   { en: "New password (min. 8 characters)", pl: "Nowe hasło (min. 8 znaków)", ru: "Новый пароль (минимум 8 символов)" },
  lbl_pwd2:  { en: "Confirm password", pl: "Powtórz hasło", ru: "Подтвердите пароль" },
  btn:       { en: "Set New Password", pl: "Ustaw nowe hasło", ru: "Установить пароль" },
  mismatch:  { en: "Passwords do not match", pl: "Hasła nie są zgodne", ru: "Пароли не совпадают" },
  done:      { en: "Password updated successfully!", pl: "Hasło zostało zmienione!", ru: "Пароль успешно обновлён!" },
  done_btn:  { en: "Go to Sign In", pl: "Przejdź do logowania", ru: "Перейти ко входу" },
  err_token: { en: "Reset link is invalid or has expired.", pl: "Link wygasł lub jest nieprawidłowy.", ru: "Ссылка устарела или недействительна." },
  no_token:  { en: "No reset token found in the link.", pl: "Brak tokenu w linku.", ru: "Токен не найден в ссылке." },
};

function rpT(key: string) {
  const lang = getLang();
  const entry = RP_I18N[key];
  return entry ? (entry[lang] || entry['en']) : key;
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [status, setStatus] = useState<'form' | 'done' | 'error'>('form');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd !== pwd2) { showToast(rpT('mismatch'), 'error'); return; }
    try {
      await Api.confirmPasswordReset(token!, pwd);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, margin: '0 16px', padding: 32 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Business Analytics</h2>

        {!token && <p>{rpT('no_token')}</p>}

        {token && status === 'form' && (
          <form onSubmit={handleSubmit}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{rpT('subtitle')}</p>
            <label className="label">{rpT('lbl_pwd')}</label>
            <input className="input" type="password" value={pwd} onChange={e => setPwd(e.target.value)} minLength={8} required />
            <label className="label" style={{ marginTop: 12 }}>{rpT('lbl_pwd2')}</label>
            <input className="input" type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} required />
            <button className="btn btn-primary" type="submit" style={{ width: '100%', marginTop: 20 }}>{rpT('btn')}</button>
          </form>
        )}

        {status === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--success)', marginBottom: 20 }}>{rpT('done')}</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>{rpT('done_btn')}</button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', marginBottom: 20 }}>{rpT('err_token')}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>{t('auth.link.back')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
