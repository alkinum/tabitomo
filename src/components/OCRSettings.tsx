import { useId, useState } from 'react';
import { getOCRMode, selectOCRMode, OCR_MODE_OPTIONS } from '../../packages/tabitomo-core/src/inputOptions';
import { DASHSCOPE_OCR_ENDPOINT, DASHSCOPE_OCR_INTL_ENDPOINT, type AISettings } from '../utils/config/settings';

export function OCRSettings({ settings, onChange }: { settings: AISettings; onChange: (settings: AISettings) => void }) {
  const id = useId();
  const ocr = settings.imageOCR;
  const mode = getOCRMode(ocr);
  const [advanced, setAdvanced] = useState(false);
  const update = (patch: Partial<AISettings['imageOCR']>) => onChange({ ...settings, imageOCR: { ...ocr, ...patch } });
  return <div className="ocr-settings">
    <div className="settings-choice-grid">{OCR_MODE_OPTIONS.map(({ value, label }) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setAdvanced(false); onChange({ ...settings, imageOCR: selectOCRMode(settings, value) }); }}>{label}</button>)}</div>
    {mode === 'jina' && <>
      <label htmlFor={`${id}-jina-key`}>Jina API key</label>
      <input id={`${id}-jina-key`} type="password" autoComplete="off" value={ocr.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="jina_…" />
      <a className="ocr-settings-link" href="https://jina.ai/" target="_blank" rel="noreferrer">Get API key</a>
    </>}
    {(mode === 'qwen' || mode === 'custom') && <>
      {mode === 'qwen' && <div className="settings-choice-grid"><button type="button" aria-pressed={ocr.endpoint === DASHSCOPE_OCR_ENDPOINT} onClick={() => update({ endpoint: DASHSCOPE_OCR_ENDPOINT, apiKey: '' })}>Beijing</button><button type="button" aria-pressed={ocr.endpoint === DASHSCOPE_OCR_INTL_ENDPOINT} onClick={() => update({ endpoint: DASHSCOPE_OCR_INTL_ENDPOINT, apiKey: '' })}>Singapore</button></div>}
      <label htmlFor={`${id}-key`}>{mode === 'qwen' ? 'Alibaba Model Studio API key' : 'OCR API key'}</label><input id={`${id}-key`} type="password" autoComplete="off" value={ocr.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={mode === 'qwen' ? 'DashScope API key' : 'Optional for local servers'} />
      {mode === 'qwen' && <button type="button" className="ocr-settings-link" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? 'Fewer options' : 'More options'}</button>}
      {(mode === 'custom' || advanced) && <>
      <label htmlFor={`${id}-endpoint`}>{mode === 'qwen' ? 'Alibaba OCR endpoint' : 'Custom OCR endpoint'}</label><input id={`${id}-endpoint`} value={ocr.endpoint} onChange={(e) => update({ endpoint: e.target.value })} placeholder={mode === 'qwen' ? DASHSCOPE_OCR_INTL_ENDPOINT : 'https://api.example.com/v1'} />
      <label htmlFor={`${id}-model`}>OCR model</label><input id={`${id}-model`} value={ocr.modelName || ''} onChange={(e) => update({ modelName: e.target.value })} placeholder={mode === 'qwen' ? 'qwen3.5-ocr' : 'Vision model ID'} />
      </>}
    </>}
  </div>;
}
