import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '@tabitomo/core';

const Preferences = createContext({ reduceMotion: false, reduceTransparency: true });

export function NativePreferencesProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduceMotion(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    if (Platform.OS !== 'ios') {
      setReduceTransparency(false);
      return () => { mounted = false; motion.remove(); };
    }
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => { if (mounted) setReduceTransparency(value); });
    const transparency = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { mounted = false; motion.remove(); transparency.remove(); };
  }, []);
  return <Preferences.Provider value={{ reduceMotion, reduceTransparency }}>{children}</Preferences.Provider>;
}

export const useNativePreferences = () => useContext(Preferences);

/** Native glass on iOS 26+, system material on earlier iOS, opaque when requested. */
export function NativeMaterial({ children, theme, style, interactive = false }: {
  children: ReactNode;
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  const { reduceTransparency } = useNativePreferences();
  if (Platform.OS === 'ios' && !reduceTransparency && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle="regular" colorScheme={theme.name} isInteractive={interactive} style={[styles.shape, style]}>{children}</GlassView>;
  }
  return <View style={[styles.shape, styles.fallback, { backgroundColor: Platform.OS === 'ios' && !reduceTransparency ? 'transparent' : theme.panel, borderColor: theme.border }, style]}>
    {Platform.OS === 'ios' && !reduceTransparency && <BlurView pointerEvents="none" intensity={80} tint={theme.name === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />}
    {children}
  </View>;
}

/** Haptics are feedback for user actions; unavailable hardware never blocks the action. */
export function selectionFeedback() {
  if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => {});
}

export function actionFeedback() {
  if (Platform.OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const styles = StyleSheet.create({
  shape: { borderRadius: 28, borderCurve: 'continuous' },
  fallback: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
});
