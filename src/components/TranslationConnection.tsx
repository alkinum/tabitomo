import { useState } from 'react';
import { AIConnection } from './AIConnection';
import { getTranslationConnection, updateTranslationConnection } from '../../packages/tabitomo-core/src/translationConnection';
import type { AISettings } from '../utils/config/settings';

/** One translation connection form for first-run setup and Settings. */
export function TranslationConnection({ settings, onChange }: { settings: AISettings; onChange: (settings: AISettings) => void }) {
  const [advanced, setAdvanced] = useState(false);
  const connection = getTranslationConnection(settings);
  const update = (patch: Partial<typeof connection>) => onChange(updateTranslationConnection(settings, { ...connection, ...patch }));
  return <div className="space-y-3">
    <AIConnection purpose="translation" value={connection} onChange={value => onChange(updateTranslationConnection(settings, value))}>
      <div className="translation-connection-field">
        <label htmlFor="translation-endpoint">Endpoint</label>
        <input id="translation-endpoint" value={connection.endpoint} onChange={e => update({ endpoint: e.target.value })} placeholder="https://api.example.com/v1" autoCapitalize="none" autoCorrect="off" />
      </div>
      <div className="translation-connection-field">
        <label htmlFor="translation-key">API key</label>
        <input id="translation-key" type="password" value={connection.apiKey} onChange={e => update({ apiKey: e.target.value })} placeholder="Provider API key" />
      </div>
      <div className="translation-connection-field">
        <label htmlFor="translation-model">Model</label>
        <input id="translation-model" value={connection.modelName} onChange={e => update({ modelName: e.target.value })} placeholder="Model ID" autoCapitalize="none" autoCorrect="off" />
      </div>
    </AIConnection>
    <button type="button" className="ocr-settings-link" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? 'Fewer options' : 'More options'}</button>
    {advanced && <div className="space-y-2">
      <span className="text-sm font-medium">Output</span>
      <div className="settings-choice-grid" role="group" aria-label="Translation output">
        {(['plain', 'structured'] as const).map(mode => <button key={mode} type="button"
          aria-pressed={settings.translation.outputMode === mode}
          onClick={() => onChange({ ...settings, translation: { ...settings.translation, outputMode: mode } })}>
          {mode === 'plain' ? 'Plain text' : 'Structured'}
        </button>)}
      </div>
    </div>}
  </div>;
}
