import React from 'react';
import { AlertTriangle, Download } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'warning' | 'info';
  icon?: 'warning' | 'download';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Continue',
  cancelText = 'Cancel',
  variant = 'info',
  icon = 'warning',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const IconComponent = icon === 'download' ? Download : AlertTriangle;
  const iconColor = variant === 'warning' ? 'text-orange-500' : 'text-indigo-500';
  const iconBg = variant === 'warning' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30';

  return (
    <div className="safe-modal fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-y-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex justify-center pt-6 pb-4">
          <div className={`p-4 ${iconBg} rounded-2xl cute-shadow`}>
            <IconComponent className={`w-8 h-8 ${iconColor}`} />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 text-center">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-700 dark:text-gray-300 font-semibold bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-all duration-200 btn-pop"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl cute-shadow hover:from-indigo-400 hover:to-purple-400 transition-all duration-200 btn-pop"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
