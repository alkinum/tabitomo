import { ModalSurface } from './ui/ModalSurface';
import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ isOpen, imageUrl, onClose }) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `translated-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <ModalSurface title="Translated Image" onClose={onClose}>
    <div onClick={onClose} className="safe-modal fixed inset-0 z-50 bg-black/90 flex flex-col p-4 animate-in fade-in duration-200">
      {/* Header */}
      <div onClick={(event) => event.stopPropagation()} className="w-full shrink-0 pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Translated Image</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="min-w-11 min-h-11 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="min-w-11 min-h-11 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Image */}
      <div className="relative w-full flex-1 min-h-0 flex items-center justify-center">
        <img
          src={imageUrl}
          alt="Translated"
          className="w-full h-full min-h-0 object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

    </div>
    </ModalSurface>
  );
};
