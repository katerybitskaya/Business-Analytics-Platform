import { useState } from 'react';
import { t } from '@/i18n/i18n';

interface GuidePanelProps {
  id: string;
  titleKey: string;
  descKey: string;
  rulesKeys: string[];
}

export function GuidePanel({ id, titleKey, descKey, rulesKeys }: GuidePanelProps) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('guide_' + id) === '1'; } catch { return false; }
  });
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem('guide_' + id, next ? '1' : '0'); } catch {}
  }
  return (
    <div className="guide-panel">
      <button className="guide-toggle" id={id + 'Btn'} onClick={toggle}>
        💡 {t('guide.toggle_label')} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="guide-body" id={id + 'Body'}>
          <strong>{t(titleKey)}</strong>
          <p style={{ margin: '4px 0 8px' }}>{t(descKey)}</p>
          {rulesKeys.length > 0 && (
            <>
              <strong>{t('guide.rules_header')}:</strong>
              <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
                {rulesKeys.map(k => <li key={k}>{t(k)}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
