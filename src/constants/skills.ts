import type { EffectType } from './effects';

export type SkillTarget = 'bug' | 'carta_enemiga' | 'carta_aliada';

export type SkillActionType = 'APLICAR_ESTADO' | 'DEVOLVER_MANO' | 'DANIO_DIRECTO' | 'CURAR_CORDURA';

export interface Skill {
  id: number;
  nombre: string;
  descripcion: string;
  objetivo: SkillTarget;
  accionTipo: SkillActionType;
  efectoTipo?: EffectType;
}

export const SKILLS: Record<number, Skill> = {
  3: {
    id: 3,
    nombre: 'Par Programming',
    descripcion: 'Aumenta la potencia de una carta aliada este turno.',
    objetivo: 'carta_aliada',
    accionTipo: 'APLICAR_ESTADO',
    efectoTipo: 'buff_ataque',
  },
  4: {
    id: 4,
    nombre: 'QA Testing',
    descripcion: 'Devuelve una carta programadora enemiga a la mano del rival.',
    objetivo: 'carta_enemiga',
    accionTipo: 'DEVOLVER_MANO',
  },
  5: {
    id: 5,
    nombre: 'Automatización',
    descripcion: 'Inflige daño extra al bug igual a la potencia indicada.',
    objetivo: 'bug',
    accionTipo: 'DANIO_DIRECTO',
  },
  6: {
    id: 6,
    nombre: 'Cafeína',
    descripcion: 'Restaura cordura a un aliado.',
    objetivo: 'carta_aliada',
    accionTipo: 'CURAR_CORDURA',
  },
  7: {
    id: 7,
    nombre: 'Motivación',
    descripcion: 'Aumenta la potencia de una carta aliada.',
    objetivo: 'carta_aliada',
    accionTipo: 'APLICAR_ESTADO',
    efectoTipo: 'buff_ataque',
  },
  8: {
    id: 8,
    nombre: 'Parche Rápido',
    descripcion: 'Inflige daño directo al bug.',
    objetivo: 'bug',
    accionTipo: 'DANIO_DIRECTO',
  },
};
