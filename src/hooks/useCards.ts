import { useEffect, useState } from 'react';
import { CARD_DEFINITIONS, SKILLS, type CardTemplate, type CardType, type Skill } from '@/constants';
import { supabase } from '@/integrations/supabase/client';

export function useCards() {
  const [cards, setCards] = useState<CardTemplate[]>(CARD_DEFINITIONS);
  const [skills, setSkills] = useState<Record<number, Skill>>(SKILLS);
  const [gachaWeightById, setGachaWeightById] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [
          { data: cardRows, error: cardsErr },
          { data: skillRows, error: skillsErr },
          { data: skillDefs, error: skillDefsErr },
        ] = await Promise.all([
          supabase
            .from('cards')
            .select('id, nombre, tipo, potencia, coste, ataque_coste, cordura_max, descripcion, image_url, audio_url, gacha_peso')
            .order('nombre', { ascending: true }),
          supabase
            .from('card_skills')
            .select('card_id, skill_id, potencia, coste, duracion, orden')
            .order('orden', { ascending: true }),
          supabase
            .from('skills')
            .select('id, nombre, descripcion, objetivo, accion_tipo, efecto_tipo'),
        ]);

        if (cardsErr) throw new Error(cardsErr.message);
        if (skillsErr) throw new Error(skillsErr.message);
        if (skillDefsErr) throw new Error(skillDefsErr.message);

        const byCard = new Map<string, [number, number, number, number][]>();
        for (const row of skillRows ?? []) {
          const arr = byCard.get(row.card_id) ?? [];
          arr.push([row.skill_id, row.potencia, row.coste, row.duracion]);
          byCard.set(row.card_id, arr);
        }

        const nextCards: CardTemplate[] = (cardRows ?? []).map((row) => ({
          id: row.id,
          nombre: row.nombre,
          tipo: row.tipo as CardType,
          potencia: row.potencia ?? undefined,
          coste: row.coste,
          ataqueCoste: row.ataque_coste ?? undefined,
          corduraMax: row.cordura_max ?? undefined,
          descripcion: row.descripcion ?? '',
          image: row.image_url ?? undefined,
          audio: row.audio_url ?? undefined,
          habilidades: byCard.get(row.id) ?? [],
        }));

        const nextWeights = (cardRows ?? []).reduce<Record<string, number>>((acc, row) => {
          acc[row.id] = row.gacha_peso;
          return acc;
        }, {});

        const nextSkills = (skillDefs ?? []).reduce<Record<number, Skill>>((acc, row) => {
          acc[row.id] = {
            id: row.id,
            nombre: row.nombre,
            descripcion: row.descripcion ?? '',
            objetivo: row.objetivo as Skill['objetivo'],
            accionTipo: row.accion_tipo as Skill['accionTipo'],
            efectoTipo: (row.efecto_tipo ?? undefined) as Skill['efectoTipo'],
          };
          return acc;
        }, {});

        if (!cancelled && nextCards.length > 0) {
          setCards(nextCards);
          setGachaWeightById(nextWeights);
          if (Object.keys(nextSkills).length > 0) setSkills(nextSkills);
        }
      } catch (err) {
        console.warn('Failed to load cards from DB, falling back to local constants:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { cards, skills, gachaWeightById, loading };
}
