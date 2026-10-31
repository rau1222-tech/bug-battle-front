import { describe, expect, it } from 'vitest';
import { LANGUAGES, NAMESPACES, makeTranslator, translate } from '@/i18n';
import { CARD_DEFINITIONS, SKILLS } from '@/constants';
import { ENGINE_MESSAGES_ES, applyAction, initMatch } from '@/game/onlineEngine';

describe('i18n dictionaries', () => {
  it.each(Object.entries(NAMESPACES))('%s has the same keys in every language', (_ns, messages) => {
    const reference = Object.keys(messages.es).sort();
    for (const { code } of LANGUAGES) {
      expect(Object.keys(messages[code]).sort()).toEqual(reference);
    }
  });

  it.each(Object.entries(NAMESPACES))('%s keeps the same {placeholders} across languages', (_ns, messages) => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, es] of Object.entries(messages.es)) {
      for (const { code } of LANGUAGES) {
        expect(placeholders(messages[code][key]), `${code}:${key}`).toEqual(placeholders(es));
      }
    }
  });

  it('translates every engine message template', () => {
    for (const key of Object.keys(ENGINE_MESSAGES_ES)) {
      expect(NAMESPACES.engine.en[key], key).toBeTruthy();
      expect(NAMESPACES.engine.fr[key], key).toBeTruthy();
    }
  });

  it('translates every built-in card and skill', () => {
    for (const { code } of LANGUAGES) {
      for (const card of CARD_DEFINITIONS) {
        expect(NAMESPACES.content[code][`card.${card.id}.name`], `${code}:${card.id}`).toBeTruthy();
        expect(NAMESPACES.content[code][`card.${card.id}.desc`], `${code}:${card.id}`).toBeTruthy();
      }
      for (const id of Object.keys(SKILLS)) {
        expect(NAMESPACES.content[code][`skill.${id}.name`], `${code}:${id}`).toBeTruthy();
      }
    }
  });

  it('interpolates params and falls back to the key', () => {
    expect(translate('en', 'engine.error.needEnergy', { cost: 2, energy: 1 })).toBe('⚠️ You need 2⚡ (you have 1)');
    expect(translate('fr', 'missing.key')).toBe('missing.key');
  });
});

describe('engine messages', () => {
  const deck = [{ card_id: 'senior-dev', quantity: 20 }];
  const s = initMatch(1, { p1: deck, p2: deck }, { p1: 'Ana', p2: 'Beto' }, 'p1');

  it('keeps the Spanish message in sync with the structured one', () => {
    expect(s.message).toBe('🎯 Empieza Ana');
    expect(makeTranslator('es').gameMessage(s.msg!)).toBe(s.message);
  });

  it('renders log messages with translated card names', () => {
    const card = s.sides.p1.hand[0];
    const r = applyAction(s, { type: 'PLACE_CARD', side: 'p1', cardId: card.instanceId, slot: 0 });
    expect(makeTranslator('en').gameMessage(r.state.msg!)).toBe('📋 Ana plays Senior Dev (-3⚡).');
    expect(makeTranslator('fr').gameMessage(r.state.msg!)).toBe('📋 Ana pose Dev Senior (-3⚡).');
  });

  it('returns structured errors', () => {
    const r = applyAction(s, { type: 'END_TURN', side: 'p2' });
    expect(r.error).toBe('No es tu turno');
    expect(makeTranslator('en').gameMessage(r.errorMsg!)).toBe("It's not your turn");
  });
});
