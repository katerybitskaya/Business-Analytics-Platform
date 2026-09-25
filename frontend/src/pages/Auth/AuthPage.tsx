import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { t, getLang, setLang } from '@/i18n/i18n';

type FormName = 'login' | 'register' | 'forgot';

export default function AuthPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormName>('login');
  const [lang, setLangState] = useState(getLang());

  const [loginField, setLoginField] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');

  function switchLang(l: string) {
    setLang(l as any);
    setLangState(l as 'en' | 'pl' | 'ru');
  }

  function showForm(name: FormName) {
    setForm(name);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { Api } = await import('@/api/api');
      const tokens = await Api.login({ login: loginField, password: loginPassword });
      await login(tokens);
      navigate('/dashboard');
    } catch (err: any) {
      const key = err?.detail === 'invalid_credentials' ? 'auth.toast.invalid_creds' : 'auth.toast.login_error';
      showToast(t(key), 'error');
    }
  }

  async function handleGuestLogin() {
    try {
      const { Api } = await import('@/api/api');
      const tokens = await Api.login({ login: 'guest', password: 'guest12345' });
      await login(tokens);
      navigate('/dashboard');
    } catch {
      showToast(t('auth.toast.login_error'), 'error');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { Api } = await import('@/api/api');
      await Api.register({ first_name: regFirstName, last_name: regLastName, email: regEmail, username: regUsername, password: regPassword });
      showToast(t('auth.toast.register_ok'), 'success');
      setLoginField(regEmail);
      showForm('login');
    } catch (err: any) {
      const key = err?.detail === 'email_already_registered' ? 'auth.toast.email_taken'
        : err?.detail === 'username_already_taken' ? 'auth.toast.login_taken'
        : 'auth.toast.register_error';
      showToast(t(key), 'error');
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { Api } = await import('@/api/api');
      await Api.requestPasswordReset(forgotEmail);
      showToast(t('auth.toast.reset_sent'), 'success');
      showForm('login');
    } catch {
      showToast(t('auth.toast.reset_error'), 'error');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">

        <div className="auth-lang">
          <span className="lang-icon">🌐</span>
          <button id="langEN" className={lang === 'en' ? 'active' : ''} onClick={() => switchLang('en')}>EN</button>
          <button id="langPL" className={lang === 'pl' ? 'active' : ''} onClick={() => switchLang('pl')}>PL</button>
          <button id="langRU" className={lang === 'ru' ? 'active' : ''} onClick={() => switchLang('ru')}>RU</button>
        </div>

        <div className="auth-logo">📊 Business Analytics</div>
        <div className="auth-subtitle">{t(`auth.subtitle.${form}`)}</div>

        {form === 'login' && (
          <form id="loginForm" onSubmit={handleLogin}>
            <div className="field">
              <label id="lbl_email_or_login">{t('auth.label.email_or_login')}</label>
              <input className="input" id="loginField" type="text" value={loginField} onChange={e => setLoginField(e.target.value)} required />
              <div className="field-error" id="loginFieldError"></div>
            </div>
            <div className="field">
              <label id="lbl_password">{t('auth.label.password')}</label>
              <input className="input" id="loginPassword" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" id="btn_signin" style={{ width: '100%' }}>{t('auth.btn.signin')}</button>
            <div className="auth-divider">{t('auth.divider.or')}</div>
            <button className="btn btn-secondary" type="button" id="btn_guest_login" style={{ width: '100%' }} onClick={handleGuestLogin}>{t('auth.btn.guest_login')}</button>
            <div className="auth-switch">
              <a href="#" id="showForgot" onClick={e => { e.preventDefault(); showForm('forgot'); }}>{t('auth.link.forgot')}</a>
              {' · '}
              <a href="#" id="showRegister" onClick={e => { e.preventDefault(); showForm('register'); }}>{t('auth.link.create')}</a>
            </div>
          </form>
        )}

        {form === 'register' && (
          <form id="registerForm" onSubmit={handleRegister}>
            <div className="field">
              <label id="lbl_first_name">{t('auth.label.first_name')}</label>
              <input className="input" id="regFirstName" type="text" value={regFirstName} onChange={e => setRegFirstName(e.target.value)} required />
            </div>
            <div className="field">
              <label id="lbl_last_name">{t('auth.label.last_name')}</label>
              <input className="input" id="regLastName" type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)} required />
            </div>
            <div className="field">
              <label id="lbl_email">{t('auth.label.email')}</label>
              <input className="input" id="regEmail" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label id="lbl_login">{t('auth.label.login')}</label>
              <input className="input" id="regUsername" type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)} required autoComplete="username" />
            </div>
            <div className="field">
              <label id="lbl_password_min">{t('auth.label.password_min')}</label>
              <input className="input" id="regPassword" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} minLength={8} required />
            </div>
            <button className="btn btn-primary" type="submit" id="btn_signup" style={{ width: '100%' }}>{t('auth.btn.signup')}</button>
            <div className="auth-switch">
              <a href="#" id="showLogin1" onClick={e => { e.preventDefault(); showForm('login'); }}>{t('auth.link.have_account')}</a>
            </div>
          </form>
        )}

        {form === 'forgot' && (
          <form id="forgotForm" onSubmit={handleForgot}>
            <div className="field">
              <label id="lbl_email2">{t('auth.label.email')}</label>
              <input className="input" id="forgotEmail" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" id="btn_send_link" style={{ width: '100%' }}>{t('auth.btn.send_link')}</button>
            <div className="auth-switch">
              <a href="#" id="showLogin2" onClick={e => { e.preventDefault(); showForm('login'); }}>{t('auth.link.back')}</a>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
