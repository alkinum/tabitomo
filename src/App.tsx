import { useState, useEffect, lazy, Suspense } from 'react';
import { TranslationTool } from './components/TranslationTool';
import { UpdateNotification } from './components/UpdateNotification';
import { Toaster } from './components/ui/toaster';
import { loadSettings, saveSettings, AISettings, DEFAULT_SETTINGS } from './utils/config/settings';
import { usePWAUpdate } from './hooks/usePWAUpdate';

// Lazy load SettingsPanel - only loaded when user opens settings
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
// Lazy load WelcomeWizard - only loaded on first launch
const WelcomeWizard = lazy(() => import('./components/WelcomeWizard').then(module => ({ default: module.WelcomeWizard })));

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'translation' | 'speech' | 'image'>('general');
  const [currentSettings, setCurrentSettings] = useState<AISettings | null>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);

  // PWA update management
  const { showUpdatePrompt, handleUpdate, handleDismiss } = usePWAUpdate();

  useEffect(() => {
    // Load settings or show welcome wizard
    const loaded = loadSettings();
    if (loaded) {
      // Ensure generalAI and vlm exist for backward compatibility
      if (!loaded.generalAI) {
        loaded.generalAI = DEFAULT_SETTINGS.generalAI;
      }
      if (!loaded.vlm) {
        loaded.vlm = DEFAULT_SETTINGS.vlm;
      }
      setCurrentSettings(loaded);
    } else {
      // First launch: show welcome wizard
      setShowWelcomeWizard(true);
    }
    setIsLoading(false);
  }, []);

  const handleSettingsSave = (settings: AISettings) => {
    setCurrentSettings(settings);
    setShowSettings(false);
  };

  const handleWelcomeComplete = (settings: AISettings) => {
    saveSettings(settings);
    setCurrentSettings(settings);
    setShowWelcomeWizard(false);
  };

  const handleWelcomeSkip = () => {
    // User skipped without configuring - set default settings but show wizard again on next launch
    if (!currentSettings) {
      setCurrentSettings(DEFAULT_SETTINGS);
    }
    setShowWelcomeWizard(false);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
  };

  const handleOpenSettings = (initialTab?: 'general' | 'translation' | 'speech' | 'image') => {
    setSettingsInitialTab(initialTab || 'general');
    setShowSettings(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Loading tabitomo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-canvas min-h-screen flex items-center justify-center p-4" style={{
      paddingTop: 'max(1rem, env(safe-area-inset-top))',
      paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      paddingRight: 'max(1rem, env(safe-area-inset-right))'
    }}>
      {/* Main Content */}
      {currentSettings && (
        <TranslationTool
          settings={currentSettings}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {/* Welcome Wizard - Lazy Loaded */}
      <Suspense fallback={null}>
        <WelcomeWizard
          isOpen={showWelcomeWizard}
          onComplete={handleWelcomeComplete}
          onSkip={handleWelcomeSkip}
        />
      </Suspense>

      {/* Settings Panel - Lazy Loaded */}
      <Suspense fallback={null}>
        <SettingsPanel
          isOpen={showSettings}
          onClose={handleSettingsClose}
          onSave={handleSettingsSave}
          initialTab={settingsInitialTab}
        />
      </Suspense>

      {/* Toast Notifications */}
      <Toaster />

      {/* PWA Update Notification */}
      {showUpdatePrompt && (
        <UpdateNotification onUpdate={handleUpdate} onDismiss={handleDismiss} />
      )}
    </div>
  );
}