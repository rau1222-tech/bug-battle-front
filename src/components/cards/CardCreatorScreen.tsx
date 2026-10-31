import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import BackButton from '@/components/ui/BackButton';
import { useCards } from '@/hooks/useCards';
import { useCardCreate, type SkillConfigInput } from '@/hooks/useCardCreate';
import type { CardTemplate, CardType } from '@/constants';
import CardPreview from './CardPreview';
import SkillConfigurator from './SkillConfigurator';

interface Props {
  onBack: () => void;
}

const EMPTY_SKILL: SkillConfigInput = {
  skillId: null,
  accionTipo: 'DANIO_DIRECTO',
  potencia: 0,
  coste: 1,
  duracion: 0,
};

export default function CardCreatorScreen({ onBack }: Props) {
  const { skills } = useCards();
  const { createCard, creating } = useCardCreate();

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<CardType>('programador');
  const [descripcion, setDescripcion] = useState('');
  const [coste, setCoste] = useState(1);
  const [potencia, setPotencia] = useState(1);
  const [ataqueCoste, setAtaqueCoste] = useState(1);
  const [corduraMax, setCorduraMax] = useState(2);
  const [imageMode, setImageMode] = useState<'url' | 'upload'>('url');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [habilidades, setHabilidades] = useState<SkillConfigInput[]>([]);

  const preview = useMemo<CardTemplate>(() => ({
    id: 'preview',
    nombre,
    tipo,
    potencia: tipo === 'consumible' ? undefined : potencia,
    coste,
    ataqueCoste: tipo === 'consumible' ? undefined : ataqueCoste,
    corduraMax: tipo === 'consumible' ? undefined : corduraMax,
    descripcion,
    image: imageMode === 'url' ? imageUrl : imageFile ? URL.createObjectURL(imageFile) : undefined,
    habilidades: habilidades
      .filter((h) => h.skillId !== null)
      .map((h) => [h.skillId as number, h.potencia, h.coste, h.duracion]),
  }), [nombre, tipo, potencia, coste, ataqueCoste, corduraMax, descripcion, imageMode, imageUrl, imageFile, habilidades]);

  const updateSkill = (index: number, next: SkillConfigInput) => {
    setHabilidades((current) => current.map((item, idx) => (idx === index ? next : item)));
  };

  const removeSkill = (index: number) => {
    setHabilidades((current) => current.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createCard({
        nombre,
        tipo,
        potencia: tipo === 'consumible' ? undefined : potencia,
        coste,
        ataqueCoste: tipo === 'consumible' ? undefined : ataqueCoste,
        corduraMax: tipo === 'consumible' ? undefined : corduraMax,
        descripcion,
        imageUrl: imageMode === 'url' ? imageUrl : undefined,
        imageFile: imageMode === 'upload' ? imageFile : null,
        habilidades,
      });
      toast.success('Carta creada correctamente');
      onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la carta');
    }
  };

  return (
    <div className="min-h-[100dvh] w-full relative bg-[hsl(220,20%,6%)] bg-grid-pattern">
      <div className="fixed top-1/4 left-1/3 w-72 h-72 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/3 w-72 h-72 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-3 gap-2">
          <BackButton onClick={onBack} color="cyan" />
          <h1 className="font-display text-sm sm:text-lg text-cyan-100 tracking-wider text-glow-blue">
            🧪 CREAR CARTA
          </h1>
          <div className="w-20" />
        </div>

        <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-4 items-start">
          <form onSubmit={handleSubmit} className="rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Nombre</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100"
                  placeholder="Nombre de la carta"
                />
              </div>

              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Tipo</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as CardType)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100"
                >
                  <option value="programador">Programador</option>
                  <option value="qa">QA</option>
                  <option value="consumible">Consumible</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-body text-cyan-200/80 mb-1">Descripción</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full min-h-20 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 py-2 text-sm text-cyan-100"
                placeholder="Descripción de la carta"
              />
            </div>

            <div className="grid sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Coste</label>
                <input
                  type="number"
                  min={0}
                  value={coste}
                  onChange={(e) => setCoste(Number(e.target.value) || 0)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100"
                />
              </div>
              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Potencia</label>
                <input
                  type="number"
                  min={0}
                  disabled={tipo === 'consumible'}
                  value={tipo === 'consumible' ? 0 : potencia}
                  onChange={(e) => setPotencia(Number(e.target.value) || 0)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Ataque coste</label>
                <input
                  type="number"
                  min={0}
                  disabled={tipo === 'consumible'}
                  value={tipo === 'consumible' ? 0 : ataqueCoste}
                  onChange={(e) => setAtaqueCoste(Number(e.target.value) || 0)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-xs font-body text-cyan-200/80 mb-1">Cordura máx</label>
                <input
                  type="number"
                  min={0}
                  disabled={tipo === 'consumible'}
                  value={tipo === 'consumible' ? 0 : corduraMax}
                  onChange={(e) => setCorduraMax(Number(e.target.value) || 0)}
                  className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100 disabled:opacity-40"
                />
              </div>
            </div>

            <div className="rounded-md border border-cyan-500/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={`px-2 py-1 rounded text-[10px] font-display tracking-wider border ${imageMode === 'url' ? 'bg-cyan-500/30 border-cyan-400/40 text-cyan-100' : 'bg-[hsl(220,15%,12%)] border-cyan-800/30 text-cyan-300/70'}`}
                >
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={`px-2 py-1 rounded text-[10px] font-display tracking-wider border ${imageMode === 'upload' ? 'bg-cyan-500/30 border-cyan-400/40 text-cyan-100' : 'bg-[hsl(220,15%,12%)] border-cyan-800/30 text-cyan-300/70'}`}
                >
                  Upload
                </button>
              </div>

              {imageMode === 'url' ? (
                <div>
                  <label className="block text-xs font-body text-cyan-200/80 mb-1">Imagen (URL)</label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-body text-cyan-200/80 mb-1">Imagen (archivo)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="w-full h-10 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-3 text-sm text-cyan-100 file:bg-cyan-600/40 file:border-0 file:mr-2 file:px-2 file:py-1 file:rounded"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-display tracking-wider text-cyan-100">Habilidades</h2>
                <button
                  type="button"
                  onClick={() => setHabilidades((current) => [...current, { ...EMPTY_SKILL }])}
                  className="px-2.5 py-1.5 rounded bg-cyan-600/30 border border-cyan-500/30 text-[10px] font-display tracking-wider text-cyan-100 hover:bg-cyan-600/40"
                >
                  Añadir habilidad
                </button>
              </div>

              {habilidades.length === 0 ? (
                <p className="text-xs text-cyan-300/50">No hay habilidades agregadas.</p>
              ) : (
                <div className="space-y-2">
                  {habilidades.map((skill, index) => (
                    <SkillConfigurator
                      key={`skill-${index}`}
                      index={index}
                      value={skill}
                      skills={skills}
                      onChange={(next) => updateSkill(index, next)}
                      onRemove={() => removeSkill(index)}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full h-11 rounded-md bg-cyan-600/70 hover:bg-cyan-500/80 text-cyan-50 font-display text-xs tracking-[0.15em] border border-cyan-400/30 disabled:opacity-40"
            >
              {creating ? 'CREANDO...' : 'CREAR CARTA'}
            </button>
          </form>

          <div className="rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 backdrop-blur-md p-4">
            <h2 className="text-xs font-display tracking-wider text-cyan-100 mb-3">Preview</h2>
            <CardPreview card={preview} />
          </div>
        </div>
      </div>
    </div>
  );
}
