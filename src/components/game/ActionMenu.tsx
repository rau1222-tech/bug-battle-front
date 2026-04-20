import { motion } from 'framer-motion';

interface ActionMenuProps {
  actions: { id: string; label: string; description: string }[];
  onSelect: (actionId: string) => void;
  onCancel: () => void;
  position?: 'top' | 'bottom';
}

export default function ActionMenu({ actions, onSelect, onCancel, position = 'bottom' }: ActionMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30"
      />
      {/* Menu */}
      <motion.div
        initial={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: position === 'bottom' ? 20 : -20, scale: 0.9 }}
        className={`absolute ${position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 z-50 min-w-[12rem]`}
      >
        <div className="bg-stone-900/95 backdrop-blur-md border border-amber-800/40 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="text-[9px] font-display text-amber-300/60 px-4 py-2 border-b border-amber-800/30 tracking-[0.2em] uppercase">
            Elegir acción
          </div>
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onSelect(action.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-amber-700/20 transition-colors border-b border-amber-800/20 last:border-0"
            >
              <div className="text-sm font-display text-amber-100">{action.label}</div>
              <div className="text-[10px] font-body text-amber-200/50">{action.description}</div>
            </button>
          ))}
          <button
            onClick={onCancel}
            className="w-full text-center px-4 py-2 text-xs font-display text-amber-200/40 hover:text-amber-200/70 hover:bg-amber-700/10 transition-colors"
          >
            CANCELAR
          </button>
        </div>
      </motion.div>
    </>
  );
}
