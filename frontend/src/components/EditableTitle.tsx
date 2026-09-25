import { useRef, useState } from 'react';
import { Api } from '@/api/api';
import { useToast } from '@/context/ToastContext';
import { t } from '@/i18n/i18n';

interface Props {
  analysisId: string;
  displayTitle: string;
  onRenamed: (raw: string) => void;
}

export default function EditableTitle({ analysisId, displayTitle, onRenamed }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setValue(displayTitle);
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }

  async function save() {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === displayTitle) return;
    try {
      const res = await Api.renameAnalysis(analysisId, trimmed);
      onRenamed(res.title);
    } catch (e: any) {
      if (e?.status === 409) {
        showToast(t('common.title_taken'), 'error');
      } else {
        showToast(t('common.save_error'), 'error');
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', fontSize: 15, fontWeight: 600,
          background: 'var(--bg-input)', border: '1.5px solid var(--accent)',
          borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
      <h3 style={{ margin: 0, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{displayTitle}</h3>
      <button
        onClick={startEdit}
        title={t('common.rename')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
          color: 'var(--text-secondary)', padding: '2px 2px', lineHeight: 1,
          fontSize: 13, opacity: 0.6, marginTop: 2,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
      >
        ✎
      </button>
    </div>
  );
}
