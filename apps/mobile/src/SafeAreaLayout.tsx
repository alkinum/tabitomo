import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';

export const SafeAreaAuditContext = createContext<string | null>(null);

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

type Bounds = { x: number; y: number; width: number; height: number };
const nativeLayout = Platform.OS === 'ios' ? requireOptionalNativeModule<{
  getScreenFrameAsync(tag: number): Promise<Bounds | null>;
}>('TabitomoLayout') : null;

const measure = async (view: View | null): Promise<Bounds | null> => {
  const tag = view && findNodeHandle(view);
  if (nativeLayout && tag) return nativeLayout.getScreenFrameAsync(tag);
  return new Promise(resolve => {
    if (!view) { resolve(null); return; }
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
};

/** A sheet can start below the status bar or be centered on iPad. Use UIKit
 * screen coordinates to avoid assuming either presentation's vertical offset. */
export function SheetKeyboardAvoidingView({ children, backgroundColor }: { children: ReactNode; backgroundColor: string }) {
  const host = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!nativeLayout) return;
    let cancelled = false;
    let generation = 0;
    const update = async (event?: Parameters<typeof Keyboard.scheduleLayoutAnimation>[0]) => {
      const version = ++generation;
      const frame = await measure(host.current);
      if (cancelled || version !== generation || !frame) return;
      const keyboard = event?.endCoordinates ?? Keyboard.metrics();
      const intersects = keyboard && keyboard.screenX < frame.x + frame.width && keyboard.screenX + keyboard.width > frame.x;
      if (event) Keyboard.scheduleLayoutAnimation(event);
      setOverlap(intersects ? Math.max(0, Math.min(frame.height, frame.y + frame.height - keyboard.screenY)) : 0);
    };
    refresh.current = () => { void update(); };
    const change = Keyboard.addListener('keyboardWillChangeFrame', event => { void update(event); });
    const hide = Keyboard.addListener('keyboardWillHide', event => {
      generation++;
      Keyboard.scheduleLayoutAnimation(event);
      setOverlap(0);
    });
    void update();
    return () => { cancelled = true; refresh.current = () => {}; change.remove(); hide.remove(); };
  }, []);

  // Expo Go / browser previews have no custom UIKit geometry module.
  if (!nativeLayout) return <KeyboardAvoidingView behavior="padding" style={[styles.fill, { backgroundColor }]}>{children}</KeyboardAvoidingView>;
  return <View ref={host} collapsable={false} onLayout={() => refresh.current()} style={[styles.fill, { backgroundColor, paddingBottom: overlap }]}>{children}</View>;
}

/** One owner for safe padding, applied explicitly from the native inset values.
 * Modal callers must provide a SafeAreaProvider inside the modal host. */
export function SafeAreaLayout({ children, name, topSpacing = 0, bottomSpacing = 0, backgroundColor, keyboardAware = false }: {
  children: ReactNode;
  name: string;
  topSpacing?: number;
  bottomSpacing?: number;
  backgroundColor?: string;
  keyboardAware?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const scene = useContext(SafeAreaAuditContext);
  const root = useRef<View>(null);
  const content = useRef<View>(null);
  const bottomInset = keyboardAware && keyboardVisible ? 0 : insets.bottom;
  const padding: ViewStyle = {
    paddingTop: insets.top + topSpacing,
    paddingBottom: bottomInset + bottomSpacing,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    backgroundColor,
  };

  useEffect(() => {
    if (!scene || Platform.OS !== 'ios') return;
    let cancelled = false;
    // Measure native frames after presentation/keyboard animation, not just styles.
    const record = async () => {
      const [outer, inner] = await Promise.all([measure(root.current), measure(content.current)]);
      if (cancelled || !outer || !inner || !inner.width || !inner.height) return;
      const keyboard = Keyboard.metrics();
      const checks = {
        top: inner.y >= outer.y + insets.top + topSpacing - 1,
        left: inner.x >= outer.x + insets.left - 1,
        right: inner.x + inner.width <= outer.x + outer.width - insets.right + 1,
        bottom: inner.y + inner.height <= outer.y + outer.height - bottomInset - bottomSpacing + 1,
        keyboard: !keyboardAware || !keyboardVisible || (!!keyboard && inner.y + inner.height <= keyboard.screenY + 1),
        // Root iPhone scenes must observe the real status bar / home indicator.
        nativeInsets: name !== 'workspace' || (insets.top > 0 && insets.bottom > 0),
        nativeScreenCoordinates: Boolean(nativeLayout),
      };
      try {
        const file = new File(Paths.document, `tabitomo-safe-area-${name}.json`);
        file.create({ overwrite: true });
        file.write(JSON.stringify({ scene, name, insets, outer, inner, keyboardVisible, keyboardTop: keyboard?.screenY, checks, passed: Object.values(checks).every(Boolean) }));
      } catch { /* Only explicit simulator scenes write geometry; no user data. */ }
    };
    const timer = setInterval(() => { void record(); }, 700);
    return () => { cancelled = true; clearInterval(timer); };
  }, [scene, name, insets, topSpacing, bottomSpacing, bottomInset, keyboardAware, keyboardVisible]);

  return <View ref={root} collapsable={false} style={[styles.fill, padding]} testID={`safe-area-${name}`}>
    <View ref={content} collapsable={false} style={styles.fill} testID={`safe-content-${name}`}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
