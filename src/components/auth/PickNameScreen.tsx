import { useState } from 'react';
import { motion } from 'framer-motion';
import boardBg from '@/assets/game-board-bg.png';

interface PickNameScreenProps {
  suggestedName?: string;
  avatarUrl?: string | null;
  onConfirm: (name: string) => Promise<void>;
}

export default function PickNameScreen({ suggestedName, avatarUrl, onConfirm }: PickNameScreenProps) {
  const [name, setName] = useState(suggestedName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres');
      return;
    }
    if (trimmed.length > 40) {
      setError('Máximo 40 caracteres');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onConfirm(trimmed);
    } catch {
      setError('Error al guardar. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div
      className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: `url(${boardBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6 z-10 px-6 w-full max-w-sm"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl"
        >
          🐛
        </motion.div>

        <div className="w-full rounded-2xl bg-stone-900/80 border border-amber-700/30 backdrop-blur-md p-6 shadow-xl shadow-black/40">
          <h2 className="text-center font-display text-lg text-amber-100 tracking-wide mb-1">
            ¡Bienvenido, cazador!
          </h2>
          <p className="text-center text-[11px] text-amber-200/40 font-body mb-5">
            Elige el nombre con el que jugarás
          </p>

          {avatarUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={avatarUrl}
                alt=""
                className="w-16 h-16 rounded-full object-cover border-2 border-amber-600/40 shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Tu nombre de jugador"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoFocus
              className="h-11 px-4 rounded-lg bg-stone-800/70 border border-amber-700/20 text-amber-100 text-sm font-body placeholder:text-amber-200/20 focus:outline-none focus:border-amber-500/50 transition-colors text-center"
            />

            {error && (
              <p className="text-xs text-red-400 font-body text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-lg bg-amber-700/70 text-amber-100 hover:bg-amber-600/70 border border-amber-500/30 font-display text-sm tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'CONFIRMAR'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
