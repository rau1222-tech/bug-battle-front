import { useState } from 'react';
import { motion } from 'framer-motion';

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
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-[hsl(220,20%,6%)] bg-grid-pattern">
      {/* Ambient glow effects */}
      <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-60 h-60 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="z-10 w-full max-w-sm px-4"
      >
        {/* Logo section */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-6xl mb-3 inline-block"
          >
            🐛
          </motion.div>
          <h1 className="text-3xl font-display font-bold text-cyan-100 tracking-[0.2em] text-glow-blue">
            BUG HUNTERS
          </h1>
        </div>

        {/* Terminal-style panel */}
        <div className="rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.15)] overflow-hidden">
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-cyan-500/10 bg-[hsl(220,18%,10%)]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="ml-2 text-[10px] font-body text-cyan-400/50 tracking-wider uppercase">
              ~/bug-hunters/new-hunter
            </span>
          </div>

          {/* Panel content */}
          <div className="p-5 flex flex-col gap-4">
            <h2 className="text-center font-display text-lg text-cyan-100 tracking-wide">
              ¡Bienvenido, cazador!
            </h2>
            <p className="text-center text-[11px] text-cyan-300/40 font-body -mt-2">
              Elige el nombre con el que jugarás
            </p>

            {avatarUrl && (
              <div className="flex justify-center">
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover border-2 border-cyan-400/30 shadow-[0_0_15px_-3px_hsl(200,100%,50%,0.2)]"
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
                className="h-11 px-4 rounded-md bg-[hsl(220,15%,12%)] border border-cyan-500/15 text-cyan-100 text-sm font-body placeholder:text-cyan-300/20 focus:outline-none focus:border-cyan-400/40 focus:shadow-[0_0_10px_-3px_hsl(200,100%,50%,0.2)] transition-all text-center"
              />

              {error && (
                <p className="text-xs text-red-400 font-body text-center">{error}</p>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="h-11 rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 text-white hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 font-display text-sm tracking-wider transition-all shadow-[0_0_20px_-5px_hsl(200,100%,50%,0.3)] hover:shadow-[0_0_25px_-5px_hsl(200,100%,50%,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '...' : 'CONFIRMAR'}
              </motion.button>
            </form>
          </div>

          {/* Terminal footer */}
          <div className="px-4 py-2 border-t border-cyan-500/10 bg-[hsl(220,18%,10%)]">
            <p className="text-[10px] font-body text-cyan-400/30 flex items-center gap-1">
              <span className="text-green-400/60">❯</span> Podrás cambiar tu nombre más adelante.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
