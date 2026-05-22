import { useState } from 'react';
import type { CardType, SkillActionType } from '@/constants';
import { supabase } from '@/integrations/supabase/client';

const CARD_IMAGES_BUCKET = 'card-images';

export interface SkillConfigInput {
  skillId: number | null;
  accionTipo: SkillActionType;
  potencia: number;
  coste: number;
  duracion: number;
}

export interface CreateCardInput {
  nombre: string;
  tipo: CardType;
  potencia?: number;
  coste: number;
  ataqueCoste?: number;
  corduraMax?: number;
  descripcion: string;
  imageUrl?: string;
  imageFile?: File | null;
  habilidades: SkillConfigInput[];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeSkill(skill: SkillConfigInput) {
  const base = {
    potencia: Math.max(0, Math.floor(skill.potencia)),
    coste: Math.max(0, Math.floor(skill.coste)),
    duracion: Math.max(0, Math.floor(skill.duracion)),
  };

  if (skill.accionTipo === 'APLICAR_ESTADO') return base;
  if (skill.accionTipo === 'DANIO_DIRECTO') return { ...base, duracion: 0 };
  if (skill.accionTipo === 'CURAR_CORDURA') return { ...base, duracion: 0 };
  if (skill.accionTipo === 'DEVOLVER_MANO') return { ...base, potencia: 0, duracion: 0 };
  return base;
}

export function useCardCreate() {
  const [creating, setCreating] = useState(false);

  const createCard = async (input: CreateCardInput) => {
    const nombre = input.nombre.trim();
    const descripcion = input.descripcion.trim();

    if (!nombre) throw new Error('El nombre es obligatorio');
    if (input.coste < 0) throw new Error('El coste no puede ser negativo');

    if (input.tipo !== 'consumible') {
      if ((input.potencia ?? 0) < 0) throw new Error('La potencia no puede ser negativa');
      if ((input.corduraMax ?? 0) <= 0) throw new Error('La cordura máxima debe ser mayor que 0');
    }

    const hasInvalidSkill = input.habilidades.some((s) => s.skillId === null);
    if (hasInvalidSkill) throw new Error('Todas las habilidades deben tener una selección válida');

    setCreating(true);
    const baseId = slugify(nombre) || 'card';
    const cardId = `${baseId}-${Date.now().toString(36)}`;
    let uploadedPath: string | null = null;

    try {
      let imageUrl = input.imageUrl?.trim() || null;

      if (input.imageFile) {
        const extension = input.imageFile.name.split('.').pop() || 'png';
        const filePath = `${cardId}.${extension}`;
        uploadedPath = filePath;

        const { error: uploadError } = await supabase.storage
          .from(CARD_IMAGES_BUCKET)
          .upload(filePath, input.imageFile, { upsert: true });

        if (uploadError) throw new Error(uploadError.message);

        const { data } = supabase.storage.from(CARD_IMAGES_BUCKET).getPublicUrl(filePath);
        imageUrl = data.publicUrl;
      }

      const { error: cardError } = await supabase.from('cards').insert({
        id: cardId,
        nombre,
        tipo: input.tipo,
        potencia: input.tipo === 'consumible' ? null : (input.potencia ?? 0),
        coste: Math.max(0, Math.floor(input.coste)),
        ataque_coste: input.tipo === 'consumible' ? null : (input.ataqueCoste ?? 0),
        cordura_max: input.tipo === 'consumible' ? null : (input.corduraMax ?? 0),
        descripcion,
        image_url: imageUrl,
        gacha_peso: 1,
      });

      if (cardError) throw new Error(cardError.message);

      if (input.habilidades.length > 0) {
        const rows = input.habilidades.map((skill, index) => {
          const normalized = normalizeSkill(skill);
          return {
            card_id: cardId,
            skill_id: skill.skillId as number,
            potencia: normalized.potencia,
            coste: normalized.coste,
            duracion: normalized.duracion,
            orden: index,
          };
        });

        const { error: skillsError } = await supabase.from('card_skills').insert(rows);

        if (skillsError) {
          await supabase.from('cards').delete().eq('id', cardId);
          throw new Error(skillsError.message);
        }
      }

      return cardId;
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(CARD_IMAGES_BUCKET).remove([uploadedPath]);
      }
      throw error;
    } finally {
      setCreating(false);
    }
  };

  return { createCard, creating };
}
