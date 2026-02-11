import { XCircle, AlertTriangle, Trash2, LogOut, RotateCcw } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
}

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <Trash2 className="w-12 h-12 text-red-600" strokeWidth={2} />;
      case 'warning':
        return <AlertTriangle className="w-12 h-12 text-yellow-600" strokeWidth={2} />;
      case 'info':
        return <RotateCcw className="w-12 h-12 text-blue-600" strokeWidth={2} />;
      default:
        return <AlertTriangle className="w-12 h-12 text-yellow-600" strokeWidth={2} />;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          bg: 'from-red-500 to-red-700',
          hover: 'hover:from-red-600 hover:to-red-800',
          shadow: 'shadow-red-500/50',
        };
      case 'warning':
        return {
          bg: 'from-yellow-500 to-yellow-700',
          hover: 'hover:from-yellow-600 hover:to-yellow-800',
          shadow: 'shadow-yellow-500/50',
        };
      case 'info':
        return {
          bg: 'from-blue-500 to-blue-700',
          hover: 'hover:from-blue-600 hover:to-blue-800',
          shadow: 'shadow-blue-500/50',
        };
      default:
        return {
          bg: 'from-yellow-500 to-yellow-700',
          hover: 'hover:from-yellow-600 hover:to-yellow-800',
          shadow: 'shadow-yellow-500/50',
        };
    }
  };

  const colors = getColors();

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec icône */}
        <div className="p-6 text-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <XCircle className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex justify-center mb-4">{getIcon()}</div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        </div>

        {/* Message */}
        <div className="p-6">
          <p className="text-slate-600 text-center leading-relaxed">{message}</p>
        </div>

        {/* Boutons d'action */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r ${colors.bg} ${colors.hover} shadow-lg ${colors.shadow} transition-all active:scale-95`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
