export type CardType = 'programador' | 'qa';

export interface CardDefinition {
  id: string;
  nombre: string;
  tipo: CardType;
  potencia: number;
  coste: number;
  descripcion: string;
  emoji: string;
}

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'junior-dev',
    nombre: 'Junior Dev',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    descripcion: 'Resuelve bugs simples con entusiasmo.',
    emoji: '👶',
  },
  {
    id: 'mid-dev',
    nombre: 'Mid Dev',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    descripcion: 'Experiencia sólida en debugging.',
    emoji: '💻',
  },
  {
    id: 'senior-dev',
    nombre: 'Senior Dev',
    tipo: 'programador',
    potencia: 3,
    coste: 3,
    descripcion: 'Veterano cazador de bugs.',
    emoji: '🧠',
  },
  {
    id: 'fullstack',
    nombre: 'Fullstack',
    tipo: 'programador',
    potencia: 2,
    coste: 2,
    descripcion: 'Ataca bugs en frontend y backend.',
    emoji: '⚡',
  },
  {
    id: 'devops',
    nombre: 'DevOps',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    descripcion: 'Automatiza la destrucción de bugs.',
    emoji: '🔧',
  },
  {
    id: 'intern',
    nombre: 'Intern',
    tipo: 'programador',
    potencia: 1,
    coste: 1,
    descripcion: 'Novato con ganas de aprender.',
    emoji: '🎒',
  },
  {
    id: 'architect',
    nombre: 'Architect',
    tipo: 'programador',
    potencia: 3,
    coste: 3,
    descripcion: 'Diseña la solución desde la raíz.',
    emoji: '🏗️',
  },
  {
    id: 'qa-tester',
    nombre: 'QA Tester',
    tipo: 'qa',
    potencia: 1,
    coste: 1,
    descripcion: 'Devuelve un programador rival a su mano.',
    emoji: '🔍',
  },
  {
    id: 'qa-lead',
    nombre: 'QA Lead',
    tipo: 'qa',
    potencia: 2,
    coste: 2,
    descripcion: 'Limpia la mesa del rival con autoridad.',
    emoji: '🛡️',
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
  definition: CardDefinition;
}

export interface DeckComposition {
  card_id: string;
  quantity: number;
}

const defMap = new Map(CARD_DEFINITIONS.map((c) => [c.id, c]));

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
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def });
      }
    }
  } else {
    while (deck.length < DECK_SIZE) {
      for (const def of CARD_DEFINITIONS) {
        if (deck.length >= DECK_SIZE) break;
        deck.push({ instanceId: `${def.id}-${counter++}`, definition: def });
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
