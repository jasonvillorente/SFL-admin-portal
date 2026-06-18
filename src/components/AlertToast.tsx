import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface AlertToastProps {
  isOpen: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  autoCloseMs?: number;
}

export default function AlertToast({
  isOpen,
  message,
  type = 'success',
  onClose,
  autoCloseMs = 4000
}: AlertToastProps) {
  useEffect(() => {
    if (isOpen && autoCloseMs > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseMs, onClose]);

  if (!isOpen) return null;

  const borderLeftColor = 
    type === 'success' 
      ? 'border-l-emerald-500' 
      : type === 'error'
      ? 'border-l-red-500'
      : 'border-l-blue-500';

  const iconColor = 
    type === 'success' 
      ? 'text-emerald-600' 
      : type === 'error'
      ? 'text-red-600'
      : 'text-blue-600';

  const Icon = 
    type === 'success' 
      ? CheckCircle 
      : type === 'error'
      ? AlertCircle 
      : Info;

  return (
    <div className="fixed bottom-4 right-4 z-[10000] max-w-sm w-full bg-white rounded-lg border border-gray-150 shadow-xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200" id="custom-toast-notification">
      <div className={`p-3.5 flex items-start space-x-3 border-l-4 ${borderLeftColor}`}>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-semibold text-slate-900 font-sans leading-relaxed">
            {message}
          </p>
        </div>
        <button 
          onClick={onClose} 
          className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5 rounded-full hover:bg-slate-100 transition-colors pointer-events-auto"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
