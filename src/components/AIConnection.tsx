import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Loader2, RefreshCw } from 'lucide-react';
import { createOpenRouterSession, exchangeOpenRouterCode, fetchAvailableModels, OPENROUTER_ENDPOINT, type AvailableModel, type OpenRouterSession } from '../../packages/tabitomo-core/src/connections';
import { GENERAL_AI_PRESETS } from '../../packages/tabitomo-core/src/providerPresets';
import type { GeneralAISettings } from '../utils/config/settings';

export function AIConnection({ value, onChange }: { value: GeneralAISettings; onChange: (value: GeneralAISettings) => void }) {
  const [session, setSession] = useState<OpenRouterSession | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setModels([]); setBusy(false);
    request.current?.abort();
    return () => { request.current?.abort(); };
  }, [value.endpoint, value.apiKey, value.apiFormat]);
  const begin = () => {
    try {
      const next = createOpenRouterSession();
      setSession(next); setCode(''); setMessage('');
      window.open(next.url, '_blank', 'noopener,noreferrer');
    } catch { setMessage('Authorization requires a secure browser context. Use HTTPS or enter an API key below.'); }
  };
  const run = async (authorize: boolean) => {
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setBusy(true); setMessage('');
    try {
      if (authorize && session) {
        const apiKey = await exchangeOpenRouterCode(session, code, controller.signal);
        if (controller.signal.aborted) return;
        onChange({ apiKey, endpoint: OPENROUTER_ENDPOINT, apiFormat: 'openai-chat', modelName: value.endpoint === OPENROUTER_ENDPOINT ? value.modelName : '' });
        setSession(null); setCode('');
        setMessage('Connected. Load models to choose one, then save your settings.');
      } else {
        const found = await fetchAvailableModels(value, controller.signal);
        if (!controller.signal.aborted) { setModels(found); setMessage(found.length ? '' : 'No models returned. Enter a model ID below.'); }
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Connection failed. Try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const visible = models.filter((m) => (!visionOnly || m.vision) && `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="ai-connection">
    <div className="connection-heading"><span className="eyebrow">YOUR AI, YOUR CHOICE</span><span className="connection-badge">Quick connect</span></div>
    <button type="button" className="connection-primary" onClick={begin} disabled={busy}>Connect with OpenRouter <ArrowUpRight size={18} /></button>
    <p className="connection-description">Choose your models and spending limit on your own account.</p>
    {session && <div className="connection-authorization">
      <p>Authorize in OpenRouter, then paste the one-time code here. Keep this screen open.</p>
      <a href={session.url} target="_blank" rel="noreferrer">Open authorization page</a>
      <label htmlFor="openrouter-code">Authorization code</label>
      <input id="openrouter-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste one-time code" />
      <div className="connection-actions"><button type="button" onClick={() => run(true)} disabled={busy || !code.trim()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Finish connection</button><button type="button" disabled={busy} onClick={() => { setSession(null); setCode(''); }}>Cancel</button></div>
    </div>}
    <div className="connection-provider-row">
      <label htmlFor="connection-provider">Or choose a provider</label>
      <select id="connection-provider" value={GENERAL_AI_PRESETS.find((p) => p.endpoint === value.endpoint && p.apiFormat === value.apiFormat)?.id || ''} onChange={(e) => {
        const preset = GENERAL_AI_PRESETS.find((p) => p.id === e.target.value);
        if (preset) onChange({ apiKey: preset.endpoint === value.endpoint ? value.apiKey : '', endpoint: preset.endpoint, apiFormat: preset.apiFormat, modelName: preset.defaultModel });
        else onChange({ ...value, endpoint: '', modelName: '', apiKey: '' });
      }}><option value="">Custom endpoint</option>{GENERAL_AI_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
    </div>
    <button type="button" className="connection-load" onClick={() => run(false)} disabled={busy || !value.endpoint}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Load available models</button>
    {!!models.length && <div className="connection-models">
      <input aria-label="Search models" placeholder="Search models…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {models.some((m) => m.vision !== undefined) && <label className="connection-filter"><input type="checkbox" checked={visionOnly} onChange={(e) => setVisionOnly(e.target.checked)} /> Image-capable models</label>}
      <div className="connection-model-list">{visible.slice(0, 80).map((m) => <button key={m.id} type="button" aria-pressed={value.modelName === m.id} onClick={() => onChange({ ...value, modelName: m.id })}><span>{m.label}<small>{m.id}{m.vision ? ' · Vision' : ''}</small></span>{value.modelName === m.id && <Check size={16} />}</button>)}{visible.length > 80 && <p>Search to narrow {visible.length} models.</p>}{!visible.length && <p>No matching models.</p>}</div>
    </div>}
    {!!message && <p className="connection-message" role="status">{message}</p>}
  </div>;
}
