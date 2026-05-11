import type { Effect } from './effects';
import defaultCardImage from '@/assets/cards/default-card.png';
import midDevAudio from '@/assets/audio/mid-dev.mp3';

export type CardType = 'programador' | 'qa' | 'consumible';

export interface CardTemplate {
  id: string;
  nombre: string;
  tipo: CardType;
  potencia?: number;
  coste: number;
  ataqueCoste?: number;
  corduraMax?: number;
  descripcion: string;
  image?: string;
  audio?: string;
  /** Cada tupla: [id_habilidad, potencia, coste, duracion] */
  habilidades: [number, number, number, number][];
}

export const DEFAULT_CARD_IMAGE = defaultCardImage;

export function resolveCardImage(image?: string): string {
  if (!image || image.trim().length === 0) return DEFAULT_CARD_IMAGE;
  return image;
}

export const CARD_DEFINITIONS: CardTemplate[] = [
  {
    id: 'junior-dev',
    nombre: 'Junior Dev',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    corduraMax: 2,
    descripcion: 'Resuelve bugs simples con entusiasmo.',
    habilidades: [],
  },
  {
    id: 'mid-dev',
    nombre: 'Mid Dev',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    corduraMax: 3,
    descripcion: 'Experiencia sólida en debugging.',
    audio: midDevAudio,
    habilidades: [],
  },
  {
    id: 'senior-dev',
    nombre: 'Senior Dev',
    tipo: 'programador',
    potencia: 3,
    coste: 3,
    ataqueCoste: 1,
    corduraMax: 4,
    descripcion: 'Veterano cazador de bugs.',
    audio: midDevAudio,
    habilidades: [[3, 2, 2, 1]],
  },
  {
    id: 'fullstack',
    nombre: 'Fullstack',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    corduraMax: 3,
    descripcion: 'Ataca bugs en frontend y backend.',
    audio: midDevAudio,
    habilidades: [[3, 1, 1, 1]],
  },
  {
    id: 'devops',
    nombre: 'DevOps',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    corduraMax: 2,
    descripcion: 'Automatiza la destrucción de bugs.',
    audio: midDevAudio,
    habilidades: [[5, 2, 2, 0]],
  },
  {
    id: 'intern',
    nombre: 'Intern',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    corduraMax: 2,
    descripcion: 'Novato con ganas de aprender.',
    habilidades: [],
  },
  {
    id: 'architect',
    nombre: 'Architect',
    tipo: 'programador',
    potencia: 3,
    coste: 2,
    ataqueCoste: 0,
    corduraMax: 5,
    descripcion: 'Diseña la solución desde la raíz.',
    audio: midDevAudio,
    habilidades: [[3, 3, 0, 1]],
  },
  {
    id: 'qa-tester',
    nombre: 'QA Tester',
    tipo: 'qa',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    corduraMax: 2,
    descripcion: 'Devuelve un programador rival a su mano.',
    audio: midDevAudio,
    habilidades: [[4, 0, 1, 0]],
  },
  {
    id: 'qa-lead',
    nombre: 'QA Lead',
    tipo: 'qa',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    corduraMax: 3,
    descripcion: 'Limpia la mesa del rival con autoridad.',
    audio: midDevAudio,
    habilidades: [[4, 0, 2, 0]],
  },
  {
    id: 'cafe-maquina',
    nombre: 'Café de Máquina',
    tipo: 'consumible',
    coste: 1,
    descripcion: 'Restaura 3 de cordura a un aliado.',
    habilidades: [[6, 3, 1, 0]],
  },
  {
    id: 'pr-aprobado',
    nombre: 'PR Aprobado',
    tipo: 'consumible',
    coste: 2,
    descripcion: '+2 potencia a un aliado por 1 turno.',
    habilidades: [[7, 2, 2, 1]],
  },
  {
    id: 'hotfix',
    nombre: 'Hotfix de Emergencia',
    tipo: 'consumible',
    coste: 2,
    descripcion: '2 de daño directo al Bug.',
    habilidades: [[8, 2, 2, 0]],
  },
];

export const BUG_MAX_COMPLEXITY = 10;
export const DECK_SIZE = 20;
export const INITIAL_DRAW = 4;
export const TABLE_MAX = 4;
export const MAX_HAND_SIZE = 6;
export const MAX_ENERGY_CAP = 10;
export const ENERGY_PER_TURN = 3;
export const ENERGY_BONUS_HIT = 1;

export interface CardInstance {
  instanceId: string;
  definition: CardTemplate;
  cordura: number;
  efectosActivos: Effect[];
  disponible: boolean;
}

export function calcularPotenciaReal(instance: CardInstance): number {
  const base = instance.definition.potencia ?? 0;
  const delta = instance.efectosActivos.reduce((acc, effect) => {
    if (effect.tipo === 'buff_ataque') return acc + effect.valor;
    if (effect.tipo === 'debuff_ataque') return acc - effect.valor;
    return acc;
  }, 0);
  return Math.max(0, base + delta);
}

export interface DeckComposition {
  card_id: string;
  quantity: number;
}

const defMap = new Map<string, CardTemplate>(CARD_DEFINITIONS.map((c) => [c.id, c]));

/**
 * Build a deck instance list. If a composition is provided, use it (each card_id repeated `quantity` times).
 * Otherwise fall back to a default round-robin distribution.
 */
export function createDeck(composition?: DeckComposition[]): CardInstance[] {
  const deck: CardInstance[] = [];
  let counter = 0;

  if (composition && composition.length > 0) {
    for (const entry of composition) {
      const def = defMap.get(entry.card_id);
      if (!def) continue;
      for (let i = 0; i < entry.quantity; i++) {
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def, cordura: def.corduraMax ?? 0, efectosActivos: [], disponible: true });
      }
    }
  } else {
    while (deck.length < DECK_SIZE) {
      for (const def of CARD_DEFINITIONS) {
        if (deck.length >= DECK_SIZE) break;
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def, cordura: def.corduraMax ?? 0, efectosActivos: [], disponible: true });
      }
    }
  }

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
