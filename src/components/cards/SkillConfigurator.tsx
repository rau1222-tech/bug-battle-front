import type { Skill } from '@/constants';
import type { SkillConfigInput } from '@/hooks/useCardCreate';

interface Props {
  index: number;
  value: SkillConfigInput;
  skills: Record<number, Skill>;
  onChange: (next: SkillConfigInput) => void;
  onRemove: () => void;
}

export default function SkillConfigurator({ index, value, skills, onChange, onRemove }: Props) {
  const selectedSkill = value.skillId !== null ? skills[value.skillId] : null;

  const updateSkill = (skillId: number | null) => {
    if (skillId === null) {
      onChange({
        ...value,
        skillId: null,
      });
      return;
    }

    const skill = skills[skillId];
    onChange({
      ...value,
      skillId,
      accionTipo: skill.accionTipo,
    });
  };

  const showDuration = selectedSkill?.accionTipo === 'APLICAR_ESTADO';
  const showPower = selectedSkill?.accionTipo !== 'DEVOLVER_MANO';

  return (
    <div className="rounded-md border border-cyan-500/20 bg-[hsl(220,18%,10%)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-display tracking-wider text-cyan-200">Habilidad {index + 1}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="px-2 py-1 rounded bg-red-600/25 border border-red-500/30 text-[10px] font-display tracking-wider text-red-200 hover:bg-red-600/35"
        >
          Quitar
        </button>
      </div>

      <label className="block text-[11px] font-body text-cyan-200/80">
        Habilidad disponible
      </label>
      <select
        value={value.skillId ?? ''}
        onChange={(e) => updateSkill(e.target.value ? Number(e.target.value) : null)}
        className="w-full h-9 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-2 text-sm text-cyan-100"
      >
        <option value="">Selecciona una habilidad</option>
        {Object.values(skills).map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.nombre}
          </option>
        ))}
      </select>

      {selectedSkill && (
        <p className="text-[11px] font-body text-cyan-300/60">{selectedSkill.descripcion}</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-body text-cyan-200/80 mb-1">Coste</label>
          <input
            type="number"
            min={0}
            value={value.coste}
            onChange={(e) => onChange({ ...value, coste: Number(e.target.value) || 0 })}
            className="w-full h-9 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-2 text-sm text-cyan-100"
          />
        </div>

        <div>
          <label className="block text-[11px] font-body text-cyan-200/80 mb-1">Potencia</label>
          <input
            type="number"
            min={0}
            disabled={!showPower}
            value={showPower ? value.potencia : 0}
            onChange={(e) => onChange({ ...value, potencia: Number(e.target.value) || 0 })}
            className="w-full h-9 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-2 text-sm text-cyan-100 disabled:opacity-40"
          />
        </div>

        <div>
          <label className="block text-[11px] font-body text-cyan-200/80 mb-1">Turnos</label>
          <input
            type="number"
            min={0}
            disabled={!showDuration}
            value={showDuration ? value.duracion : 0}
            onChange={(e) => onChange({ ...value, duracion: Number(e.target.value) || 0 })}
            className="w-full h-9 rounded bg-[hsl(220,15%,12%)] border border-cyan-800/30 px-2 text-sm text-cyan-100 disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
}
