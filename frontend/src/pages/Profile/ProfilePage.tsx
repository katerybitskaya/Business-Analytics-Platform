import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Api } from '@/api/api';
import { t } from '@/i18n/i18n';
import type { User } from '@/types/api.types';

const BASE_URL = '';

const INDUSTRIES = [
  { value: 'Sales, Procurement',         key: 'industry.sales' },
  { value: 'Finance, Accounting, Banks', key: 'industry.finance' },
  { value: 'Production',                 key: 'industry.production' },
  { value: 'Logistics',                  key: 'industry.logistics' },
  { value: 'Marketing, Advertising, PR', key: 'industry.marketing' },
  { value: 'Construction',               key: 'industry.construction' },
  { value: 'Education',                  key: 'industry.education' },
  { value: 'Medicine',                   key: 'industry.medicine' },
  { value: 'Transport',                  key: 'industry.transport' },
  { value: 'IT & Technology',            key: 'industry.it' },
  { value: 'Retail / Wholesale',         key: 'industry.retail' },
  { value: 'Services',                   key: 'industry.services' },
];

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [position, setPosition] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    try {
      const u = await Api.me();
      setUser(u);
      setFirstName(u.first_name || '');
      setLastName(u.last_name || '');
      setEmail(u.email || '');
      setCurrentEmail(u.email || '');
      if (u.profile) {
        setCompanyName(u.profile.company_name || '');
        setIndustry(u.profile.industry || '');
        setCompanySize(u.profile.company_size || '');
        setPosition(u.profile.position || '');
      }
    } catch {
      showToast(t('common.load_error') || 'Failed to load profile', 'error');
    }
  }

  async function handleSaveAccount() {
    try {
      await Api.updateAccount({ first_name: firstName, last_name: lastName });
      if (email && email !== currentEmail) {
        const updated = await Api.changeEmail(email);
        setCurrentEmail(updated.email);
        setEmail(updated.email);
        showToast(t('profile.email_changed'));
      } else {
        showToast(t('profile.account_saved'));
      }
      await refreshUser();
    } catch (err: any) {
      if (err?.detail === 'email_taken') showToast(t('profile.email_taken'), 'error');
      else showToast(t('common.save_error'), 'error');
    }
  }

  async function handleSaveProfile() {
    try {
      await Api.updateProfile({
        company_name: companyName || null,
        industry: industry || null,
        company_size: companySize || null,
        position: position || null,
      });
      showToast(t('profile.profile_saved'));
      await refreshUser();
    } catch {
      showToast(t('common.save_error'), 'error');
    }
  }

  async function handleUploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { showToast(t('profile.avatar_format'), 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast(t('profile.avatar_size'), 'error'); return; }
    try {
      const updated = await Api.uploadAvatar(file);
      setUser(updated);
      showToast(t('profile.avatar_updated'));
    } catch (err: any) {
      showToast(t('profile.avatar_upload_error') + ' ' + (err?.message || err), 'error');
    }
    e.target.value = '';
  }

  async function handleDeleteAvatar() {
    try {
      const updated = await Api.deleteAvatar();
      setUser(updated);
      showToast(t('profile.avatar_deleted'));
    } catch {
      showToast(t('profile.avatar_delete_error'), 'error');
    }
  }

  const initials = user
    ? ((user.first_name?.[0] || '\xB7') + (user.last_name?.[0] || '\xB7')).toUpperCase()
    : '\xB7\xB7';

  return (
    <div className="page-wrap">
      <h1 className="page-title">{t('profile.page_title')}</h1>

      <div className="profile-grid" style={{ alignItems: 'start' }}>

        <div>
          <div className="card">
            <h3>{t('profile.photo_title')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 0 }}>
              <div id="avatarPreview" style={{
                width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' as any,
                border: '2px solid var(--border)', background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 700, color: 'var(--accent)',
                flexShrink: 0, overflow: 'hidden',
              }}>
                {user?.photo
                  ? <img src={BASE_URL + user.photo} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span id="avatarInitials">{initials}</span>}
              </div>
              <div className="avatar-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input ref={fileRef} id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleUploadAvatar} />
                <button className="btn btn-primary" id="uploadAvatarBtn" style={{ width: 'fit-content' }} onClick={() => fileRef.current?.click()}>
                  {t('profile.upload_btn')}
                </button>
                {user?.photo && (
                  <button className="btn btn-danger" id="deleteAvatarBtn" style={{ width: 'fit-content' }} onClick={handleDeleteAvatar}>
                    {t('profile.remove_btn')}
                  </button>
                )}
                <span className="avatar-hint" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('profile.photo_hint')}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h3>{t('profile.personal_title')}</h3>
            <div className="field">
              <label>{t('profile.first_name')}</label>
              <input className="input" id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('profile.last_name')}</label>
              <input className="input" id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('profile.email_lbl')}</label>
              <input className="input" id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary" id="saveAccountBtn" onClick={handleSaveAccount}>{t('common.save')}</button>
          </div>
        </div>

        <div className="card">
          <h3>{t('profile.company_title')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>{t('profile.company_desc')}</p>
          <div className="field">
            <label>{t('profile.company_name')}</label>
            <input className="input" id="companyName" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('profile.industry_lbl')}</label>
            <select className="input" id="industry" value={industry} onChange={e => setIndustry(e.target.value)}>
              <option value="">{t('profile.not_selected')}</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.value} value={ind.value}>{t(ind.key)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('profile.size_lbl')}</label>
            <select className="input" id="companySize" value={companySize} onChange={e => setCompanySize(e.target.value)}>
              <option value="">{t('profile.not_selected')}</option>
              <option value="small">{t('profile.size_small')}</option>
              <option value="medium">{t('profile.size_medium')}</option>
              <option value="large">{t('profile.size_large')}</option>
            </select>
          </div>
          <div className="field">
            <label>{t('profile.position_lbl')}</label>
            <input className="input" id="position" value={position} onChange={e => setPosition(e.target.value)} />
          </div>
          <button className="btn btn-primary" id="saveProfileBtn" onClick={handleSaveProfile}>{t('common.save')}</button>
        </div>

      </div>
    </div>
  );
}
