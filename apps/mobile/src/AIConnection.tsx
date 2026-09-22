import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { fetchAvailableModels, GENERAL_AI_PRESETS, TRANSLATION_PROVIDER_PRESETS, type AppTheme, type AvailableModel, type GeneralAISettings } from '@tabitomo/core';
import { createControlStyles } from './controlStyles';

export function AIConnection({ value, onChange, theme, children, purpose = 'general' }: { purpose?: 'general' | 'translation'; value: GeneralAISettings; children?: ReactNode; onChange: (value: GeneralAISettings) => void; theme: AppTheme }) {
  const presets = purpose === 'translation' ? TRANSLATION_PROVIDER_PRESETS : GENERAL_AI_PRESETS;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);
  const [providersExpanded, setProvidersExpanded] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'query' | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setModels([]); setBusy(false); setMessage(''); setQuery(''); setVisionOnly(false); request.current?.abort();
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
  const controls = createControlStyles(theme);
  const styles = StyleSheet.create({
    root: { gap: 12 },
    eyebrow: { color: theme.mutedText, fontSize: 12, fontWeight: '500' },
    detail: { color: theme.mutedText, fontSize: 12, lineHeight: 18 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    choice: controls.choice,
    choiceText: { color: theme.accentStrong, fontSize: 12, fontWeight: '500', flexShrink: 1 },
    loadButton: { ...controls.choice, flexDirection: 'row', alignItems: 'center', gap: 8 },
    loadLabel: { color: theme.accentStrong, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' },
    provider: { minHeight: 52, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.field, borderWidth: 1, borderColor: theme.fieldBorder },
    providerName: { color: theme.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
    providerOptions: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' },
    providerOption: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    input: controls.input,
    model: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    modelText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  });
  const visible = models.filter((m) => (!visionOnly || m.vision) && `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()));
  const selectedProvider = presets.find((p) => p.endpoint.replace(/\/+$/, '') === value.endpoint.trim().replace(/\/+$/, ''));
  const ProviderChevron = providersExpanded ? ChevronUp : ChevronDown;
  return <View style={styles.root}>
    <Text style={styles.eyebrow}>Provider</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={purpose === 'translation' ? 'Choose translation provider' : 'Choose AI provider'} aria-expanded={providersExpanded} accessibilityState={{ expanded: providersExpanded }} onPress={() => setProvidersExpanded(!providersExpanded)} style={({ pressed }) => [styles.provider, pressed && { backgroundColor: theme.activeSurface }]}>
      <Text style={styles.providerName}>{selectedProvider?.label || 'Custom endpoint'}</Text><ProviderChevron size={17} color={theme.mutedText} />
    </Pressable>
    {providersExpanded && <View style={styles.providerOptions}>{presets.map((p) => <Pressable key={p.id} accessibilityRole="button" aria-selected={p.id === selectedProvider?.id} accessibilityState={{ selected: p.id === selectedProvider?.id }} onPress={() => { onChange({ endpoint: p.endpoint, modelName: p.defaultModel, apiFormat: p.apiFormat, apiKey: p.endpoint.replace(/\/+$/, '') === value.endpoint.trim().replace(/\/+$/, '') ? value.apiKey : '' }); setProvidersExpanded(false); }} style={({ pressed }) => [styles.providerOption, (pressed || p.id === selectedProvider?.id) && { backgroundColor: theme.activeSurface }]}><Text style={styles.providerName}>{p.label}</Text>{p.id === selectedProvider?.id && <Check size={16} color={theme.accentStrong} />}</Pressable>)}
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !selectedProvider }} onPress={() => { onChange({ endpoint: '', modelName: '', apiKey: '', apiFormat: 'openai-chat' }); setProvidersExpanded(false); }} style={({ pressed }) => [styles.providerOption, pressed && { backgroundColor: theme.activeSurface }]}><Text style={styles.providerName}>Custom endpoint</Text>{!selectedProvider && <Check size={16} color={theme.accentStrong} />}</Pressable>
    </View>}
    {value.endpoint.includes('localhost') && <Text style={styles.detail}>On an iPhone, replace localhost with your computer’s LAN address. Use a reachable HTTPS endpoint if your build blocks HTTP.</Text>}
    {children}
    <Pressable accessibilityRole="button" accessibilityLabel="Load available models" disabled={busy || !value.endpoint} onPress={loadModels} style={({ pressed }) => [styles.loadButton, { opacity: busy || !value.endpoint ? 0.5 : pressed ? 0.7 : 1 }]}><View style={{ width: 20, alignItems: 'center' }}>{busy ? <ActivityIndicator color={theme.accentStrong} /> : <RefreshCw size={15} color={theme.accentStrong} />}</View><Text style={styles.loadLabel}>Load available models</Text><View style={{ width: 20 }} /></Pressable>
    {!!models.length && <View style={{ gap: 8 }}>
      <TextInput accessibilityLabel="Search models" placeholder="Search models…" placeholderTextColor={theme.placeholder} value={query} onChangeText={setQuery} onFocus={() => setFocusedInput('query')} onBlur={() => setFocusedInput(null)} style={[styles.input, focusedInput === 'query' && controls.focused]} />
      {purpose === 'general' && models.some((m) => m.vision !== undefined) && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: visionOnly }} onPress={() => setVisionOnly(!visionOnly)} style={styles.choice}><Text style={styles.choiceText}>{visionOnly ? '✓ ' : ''}Image-capable models</Text></Pressable>}
      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">{visible.slice(0, 60).map((m) => <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: value.modelName === m.id }} onPress={() => onChange({ ...value, modelName: m.id })} style={styles.model}><View style={{ flex: 1 }}><Text style={styles.modelText}>{m.label}</Text><Text style={styles.detail}>{m.id}{m.vision ? ' · Vision' : ''}</Text></View>{value.modelName === m.id && <Check size={16} color={theme.accentStrong} />}</Pressable>)}{visible.length > 60 && <Text style={styles.detail}>Search to narrow {visible.length} models.</Text>}{!visible.length && <Text style={styles.detail}>No matching models.</Text>}</ScrollView>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.detail}>{message}</Text>}
  </View>;
}
