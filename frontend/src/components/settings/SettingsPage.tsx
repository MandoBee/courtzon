import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../ui/Toast';

interface SettingsSection {
  id: string;
  label: string;
  icon: string;
  component: React.ReactNode;
}

interface SettingsPageProps {
  title: string;
  sections: SettingsSection[];
  onSave?: () => Promise<void>;
  hasChanges?: boolean;
  onReset?: () => void;
  onImport?: (data: any) => void;
  onExport?: () => any;
  helpText?: string;
}

export default function SettingsPage({ title, sections, onSave, hasChanges, onReset, onImport, onExport, helpText }: SettingsPageProps) {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const activeSection = searchParams.get('section') || sections[0]?.id || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = sections.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) || s.id.includes(search.toLowerCase())
  );

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { onImport?.(JSON.parse(ev.target?.result as string)); showToast('Settings imported!', 'success'); } catch { showToast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
  }, [onImport, showToast]);

  // Unsaved changes detection
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="hidden md:block w-56 shrink-0 space-y-1">
        <input type="text" placeholder="Search settings..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full mb-3 px-3 py-2 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg placeholder:text-[var(--color-text-muted)]" />
        {filtered.map(s => (
          <button key={s.id} onClick={() => setSearchParams({ section: s.id })}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg text-left transition-colors ${activeSection === s.id ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'}`}>
            <span>{s.icon}</span><span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{title}</h1>
            {sections.find(s => s.id === activeSection) && (
              <p className="text-sm text-[var(--color-text-muted)]">{sections.find(s => s.id === activeSection)?.label}</p>
            )}
          </div>
          <div className="flex gap-2">
            {onExport && <button onClick={() => { const data = onExport(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-settings.json`; a.click(); }} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg">Export</button>}
            {onImport && <><input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} /><button onClick={handleImport} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg">Import</button></>}
            {onReset && <button onClick={onReset} className="px-3 py-1.5 text-xs text-[var(--color-error)] border border-[var(--color-border)] rounded-lg">Reset</button>}
            {onSave && <button onClick={onSave} disabled={!hasChanges} className="px-4 py-1.5 text-xs text-white bg-[var(--color-primary)] rounded-lg disabled:opacity-50">{hasChanges ? 'Save Changes' : 'Saved'}</button>}
          </div>
        </div>

        {/* Mobile section selector */}
        <div className="md:hidden flex gap-1 overflow-x-auto pb-2">
          {filtered.map(s => (
            <button key={s.id} onClick={() => setSearchParams({ section: s.id })}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-full ${activeSection === s.id ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>{s.icon} {s.label}</button>
          ))}
        </div>

        {/* Help text */}
        {helpText && <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs p-3 rounded-lg">{helpText}</div>}

        {/* Active section */}
        {sections.find(s => s.id === activeSection)?.component || (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Select a section to configure.</p>
        )}
      </div>
    </div>
  );
}
