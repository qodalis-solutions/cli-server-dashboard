import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Modal from '../../components/Modal';
import { useApi } from '../../hooks/useApi';
import { getConfig, updateConfig } from '../../api/config';
import type { ConfigSection, ConfigEntry } from '../../types';

type SettingsMap = Record<string, Record<string, string | number | boolean | string[]>>;

function TagInput({ value, onChange, disabled }: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState('');

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag));
  }

  return (
    <div className={`flex flex-wrap gap-1.5 p-2 bg-white/[0.06] border border-white/[0.1] rounded-lg min-h-[38px] ${disabled ? 'opacity-50' : ''}`}>
      {value.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs font-mono">
          {tag}
          {!disabled && (
            <button onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-white ml-0.5">×</button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          placeholder="Add value..."
          className="bg-transparent text-xs text-slate-300 placeholder-slate-600 focus:outline-none min-w-[80px]"
        />
      )}
    </div>
  );
}

function SettingField({ entry, value, onChange }: {
  entry: ConfigEntry;
  value: string | number | boolean | string[];
  onChange: (v: string | number | boolean | string[]) => void;
}) {
  const disabled = !entry.mutable;

  if (entry.type === 'boolean') {
    const checked = value as boolean;
    return (
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-indigo-500' : 'bg-slate-600'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    );
  }

  if (entry.type === 'string[]') {
    return (
      <TagInput
        value={value as string[]}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (entry.type === 'number') {
    return (
      <input
        type="number"
        value={value as number}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full max-w-xs px-3 py-1.5 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    );
  }

  return (
    <input
      type="text"
      value={value as string}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className="w-full max-w-sm px-3 py-1.5 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

export default function ConfigPage() {
  const { data, loading, error, refetch } = useApi(getConfig, []);
  const [dirty, setDirty] = useState<SettingsMap>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => {
    setDirty({});
  }, [data]);

  function getValue(section: ConfigSection, entry: ConfigEntry) {
    return dirty[section.name]?.[entry.key] ?? entry.value;
  }

  function handleChange(sectionName: string, key: string, value: string | number | boolean | string[]) {
    setDirty(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        [key]: value,
      },
    }));
  }

  const isDirty = Object.keys(dirty).some(sectionName => {
    return Object.keys(dirty[sectionName] ?? {}).length > 0;
  });

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    let anyRestartRequired = false;
    try {
      for (const [sectionName, settings] of Object.entries(dirty)) {
        if (Object.keys(settings).length === 0) continue;
        const result = await updateConfig(sectionName, settings);
        if (result.restartRequired) anyRestartRequired = true;
        setSavedSection(sectionName);
      }
      setRestartRequired(anyRestartRequired);
      setDirty({});
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Configuration"
        subtitle="Server settings and runtime configuration"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => { setConfirmOpen(true); setSaveError(null); }}
              disabled={!isDirty || saving}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {loading && <div className="text-slate-400 text-sm">Loading configuration...</div>}
        {error && <div className="text-red-400 text-sm">Error: {error}</div>}

        {restartRequired && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm flex items-center gap-2">
            <span>⚠</span>
            <span>Some settings require a server restart to take effect.</span>
          </div>
        )}

        {saveError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {saveError}
          </div>
        )}

        {!loading && data && data.sections.map((section: ConfigSection) => (
          <div key={section.name} className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <h3 className="text-sm font-semibold text-white capitalize">{section.name}</h3>
              <Badge variant={section.mutable ? 'success' : 'neutral'}>
                {section.mutable ? 'Mutable' : 'Read-only'}
              </Badge>
              {savedSection === section.name && (
                <span className="text-xs text-green-400 ml-auto">Saved</span>
              )}
            </div>
            <div className="divide-y divide-white/[0.04]">
              {section.settings.map((entry: ConfigEntry) => (
                <div
                  key={entry.key}
                  className={`px-5 py-3 flex items-start gap-6 ${!entry.mutable ? 'opacity-60' : ''}`}
                >
                  <div className="w-48 shrink-0">
                    <div className="text-sm text-slate-300 font-mono">{entry.key}</div>
                    {entry.description && (
                      <div className="text-[11px] text-slate-500 mt-0.5">{entry.description}</div>
                    )}
                    {!entry.mutable && (
                      <span className="text-[10px] text-slate-600">read-only</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <SettingField
                      entry={entry}
                      value={getValue(section, entry)}
                      onChange={val => handleChange(section.name, entry.key, val)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Save Configuration"
        actions={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 text-sm bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm Save'}
            </button>
          </>
        }
      >
        <p>Are you sure you want to save the configuration changes? Some settings may require a server restart.</p>
        {saveError && <p className="text-red-400 text-xs mt-2">{saveError}</p>}
      </Modal>
    </div>
  );
}
