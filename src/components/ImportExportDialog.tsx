import React, { useState, useRef } from 'react';
import { X, ArrowLeftRight, Upload, HardDriveUpload, QrCode, Scan, Eye, EyeOff, FileText } from 'lucide-react';
import { AISettings } from '../utils/config/settings';
import { useBackdropClose } from '../hooks/useBackdropClose';
import {
  exportConfigToFile,
  importConfigFromFile,
  generateConfigQRCode,
  importConfigFromQRCode,
} from '../utils/config/export';
import { Html5Qrcode } from 'html5-qrcode';

interface ImportExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AISettings;
  onImport: (settings: AISettings) => void;
}

type Mode = 'export-file' | 'export-qr' | 'import-file' | 'import-qr';

export const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onImport,
}) => {
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleExportFile = async () => {
    if (!password) {
      setError('Please enter a password');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      await exportConfigToFile(currentSettings, password);
      setSuccess('Settings exported successfully!');
      setTimeout(() => {
        setPassword('');
        setMode(null);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportQR = async () => {
    if (!password) {
      setError('Please enter a password');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const dataUrl = await generateConfigQRCode(currentSettings, password);
      setQrCodeDataUrl(dataUrl);
      setSuccess('QR code generated successfully!');
    } catch (err) {
      setError(`QR generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !password) {
      setError('Please select a file and enter the password');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const settings = await importConfigFromFile(file, password);
      onImport(settings);
      setSuccess('Settings imported successfully!');
      setTimeout(() => {
        setPassword('');
        setMode(null);
        setSuccess(null);
        onClose();
      }, 1500);
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Invalid password or corrupted file'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const startQRScanner = async () => {
    if (!password) {
      setError('Please enter the password first');
      return;
    }

    setIsScanning(true);
    setError(null);

    // Wait for the DOM element to be rendered
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const scanner = new Html5Qrcode('qr-reader');
      qrScannerRef.current = scanner;

      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No cameras found on this device');
      }

      // Try to use the back camera if available, otherwise use the first camera
      const cameraId = cameras.length > 1 ? cameras[1].id : cameras[0].id;

      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          try {
            const settings = await importConfigFromQRCode(decodedText, password);
            await scanner.stop();
            qrScannerRef.current = null;
            setIsScanning(false);
            onImport(settings);
            setSuccess('Settings imported successfully!');
            setTimeout(() => {
              setPassword('');
              setMode(null);
              setSuccess(null);
              onClose();
            }, 1500);
          } catch (err) {
            setError(`Import failed: ${err instanceof Error ? err.message : 'Invalid password or QR code'}`);
            await scanner.stop();
            qrScannerRef.current = null;
            setIsScanning(false);
          }
        },
        () => {
          // Ignore scan errors (no QR code detected)
        }
      );
    } catch (err) {
      console.error('QR Scanner error:', err);
      let errorMessage = 'Scanner failed: ';
      if (err instanceof Error) {
        if (err.message.includes('NotAllowedError') || err.message.includes('Permission')) {
          errorMessage += 'Camera permission denied. Please allow camera access in your browser settings.';
        } else if (err.message.includes('NotFoundError') || err.message.includes('No cameras')) {
          errorMessage += 'No camera found on this device.';
        } else if (err.message.includes('NotReadableError')) {
          errorMessage += 'Camera is already in use by another application.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Unknown error occurred';
      }
      setError(errorMessage);
      setIsScanning(false);
    }
  };

  const stopQRScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      qrScannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleClose = async () => {
    await stopQRScanner();
    setMode(null);
    setPassword('');
    setShowPassword(false);
    setQrCodeDataUrl(null);
    setError(null);
    setSuccess(null);
    onClose();
  };

  const backdropCloseHandlers = useBackdropClose<HTMLDivElement>({
    onClose: handleClose,
    stopPropagation: true,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropCloseHandlers}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-xl cute-shadow">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-base sm:text-xl font-bold text-gray-800 dark:text-white">
              Import/Export Settings
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {!mode ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose how you want to import or export your settings. All exports are encrypted with AES-256.
              </p>

              {/* Export Options */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Export Settings</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode('export-file')}
                    className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 min-h-[100px] flex flex-col items-center justify-center"
                  >
                    <FileText className="w-6 h-6 mb-2 text-indigo-500" />
                    <div className="text-sm font-bold text-gray-800 dark:text-white">File</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">.ttconfig</div>
                  </button>
                  <button
                    onClick={() => setMode('export-qr')}
                    className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 min-h-[100px] flex flex-col items-center justify-center"
                  >
                    <QrCode className="w-6 h-6 mb-2 text-indigo-500" />
                    <div className="text-sm font-bold text-gray-800 dark:text-white">QR Code</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Scan to share</div>
                  </button>
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Import Settings</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode('import-file')}
                    className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 min-h-[100px] flex flex-col items-center justify-center"
                  >
                    <Upload className="w-6 h-6 mb-2 text-purple-500" />
                    <div className="text-sm font-bold text-gray-800 dark:text-white">File</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">From .ttconfig</div>
                  </button>
                  <button
                    onClick={() => setMode('import-qr')}
                    className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 min-h-[100px] flex flex-col items-center justify-center"
                  >
                    <Scan className="w-6 h-6 mb-2 text-purple-500" />
                    <div className="text-sm font-bold text-gray-800 dark:text-white">Scan QR</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Use camera</div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setMode(null);
                  setPassword('');
                  setQrCodeDataUrl(null);
                  setError(null);
                  setSuccess(null);
                  stopQRScanner();
                }}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-2"
              >
                ← Back to options
              </button>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter encryption password"
                    className="w-full px-3 py-2 pr-10 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Export File */}
              {mode === 'export-file' && (
                <button
                  onClick={handleExportFile}
                  disabled={isProcessing || !password}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop"
                >
                  <HardDriveUpload className="w-4 h-4" />
                  {isProcessing ? 'Exporting...' : 'Export to File'}
                </button>
              )}

              {/* Export QR */}
              {mode === 'export-qr' && (
                <>
                  {!qrCodeDataUrl ? (
                    <button
                      onClick={handleExportQR}
                      disabled={isProcessing || !password}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop"
                    >
                      <QrCode className="w-4 h-4" />
                      {isProcessing ? 'Generating...' : 'Generate QR Code'}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700">
                        <img src={qrCodeDataUrl} alt="Settings QR Code" className="w-full h-auto rounded-lg" />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        Scan this QR code to import settings on another device
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Import File */}
              {mode === 'import-file' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ttconfig"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || !password}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white font-semibold rounded-xl cute-shadow hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop"
                  >
                    <Upload className="w-4 h-4" />
                    {isProcessing ? 'Importing...' : 'Select File'}
                  </button>
                </>
              )}

              {/* Import QR */}
              {mode === 'import-qr' && (
                <>
                  {!isScanning ? (
                    <button
                      onClick={startQRScanner}
                      disabled={isProcessing || !password}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white font-semibold rounded-xl cute-shadow hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop"
                    >
                      <Scan className="w-4 h-4" />
                      Start Scanning
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div id="qr-reader" className="rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700"></div>
                      <button
                        onClick={stopQRScanner}
                        className="w-full px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all duration-200 btn-pop"
                      >
                        Stop Scanning
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
                </div>
              )}

              {/* Info */}
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-indigo-800 dark:text-indigo-200">
                  <strong>Security:</strong> Your settings are encrypted using AES-256 encryption.
                  Make sure to use a strong password and keep it safe.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
