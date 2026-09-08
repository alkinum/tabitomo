import { useId } from 'react';
import { getOCRMode, selectOCRMode, LOCAL_MODEL_GUIDANCE, type OCRMode } from '../../packages/tabitomo-core/src/inputOptions';
import { DASHSCOPE_OCR_ENDPOINT, DASHSCOPE_OCR_INTL_ENDPOINT, type AISettings } from '../utils/config/settings';

export function OCRSettings({ settings, onChange }: { settings: AISettings; onChange: (settings: AISettings) => void }) {
  const id = useId();
  const ocr = settings.imageOCR;
  const mode = getOCRMode(ocr);
  const update = (patch: Partial<AISettings['imageOCR']>) => onChange({ ...settings, imageOCR: { ...ocr, ...patch } });
  return <div className="ocr-settings">
    <div className="settings-choice-grid">{([['local', 'Local OCR'], ['general', 'General AI'], ['custom', 'Custom vision'], ['qwen', 'Alibaba Qwen-OCR']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onChange({ ...settings, imageOCR: selectOCRMode(settings, value as OCRMode) })}>{label}</button>)}</div>
    {mode === 'local' && <p>{LOCAL_MODEL_GUIDANCE.ocr}</p>}
    {mode === 'general' && <p>Uses your General AI connection. Choose an image-capable model; extracted text appears without coordinate overlays.</p>}
    {(mode === 'qwen' || mode === 'custom') && <>
      {mode === 'qwen' && <div className="settings-choice-grid"><button type="button" aria-pressed={ocr.endpoint === DASHSCOPE_OCR_ENDPOINT} onClick={() => update({ endpoint: DASHSCOPE_OCR_ENDPOINT, apiKey: '' })}>Beijing</button><button type="button" aria-pressed={ocr.endpoint === DASHSCOPE_OCR_INTL_ENDPOINT} onClick={() => update({ endpoint: DASHSCOPE_OCR_INTL_ENDPOINT, apiKey: '' })}>Singapore</button></div>}
      {mode === 'custom' && <p>A vision-capable OpenAI-compatible model extracts text. Coordinate overlays require Local or Qwen OCR.</p>}
      <label htmlFor={`${id}-endpoint`}>{mode === 'qwen' ? 'Alibaba OCR endpoint' : 'Custom OCR endpoint'}</label><input id={`${id}-endpoint`} value={ocr.endpoint} onChange={(e) => update({ endpoint: e.target.value })} placeholder={mode === 'qwen' ? DASHSCOPE_OCR_INTL_ENDPOINT : 'https://api.example.com/v1'} />
      <label htmlFor={`${id}-model`}>OCR model</label><input id={`${id}-model`} value={ocr.modelName || ''} onChange={(e) => update({ modelName: e.target.value })} placeholder={mode === 'qwen' ? 'qwen3.5-ocr' : 'Vision model ID'} />
      <label htmlFor={`${id}-key`}>{mode === 'qwen' ? 'Alibaba Model Studio API key' : 'OCR API key'}</label><input id={`${id}-key`} type="password" autoComplete="off" value={ocr.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={mode === 'qwen' ? 'DashScope API key' : 'Optional for local servers'} />
    </>}
  </div>;
}
