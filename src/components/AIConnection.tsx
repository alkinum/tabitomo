import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { fetchAvailableModels, type AvailableModel } from '../../packages/tabitomo-core/src/connections';
import { GENERAL_AI_PRESETS, TRANSLATION_PROVIDER_PRESETS } from '../../packages/tabitomo-core/src/providerPresets';
import type { GeneralAISettings } from '../utils/config/settings';

export function AIConnection({ value, onChange, children, purpose = 'general' }: { purpose?: 'general' | 'translation'; value: GeneralAISettings; children?: ReactNode; onChange: (value: GeneralAISettings) => void }) {
  const presets = purpose === 'translation' ? TRANSLATION_PROVIDER_PRESETS : GENERAL_AI_PRESETS;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setModels([]); setBusy(false); setMessage(''); setQuery(''); setVisionOnly(false);
    request.current?.abort();
    return () => { request.current?.abort(); };
  }, [value.endpoint, value.apiKey, value.apiFormat]);
  const loadModels = async () => {
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setBusy(true); setMessage('');
    try {
      const found = await fetchAvailableModels(value, controller.signal);
      if (!controller.signal.aborted) { setModels(found); setMessage(found.length ? '' : 'No models returned. Enter a model ID manually.'); }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Connection failed. Try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const visible = models.filter((m) => (!visionOnly || m.vision) && `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="ai-connection">
    <div className="connection-provider-row">
      <label htmlFor="connection-provider">Provider</label>
      <select id="connection-provider" value={presets.find((p) => p.endpoint.replace(/\/+$/, '') === value.endpoint.trim().replace(/\/+$/, ''))?.id || ''} onChange={(e) => {
        const preset = presets.find((p) => p.id === e.target.value);
        if (preset) onChange({ apiKey: preset.endpoint.replace(/\/+$/, '') === value.endpoint.trim().replace(/\/+$/, '') ? value.apiKey : '', endpoint: preset.endpoint, apiFormat: preset.apiFormat, modelName: preset.defaultModel });
        else onChange({ endpoint: '', modelName: '', apiKey: '', apiFormat: 'openai-chat' });
      }}><option value="">Custom endpoint</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
    </div>
    {children}
    <button type="button" className="connection-load" onClick={loadModels} disabled={busy || !value.endpoint}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Load available models</button>
    {!!models.length && <div className="connection-models">
      <input aria-label="Search models" placeholder="Search models…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {purpose === 'general' && models.some((m) => m.vision !== undefined) && <label className="connection-filter"><input type="checkbox" checked={visionOnly} onChange={(e) => setVisionOnly(e.target.checked)} /> Image-capable models</label>}
      <div className="connection-model-list">{visible.slice(0, 80).map((m) => <button key={m.id} type="button" aria-pressed={value.modelName === m.id} onClick={() => onChange({ ...value, modelName: m.id })}><span>{m.label}<small>{m.id}{m.vision ? ' · Vision' : ''}</small></span>{value.modelName === m.id && <Check size={16} />}</button>)}{visible.length > 80 && <p>Search to narrow {visible.length} models.</p>}{!visible.length && <p>No matching models.</p>}</div>
    </div>}
    {!!message && <p className="connection-message" role="status">{message}</p>}
  </div>;
}
