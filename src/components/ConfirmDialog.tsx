import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isDestructive?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" id="custom-confirm-modal">
      <div className="w-full max-w-sm bg-white rounded-lg border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="p-5 text-left">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-gray-100 pb-2 mb-3 font-sans flex items-center">
            {isDestructive ? (
              <ShieldAlert className="w-4 h-4 mr-1.5 text-red-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-500" />
            )}
            {title}
          </h3>
          <p className="text-xs text-slate-650 font-medium leading-relaxed font-sans">
            {message}
          </p>
        </div>
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-500 uppercase transition-colors pointer-events-auto"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded border text-[11px] font-bold uppercase text-white transition-colors pointer-events-auto shadow-sm ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 border-red-700'
                : 'bg-[#1E3A5F] hover:bg-[#162a45] border-[#1E3A5F]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
