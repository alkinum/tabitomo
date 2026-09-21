import { StyleSheet } from 'react-native';
import { DESIGN_METRICS, type AppTheme } from '@tabitomo/core';

/** Shared by connection discovery, setup and Settings. Layout stays native. */
export function createControlStyles(theme: AppTheme) {
  return StyleSheet.create({
    input: {
      minHeight: 48, borderRadius: 14, borderWidth: 1,
      borderColor: theme.fieldBorder, backgroundColor: theme.field,
      color: theme.text, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, outlineWidth: 0,
    },
    focused: { borderColor: theme.accentStrong, backgroundColor: theme.activeSurface },
    choice: {
      minHeight: DESIGN_METRICS.controlHeight, borderRadius: 14,
      paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center',
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.field,
    },
    primary: {
      minHeight: 48, borderRadius: DESIGN_METRICS.radius,
      alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent,
    },
  });
}
