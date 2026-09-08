import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUpRight, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react-native';
import { createOpenRouterSession, exchangeOpenRouterCode, fetchAvailableModels, GENERAL_AI_PRESETS, OPENROUTER_ENDPOINT, type AppTheme, type AvailableModel, type GeneralAISettings, type OpenRouterSession } from '@tabitomo/core';

export function AIConnection({ value, onChange, theme }: { value: GeneralAISettings; onChange: (value: GeneralAISettings) => void; theme: AppTheme }) {
  const [session, setSession] = useState<OpenRouterSession | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);
  const [providersExpanded, setProvidersExpanded] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setModels([]); setBusy(false); request.current?.abort();
    return () => { request.current?.abort(); };
  }, [value.endpoint, value.apiKey, value.apiFormat]);
  const begin = async () => {
    try {
      const next = createOpenRouterSession();
      setSession(next); setCode(''); setMessage('');
      await Linking.openURL(next.url);
    } catch { setMessage('Could not open OpenRouter. You can enter an API key below.'); }
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
        setSession(null); setCode(''); setMessage('Connected. Load models to choose one, then save your settings.');
      } else {
        const found = await fetchAvailableModels(value, controller.signal);
        if (!controller.signal.aborted) { setModels(found); setMessage(found.length ? '' : 'No models returned. Enter a model ID below.'); }
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Connection failed. Try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const styles = StyleSheet.create({
    root: { gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
    eyebrow: { color: theme.mutedText, fontSize: 12, fontWeight: '500' },
    primary: { minHeight: 48, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.accent, borderRadius: 14 },
    primaryText: { color: theme.inverseText, fontSize: 14, fontWeight: '600' },
    detail: { color: theme.mutedText, fontSize: 12, lineHeight: 18 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    choice: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.field },
    choiceText: { color: theme.accentStrong, fontSize: 12, fontWeight: '500', flexShrink: 1 },
    provider: { minHeight: 52, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.field, borderWidth: 1, borderColor: theme.fieldBorder },
    providerName: { color: theme.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
    providerOptions: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' },
    providerOption: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    input: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: theme.fieldBorder, borderRadius: 12, color: theme.text, backgroundColor: theme.field, fontSize: 14 },
    model: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    modelText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  });
  const visible = models.filter((m) => (!visionOnly || m.vision) && `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()));
  const selectedProvider = GENERAL_AI_PRESETS.find((p) => p.endpoint === value.endpoint && p.apiFormat === value.apiFormat);
  const ProviderChevron = providersExpanded ? ChevronUp : ChevronDown;
  return <View style={styles.root}>
    <Text style={styles.eyebrow}>Quick connect</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Connect with OpenRouter" disabled={busy} onPress={begin} style={({ pressed }) => [styles.primary, { opacity: busy ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}><Text style={styles.primaryText}>Connect with OpenRouter</Text><ArrowUpRight size={18} color="#fff" /></Pressable>
    <Text style={styles.detail}>Choose your models and spending limit on your own account.</Text>
    {session && <View style={{ gap: 10 }}>
      <Text style={styles.detail}>Authorize in OpenRouter, then paste the one-time code here. Keep this screen open.</Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(session.url).catch(() => setMessage('Could not open browser. Try connecting again.'))} style={styles.choice}><Text style={styles.choiceText}>Open authorization page</Text></Pressable>
      <TextInput accessibilityLabel="Authorization code" secureTextEntry autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} placeholder="Paste one-time code" placeholderTextColor={theme.placeholder} style={styles.input} />
      <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy || !code.trim()} onPress={() => run(true)} style={styles.choice}><Text style={styles.choiceText}>Finish connection</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSession(null); setCode(''); }} style={styles.choice}><Text style={styles.choiceText}>Cancel connection</Text></Pressable></View>
    </View>}
    <Text style={styles.eyebrow}>Or choose a provider</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose AI provider" aria-expanded={providersExpanded} accessibilityState={{ expanded: providersExpanded }} onPress={() => setProvidersExpanded(!providersExpanded)} style={({ pressed }) => [styles.provider, pressed && { backgroundColor: theme.activeSurface }]}>
      <Text style={styles.providerName}>{selectedProvider?.label || 'Custom endpoint'}</Text><ProviderChevron size={17} color={theme.mutedText} />
    </Pressable>
    {providersExpanded && <View style={styles.providerOptions}>{GENERAL_AI_PRESETS.map((p) => <Pressable key={p.id} accessibilityRole="button" aria-selected={p.id === selectedProvider?.id} accessibilityState={{ selected: p.id === selectedProvider?.id }} onPress={() => { onChange({ endpoint: p.endpoint, modelName: p.defaultModel, apiFormat: p.apiFormat, apiKey: p.endpoint === value.endpoint ? value.apiKey : '' }); setProvidersExpanded(false); }} style={({ pressed }) => [styles.providerOption, (pressed || p.id === selectedProvider?.id) && { backgroundColor: theme.activeSurface }]}><Text style={styles.providerName}>{p.id === 'openai-chat' ? 'OpenAI-compatible' : p.id === 'openai-responses' ? 'OpenAI' : p.label}</Text>{p.id === selectedProvider?.id && <Check size={16} color={theme.accentStrong} />}</Pressable>)}</View>}
    {value.endpoint.includes('localhost') && <Text style={styles.detail}>On an iPhone, replace localhost with your computer’s LAN address. Use a reachable HTTPS endpoint if your build blocks HTTP.</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !value.endpoint} onPress={() => run(false)} style={[styles.choice, styles.row, { alignItems: 'center', justifyContent: 'center', opacity: busy || !value.endpoint ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color={theme.accentStrong} /> : <RefreshCw size={15} color={theme.accentStrong} />}<Text style={styles.choiceText}>Load available models</Text></Pressable>
    {!!models.length && <View style={{ gap: 8 }}>
      <TextInput accessibilityLabel="Search models" placeholder="Search models…" placeholderTextColor={theme.placeholder} value={query} onChangeText={setQuery} style={styles.input} />
      {models.some((m) => m.vision !== undefined) && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: visionOnly }} onPress={() => setVisionOnly(!visionOnly)} style={styles.choice}><Text style={styles.choiceText}>{visionOnly ? '✓ ' : ''}Image-capable models</Text></Pressable>}
      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">{visible.slice(0, 60).map((m) => <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: value.modelName === m.id }} onPress={() => onChange({ ...value, modelName: m.id })} style={styles.model}><View style={{ flex: 1 }}><Text style={styles.modelText}>{m.label}</Text><Text style={styles.detail}>{m.id}{m.vision ? ' · Vision' : ''}</Text></View>{value.modelName === m.id && <Check size={16} color={theme.accentStrong} />}</Pressable>)}{visible.length > 60 && <Text style={styles.detail}>Search to narrow {visible.length} models.</Text>}{!visible.length && <Text style={styles.detail}>No matching models.</Text>}</ScrollView>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.detail}>{message}</Text>}
  </View>;
}
