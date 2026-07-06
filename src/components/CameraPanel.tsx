import { useEffect, useRef, useState } from 'react';
import { X, RotateCw } from 'lucide-react';
import { compressImage } from '../utils/image/imageCompression';

interface CameraPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBase64: string) => void;
}

export const CameraPanel: React.FC<CameraPanelProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const startCamera = async (mode: 'user' | 'environment') => {
    try {
      setIsLoading(true);

      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Camera error:', err);
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);

        try {
          setIsCompressing(true);

          // Compress using WASM-based mozjpeg
          // Max 1920px on longest side, quality 85 (excellent quality)
          const compressedImage = await compressImage(canvas, {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 85
          });

          onCapture(compressedImage);
          handleClose();
        } catch (error) {
          console.error('Compression failed:', error);
          // Fallback to uncompressed if WASM fails
          const fallbackImage = canvas.toDataURL('image/jpeg', 0.85);
          onCapture(fallbackImage);
          handleClose();
        } finally {
          setIsCompressing(false);
        }
      }
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const switchCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between">
          <button
            onClick={handleClose}
            className="p-2 bg-indigo-500 text-white hover:bg-indigo-400 rounded-full transition-colors duration-200 cute-shadow"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={switchCamera}
            className="p-2 bg-indigo-500 text-white hover:bg-indigo-400 rounded-full transition-colors duration-200 cute-shadow"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera Preview */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full"></div>
          </div>
        )}
        {isCompressing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="flex flex-col items-center">
              <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full"></div>
              <p className="text-white mt-4 text-sm">Compressing...</p>
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-8 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-center">
          <button
            onClick={handleCapture}
            className="w-16 h-16 rounded-full bg-white hover:bg-gray-50 transition-colors duration-200 cute-shadow flex items-center justify-center"
          >
            <div className="w-12 h-12 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors duration-200"></div>
          </button>
        </div>
      </div>
    </div>
  );
};
