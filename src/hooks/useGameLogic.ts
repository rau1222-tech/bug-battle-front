import { useState, useCallback, useEffect, useRef } from 'react';
import { CardInstance, createDeck, BUG_MAX_COMPLEXITY, INITIAL_DRAW, TABLE_MAX, MAX_ENERGY_CAP, ENERGY_PER_TURN, ENERGY_BONUS_HIT, type DeckComposition } from '@/constants/cards';

export type BugState = 'idle' | 'hit' | 'death';
export type GamePhase = 'playing' | 'round-end' | 'game-over';
export type Turn = 'player' | 'bot';

interface GameState {
  bugComplexity: number;
  bugState: BugState;
  playerHand: CardInstance[];
  /** Slot-based table: fixed length TABLE_MAX, null = empty slot */
  playerTable: (CardInstance | null)[];
  playerDeck: CardInstance[];
  botHand: CardInstance[];
  botTable: (CardInstance | null)[];
  botDeck: CardInstance[];
  playerScore: number;
  botScore: number;
  roundNumber: number;
  gamePhase: GamePhase;
  turn: Turn;
  lastAttacker: 'player' | 'bot' | null;
  message: string;
  isFirstTurn: boolean;
  /** Cards that already used their ability this turn (by instanceId) */
  usedAbilityCards: string[];
  /** Highlighted bot card (currently acting) */
  botHighlightId: string | null;
  /** Highlighted player card (being targeted by bot QA) */
  playerTargetHighlightId: string | null;
  /** Energy available this turn for the player */
  playerEnergy: number;
  /** Energy available this turn for the bot */
  botEnergy: number;
  /** Max energy for this turn (grows each turn, capped) */
  playerMaxEnergy: number;
  botMaxEnergy: number;
  /** Turn counter (per player, increments each turn) */
  playerTurnCount: number;
  botTurnCount: number;
}

const MAX_ROUNDS = 3;

function drawFromDeck(deck: CardInstance[], count: number) {
  const actual = Math.min(count, deck.length);
  return { drawn: deck.slice(0, actual), remaining: deck.slice(actual) };
}

function emptyTable(): (CardInstance | null)[] {
  return Array.from({ length: TABLE_MAX }, () => null);
}

function initState(playerComp?: DeckComposition[]): GameState {
  const pDeck = createDeck(playerComp);
  const bDeck = createDeck(playerComp);
  const { drawn: playerHand, remaining: pR } = drawFromDeck(pDeck, INITIAL_DRAW);
  const { drawn: botHand, remaining: bR } = drawFromDeck(bDeck, INITIAL_DRAW);
  return {
    bugComplexity: BUG_MAX_COMPLEXITY,
    bugState: 'idle',
    playerHand,
    playerTable: emptyTable(),
    playerDeck: pR,
    botHand,
    botTable: emptyTable(),
    botDeck: bR,
    playerScore: 0,
    botScore: 0,
    roundNumber: 1,
    gamePhase: 'playing',
    turn: 'player',
    lastAttacker: null,
    message: '🎯 Tu turno — Arrastra cartas a un hueco de la mesa.',
    isFirstTurn: true,
    usedAbilityCards: [],
    botHighlightId: null,
    playerTargetHighlightId: null,
    playerEnergy: ENERGY_PER_TURN,
    botEnergy: ENERGY_PER_TURN,
    playerMaxEnergy: ENERGY_PER_TURN,
    botMaxEnergy: ENERGY_PER_TURN,
    playerTurnCount: 1,
    botTurnCount: 0,
  };
}

export function useGameLogic(playerComposition?: DeckComposition[]) {
  const [state, setState] = useState<GameState>(() => initState(playerComposition));
  const compRef = useRef(playerComposition);
  compRef.current = playerComposition;
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botStepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  // Bug hit animation reset
  useEffect(() => {
    if (state.bugState === 'hit') {
      const t = setTimeout(() => setState((s) => s.bugState !== 'idle' ? { ...s, bugState: 'idle' } : s), 400);
      return () => clearTimeout(t);
    }
  }, [state.bugState]);

  const checkRoundEnd = useCallback((hp: number, attacker: 'player' | 'bot', s: GameState) => {
    if (hp <= 0) {
      const pS = attacker === 'player' ? s.playerScore + 1 : s.playerScore;
      const bS = attacker === 'bot' ? s.botScore + 1 : s.botScore;
      const over = s.roundNumber >= MAX_ROUNDS || pS > MAX_ROUNDS / 2 || bS > MAX_ROUNDS / 2;
      return {
        bugComplexity: 0,
        bugState: 'death' as BugState,
        playerScore: pS,
        botScore: bS,
        gamePhase: (over ? 'game-over' : 'round-end') as GamePhase,
        lastAttacker: attacker,
        message: attacker === 'player' ? '🎉 ¡Eliminaste el Bug! +1 punto' : '💀 El Bot eliminó el Bug. +1 Bot.',
      };
    }
    return null;
  }, []);

  /** Player plays a card from hand to a SPECIFIC slot index */
  const playCardToTable = useCallback((cardId: string, slotIndex: number) => {
    setState((s) => {
      if (s.gamePhase !== 'playing' || s.turn !== 'player') return s;
      if (slotIndex < 0 || slotIndex >= TABLE_MAX) return s;
      if (s.playerTable[slotIndex] !== null) {
        return { ...s, message: '⚠️ Ese hueco ya está ocupado.' };
      }
      const card = s.playerHand.find((c) => c.instanceId === cardId);
      if (!card) return s;
      if (s.playerEnergy < card.definition.coste) {
        return { ...s, message: `⚠️ Necesitas ${card.definition.coste}⚡ (tienes ${s.playerEnergy})` };
      }
      const newTable = [...s.playerTable];
      newTable[slotIndex] = card;
      return {
        ...s,
        playerHand: s.playerHand.filter((c) => c.instanceId !== cardId),
        playerTable: newTable,
        playerEnergy: s.playerEnergy - card.definition.coste,
        message: `📋 ${card.definition.nombre} colocado (-${card.definition.coste}⚡).`,
      };
    });
  }, []);

  /** Player attacks bug with a card from the TABLE — ENDS TURN, card stays on table */
  const playerAttackBug = useCallback((cardId: string) => {
    setState((s) => {
      if (s.gamePhase !== 'playing' || s.turn !== 'player') return s;
      const card = s.playerTable.find((c) => c?.instanceId === cardId);
      if (!card || card.definition.tipo !== 'programador') return s;

      const newHP = Math.max(0, s.bugComplexity - card.definition.potencia);

      const end = checkRoundEnd(newHP, 'player', s);
      if (end) return { ...s, ...end };

      return {
        ...s, bugComplexity: newHP, bugState: 'hit',
        turn: 'bot', lastAttacker: 'player', isFirstTurn: false,
        usedAbilityCards: [],
        message: `⚔️ ${card.definition.nombre} atacó! Bug: ${newHP}/${BUG_MAX_COMPLEXITY} — Turno del Bot...`,
      };
    });
  }, [checkRoundEnd]);

  /** Player uses QA from TABLE — does NOT end turn, card stays, marked as used */
  const playerUseQA = useCallback((qaId: string, targetId: string) => {
    setState((s) => {
      if (s.gamePhase !== 'playing' || s.turn !== 'player') return s;
      const qa = s.playerTable.find((c) => c?.instanceId === qaId);
      if (!qa || qa.definition.tipo !== 'qa') return s;
      if (s.usedAbilityCards.includes(qaId)) return { ...s, message: '⚠️ Esta carta ya usó su habilidad este turno.' };
      if (s.playerEnergy < qa.definition.coste) {
        return { ...s, message: `⚠️ Necesitas ${qa.definition.coste}⚡ para usar la habilidad.` };
      }
      const targetIdx = s.botTable.findIndex((c) => c?.instanceId === targetId);
      if (targetIdx < 0) return s;
      const target = s.botTable[targetIdx]!;

      const newBotTable = [...s.botTable];
      newBotTable[targetIdx] = null;

      return {
        ...s,
        botTable: newBotTable,
        usedAbilityCards: [...s.usedAbilityCards, qaId],
        playerEnergy: s.playerEnergy - qa.definition.coste,
        message: `🔍 ${qa.definition.nombre} eliminó a ${target.definition.nombre}! (-${qa.definition.coste}⚡)`,
      };
    });
  }, []);

  /** Skip turn */
  const skipTurn = useCallback(() => {
    setState((s) => {
      if (s.gamePhase !== 'playing' || s.turn !== 'player') return s;
      return {
        ...s,
        turn: 'bot',
        isFirstTurn: false,
        usedAbilityCards: [],
        message: '⏭️ Turno saltado — Turno del Bot...',
      };
    });
  }, []);

  /** Bot turn — choreographed sequence of micro-actions */
  const botPlay = useCallback(() => {
    // Clear any prior pending steps
    botStepTimersRef.current.forEach(clearTimeout);
    botStepTimersRef.current = [];

    const schedule = (delay: number, fn: () => void) => {
      const t = setTimeout(fn, delay);
      botStepTimersRef.current.push(t);
    };

    let cursor = 0; // accumulated delay in ms
    const STEP_DRAW = 600;
    const STEP_PLACE = 700;
    const STEP_HIGHLIGHT = 900;
    const STEP_ACTION = 800;

    // ---- Step 1: draw (if not first turn) + gain energy ----
    if (!stateRef.current.isFirstTurn) {
      cursor += 200;
      schedule(cursor, () => {
        setState((s) => {
          if (s.gamePhase !== 'playing' || s.turn !== 'bot') return s;
          const bonus = s.lastAttacker === 'bot' ? ENERGY_BONUS_HIT : 0;
          const newEnergy = s.botEnergy + ENERGY_PER_TURN + bonus;
          if (s.botDeck.length === 0) return { ...s, botEnergy: newEnergy, botMaxEnergy: newEnergy, message: `🤖 Bot gana ${ENERGY_PER_TURN + bonus}⚡` };
          const { drawn, remaining } = drawFromDeck(s.botDeck, 1);
          return {
            ...s,
            botHand: [...s.botHand, ...drawn],
            botDeck: remaining,
            botEnergy: newEnergy,
            botMaxEnergy: newEnergy,
            message: `🤖 Bot roba una carta (+${ENERGY_PER_TURN + bonus}⚡)…`,
          };
        });
      });
      cursor += STEP_DRAW;
    }

    // ---- Step 2: place cards from hand into empty slots (respecting energy) ----
    schedule(cursor, () => {
      const placeNext = () => {
        let didPlace = false;
        setState((s) => {
          if (s.gamePhase !== 'playing' || s.turn !== 'bot') return s;
          if (s.botHand.length === 0) return s;
          const slotIdx = s.botTable.findIndex((c) => c === null);
          if (slotIdx < 0) return s;
          // Find cheapest playable card
          const playable = [...s.botHand].filter((c) => c.definition.coste <= s.botEnergy);
          if (playable.length === 0) return s;
          const card = playable[0];
          const newTable = [...s.botTable];
          newTable[slotIdx] = card;
          didPlace = true;
          return {
            ...s,
            botHand: s.botHand.filter((c) => c.instanceId !== card.instanceId),
            botTable: newTable,
            botHighlightId: card.instanceId,
            botEnergy: s.botEnergy - card.definition.coste,
            message: `🤖 Bot coloca ${card.definition.nombre} (-${card.definition.coste}⚡).`,
          };
        });
        if (didPlace) {
          const t = setTimeout(placeNext, STEP_PLACE);
          botStepTimersRef.current.push(t);
        } else {
          // Done placing → continue to action phase
          const t = setTimeout(runActionPhase, 400);
          botStepTimersRef.current.push(t);
        }
      };
      placeNext();
    });

    // ---- Step 3: action phase (QA optional, then attack) ----
    const runActionPhase = () => {
      setState((s) => ({ ...s, botHighlightId: null }));

      const s0 = stateRef.current;
      if (s0.turn !== 'bot' || s0.gamePhase !== 'playing') return;

      const qas = s0.botTable.filter((c): c is CardInstance => c?.definition.tipo === 'qa');
      const playerProgsIdx = s0.playerTable
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c?.definition.tipo === 'programador');

      let phaseCursor = 0;
      const wantsQA = qas.length > 0 && playerProgsIdx.length > 0 && s0.bugComplexity > 3;

      if (wantsQA) {
        const qa = qas[0];
        const bestIdx = playerProgsIdx.sort((a, b) => b.c!.definition.potencia - a.c!.definition.potencia)[0].i;
        const target = s0.playerTable[bestIdx]!;

        // 3a: highlight QA
        phaseCursor += 100;
        schedule(phaseCursor, () => {
          setState((s) => ({
            ...s,
            botHighlightId: qa.instanceId,
            message: `🤖 Bot prepara ${qa.definition.nombre}…`,
          }));
        });
        phaseCursor += STEP_HIGHLIGHT;

        // 3b: highlight target
        schedule(phaseCursor, () => {
          setState((s) => ({
            ...s,
            playerTargetHighlightId: target.instanceId,
            message: `🎯 Bot apunta a ${target.definition.nombre}…`,
          }));
        });
        phaseCursor += STEP_HIGHLIGHT;

        // 3c: eliminate
        schedule(phaseCursor, () => {
          setState((s) => {
            const newPT = [...s.playerTable];
            const idx = newPT.findIndex((c) => c?.instanceId === target.instanceId);
            if (idx >= 0) newPT[idx] = null;
            return {
              ...s,
              playerTable: newPT,
              botHighlightId: null,
              playerTargetHighlightId: null,
              message: `🔍 Bot eliminó ${target.definition.nombre}!`,
            };
          });
        });
        phaseCursor += STEP_ACTION;
      }

      // 3d: attack with programador
      phaseCursor += 200;
      schedule(phaseCursor, () => {
        setState((s) => {
          if (s.turn !== 'bot' || s.gamePhase !== 'playing') return s;
          const progs = s.botTable.filter((c): c is CardInstance => c?.definition.tipo === 'programador');
          if (progs.length === 0) {
            return {
              ...s,
              botHighlightId: null,
              playerTargetHighlightId: null,
              turn: 'player',
              isFirstTurn: false,
              usedAbilityCards: [],
              message: `🤖 Bot pasa — 🎯 Tu turno`,
            };
          }
          const sorted = [...progs].sort((a, b) =>
            s.bugComplexity <= 3
              ? b.definition.potencia - a.definition.potencia
              : a.definition.potencia - b.definition.potencia
          );
          const card = sorted[0];
          return {
            ...s,
            botHighlightId: card.instanceId,
            message: `🤖 Bot prepara ataque con ${card.definition.nombre}…`,
          };
        });
      });
      phaseCursor += STEP_HIGHLIGHT;

      schedule(phaseCursor, () => {
        setState((s) => {
          if (s.turn !== 'bot' || s.gamePhase !== 'playing') return s;
          const progs = s.botTable.filter((c): c is CardInstance => c?.definition.tipo === 'programador');
          if (progs.length === 0) return s;
          const sorted = [...progs].sort((a, b) =>
            s.bugComplexity <= 3
              ? b.definition.potencia - a.definition.potencia
              : a.definition.potencia - b.definition.potencia
          );
          const card = sorted[0];
          const newHP = Math.max(0, s.bugComplexity - card.definition.potencia);
          const end = checkRoundEnd(newHP, 'bot', s);
          if (end) return { ...s, ...end, botHighlightId: null };
          return {
            ...s,
            bugComplexity: newHP,
            bugState: 'hit',
            botHighlightId: null,
            playerTargetHighlightId: null,
            turn: 'player',
            lastAttacker: 'bot',
            isFirstTurn: false,
            usedAbilityCards: [],
            message: `⚔️ Bot atacó con ${card.definition.nombre}! Bug: ${newHP}/${BUG_MAX_COMPLEXITY} — 🎯 Tu turno`,
          };
        });
      });
    };
  }, [checkRoundEnd]);

  // Player draws 1 card at start of their turn (not first turn) + gain energy
  useEffect(() => {
    if (state.gamePhase === 'playing' && state.turn === 'player' && !state.isFirstTurn) {
      setState((s) => {
        const bonus = s.lastAttacker === 'player' ? ENERGY_BONUS_HIT : 0;
        const newEnergy = s.playerEnergy + ENERGY_PER_TURN + bonus;
        if (s.playerDeck.length === 0) return { ...s, playerEnergy: newEnergy, playerMaxEnergy: newEnergy };
        const { drawn, remaining } = drawFromDeck(s.playerDeck, 1);
        return { ...s, playerHand: [...s.playerHand, ...drawn], playerDeck: remaining, playerEnergy: newEnergy, playerMaxEnergy: newEnergy };
      });
    }
  }, [state.turn, state.gamePhase, state.isFirstTurn]);

  useEffect(() => {
    if (state.gamePhase === 'playing' && state.turn === 'bot') {
      // Brief "thinking" pause, then the choreographed bot turn starts
      const delay = 700 + Math.random() * 400;
      botTimerRef.current = setTimeout(botPlay, delay);
      return () => {
        if (botTimerRef.current) clearTimeout(botTimerRef.current);
        botStepTimersRef.current.forEach(clearTimeout);
        botStepTimersRef.current = [];
      };
    }
  }, [state.turn, state.gamePhase, botPlay]);

  const startNewRound = useCallback(() => {
    const pD = createDeck(compRef.current); const bD = createDeck(compRef.current);
    const { drawn: pH, remaining: pR } = drawFromDeck(pD, INITIAL_DRAW);
    const { drawn: bH, remaining: bR } = drawFromDeck(bD, INITIAL_DRAW);
    setState((s) => ({
      ...s, bugComplexity: BUG_MAX_COMPLEXITY, bugState: 'idle',
      playerHand: pH, playerTable: emptyTable(), playerDeck: pR,
      botHand: bH, botTable: emptyTable(), botDeck: bR,
      gamePhase: 'playing', turn: 'player', lastAttacker: null,
      roundNumber: s.roundNumber + 1, isFirstTurn: true,
      usedAbilityCards: [],
      botHighlightId: null,
      playerTargetHighlightId: null,
      playerEnergy: ENERGY_PER_TURN,
      botEnergy: ENERGY_PER_TURN,
      playerMaxEnergy: ENERGY_PER_TURN,
      botMaxEnergy: ENERGY_PER_TURN,
      playerTurnCount: 1,
      botTurnCount: 0,
      message: `🎯 Tu turno — Ronda ${s.roundNumber + 1}`,
    }));
  }, []);

  const restartGame = useCallback(() => setState(initState(compRef.current)), []);

  return { ...state, playerAttackBug, playerUseQA, playCardToTable, skipTurn, startNewRound, restartGame };
}
