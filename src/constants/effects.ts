export type EffectType = 'buff_ataque' | 'debuff_ataque' | 'escudo';

export interface Effect {
  tipo: EffectType;
  valor: number;
  turnosRestantes: number;
}
