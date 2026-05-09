export type SkillTarget = 'bug' | 'carta_enemiga' | 'carta_aliada';

export interface Skill {
  id: number;
  nombre: string;
  descripcion: string;
  objetivo: SkillTarget;
}

export const SKILLS: Record<number, Skill> = {
  3: { id: 3, nombre: 'Par Programming', descripcion: 'Aumenta la potencia de una carta aliada este turno.', objetivo: 'carta_aliada'  },
  4: { id: 4, nombre: 'QA Testing',      descripcion: 'Devuelve una carta programadora enemiga a la mano del rival.', objetivo: 'carta_enemiga' },
  5: { id: 5, nombre: 'Automatización',  descripcion: 'Inflige daño extra al bug igual a la potencia indicada.', objetivo: 'bug'           },
};

export type CardType = 'programador' | 'qa';

export interface CardTemplate {
  id: string;
  nombre: string;
  tipo: CardType;
  potencia: number;
  coste: number;
  ataqueCoste: number;
  estresLimite: number;
  descripcion: string;
  emoji: string;
  /** Cada tupla: [id_habilidad, potencia, coste] */
  habilidades: [number, number, number][];
}

export const CARD_DEFINITIONS: CardTemplate[] = [
  {
    id: 'junior-dev',
    nombre: 'Junior Dev',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    estresLimite: 2,
    descripcion: 'Resuelve bugs simples con entusiasmo.',
    emoji: '👶',
    habilidades: [],
  },
  {
    id: 'mid-dev',
    nombre: 'Mid Dev',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    estresLimite: 3,
    descripcion: 'Experiencia sólida en debugging.',
    emoji: '💻',
    habilidades: [],
  },
  {
    id: 'senior-dev',
    nombre: 'Senior Dev',
    tipo: 'programador',
    potencia: 3,
    coste: 3,
    ataqueCoste: 1,
    estresLimite: 4,
    descripcion: 'Veterano cazador de bugs.',
    emoji: '🧠',
    habilidades: [[3, 2, 2]],
  },
  {
    id: 'fullstack',
    nombre: 'Fullstack',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    estresLimite: 3,
    descripcion: 'Ataca bugs en frontend y backend.',
    emoji: '⚡',
    habilidades: [[3, 1, 1]],
  },
  {
    id: 'devops',
    nombre: 'DevOps',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    estresLimite: 2,
    descripcion: 'Automatiza la destrucción de bugs.',
    emoji: '🔧',
    habilidades: [[5, 2, 2]],
  },
  {
    id: 'intern',
    nombre: 'Intern',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    estresLimite: 2,
    descripcion: 'Novato con ganas de aprender.',
    emoji: '🎒',
    habilidades: [],
  },
  {
    id: 'architect',
    nombre: 'Architect',
    tipo: 'programador',
    potencia: 3,
    coste: 2,
    ataqueCoste: 0,
    estresLimite: 5,
    descripcion: 'Diseña la solución desde la raíz.',
    emoji: '🏗️',
    habilidades: [[3, 3, 0]],
  },
  {
    id: 'qa-tester',
    nombre: 'QA Tester',
    tipo: 'qa',
    potencia: 1,
    coste: 1,
    ataqueCoste: 1,
    estresLimite: 2,
    descripcion: 'Devuelve un programador rival a su mano.',
    emoji: '🔍',
    habilidades: [[4, 0, 1]],
  },
  {
    id: 'qa-lead',
    nombre: 'QA Lead',
    tipo: 'qa',
    potencia: 2,
    coste: 2,
    ataqueCoste: 1,
    estresLimite: 3,
    descripcion: 'Limpia la mesa del rival con autoridad.',
    emoji: '🛡️',
    habilidades: [[4, 0, 2]],
  },
];

export const BUG_MAX_COMPLEXITY = 10;
export const DECK_SIZE = 20;
export const INITIAL_DRAW = 4;
export const TABLE_MAX = 4;
export const MAX_ENERGY_CAP = 10;
export const ENERGY_PER_TURN = 3;
export const ENERGY_BONUS_HIT = 1;

export interface CardInstance {
  instanceId: string;
  definition: CardTemplate;
  estresActual: number;
  estados: Set<string>;
  disponible: boolean;
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
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def, estresActual: 0, estados: new Set(), disponible: true });
      }
    }
  } else {
    while (deck.length < DECK_SIZE) {
      for (const def of CARD_DEFINITIONS) {
        if (deck.length >= DECK_SIZE) break;
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def, estresActual: 0, estados: new Set(), disponible: true });
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
