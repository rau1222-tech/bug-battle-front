# Bug Battle — Diseño de Juego (Estado Actual)

## Flujo de una partida

Una partida consta de **3 rondas** (best of 3). Cada ronda tiene un **Bug** con 10 puntos de complejidad. El primer jugador (o bot) en reducirla a 0 gana el punto de esa ronda. Cuando un jugador acumula 2 puntos, gana la partida.

---

## Conceptos clave

### Energía ⚡

- Cada turno se reciben **3⚡** de energía.
- **Bonus**: si fuiste el último en golpear al Bug, recibes **+1⚡** extra.
- La energía se gasta al:
  - **Colocar una carta** de la mano al tablero → gasta el `coste` de invocación de la carta.
  - **Atacar con una carta** → gasta el `ataqueCoste` de la carta.
  - **Usar una habilidad especial** → gasta el `coste` definido en la tupla de la habilidad.
- No hay cap en la energía acumulada (crece cada turno).

### Turno del jugador

1. **Inicio**: roba 1 carta del mazo (excepto el primer turno) y recibe energía.
2. **Fase de acción libre** (repetible mientras haya cartas disponibles):
   - Colocar cartas de la mano al tablero (máximo 4 slots).
   - Seleccionar cualquier carta propia en el tablero → se abre un menú de acciones:
     - **Ataque básico** (si la carta tiene potencia > 0).
     - **Habilidades especiales** (si la carta las tiene y hay targets válidos).
   - Cada carta solo puede actuar **una vez** por turno (`disponible` pasa a `false`).
3. **Saltar turno**: pasa la acción al bot.

### Turno del bot

1. Roba carta y gana energía (igual que el jugador).
2. Coloca cartas de la mano en slots vacíos (prioriza las más baratas).
3. Si tiene cartas QA y el jugador tiene programadores en mesa (y la complejidad del bug > 3), usa la habilidad QA para devolver al mejor programador rival a su mano.
4. Ataca al bug con un programador disponible (elige según la complejidad restante).
5. Pasa turno al jugador.

---

## Tipos de carta

| Tipo | Ataque básico | Objetivo del ataque básico |
|---|---|---|
| **Programador** | Reduce complejidad del Bug | Bug |
| **QA** | Sube estrés a una carta enemiga | Carta enemiga |

### Estadísticas de una carta (CardTemplate)

| Campo | Descripción |
|---|---|
| `potencia` | Daño base del ataque básico |
| `coste` | Energía para colocar la carta en el tablero |
| `ataqueCoste` | Energía para ejecutar el ataque básico |
| `estresLimite` | Estrés máximo que aguanta; si lo alcanza, la carta es destruida |
| `habilidades` | Array de tuplas `[skillId, potencia, coste, duracion]` — habilidades especiales con duración |

### Carta en juego (CardInstance)

| Campo | Descripción |
|---|---|
| `estresActual` | Inicia en 0. Aumenta cuando recibe ataques de cartas QA enemigas |
| `efectosActivos` | Array de efectos temporales activos (ej: `{ tipo: 'buff_ataque', valor: 2, turnosRestantes: 1 }`) |
| `disponible` | `true` al inicio de cada turno; pasa a `false` tras actuar |

---

## Sistema de estrés

- Las cartas QA atacan a cartas enemigas, sumando su `potencia` al `estresActual` del objetivo.
- Cuando `estresActual >= estresLimite` → la carta es **destruida** (eliminada del tablero).
- Las cartas Programador **no pueden atacar** cartas enemigas directamente (solo al bug).

---

## Habilidades especiales

Las habilidades están definidas en un catálogo centralizado (`SKILLS`). Cada carta puede tener 0 o más habilidades referenciadas por tupla `[skillId, potencia, coste, duracion]`.

| ID | Nombre | Objetivo | Efecto | Duración |
|---|---|---|---|---|
| 3 | Par Programming | `carta_aliada` | Buff de ataque: suma `potencia` a la potencia efectiva del aliado | 1 turno |
| 4 | QA Testing | `carta_enemiga` | Devuelve una carta enemiga a la mano del rival | Inmediato (0) |
| 5 | Automatización | `bug` | Inflige daño directo al bug igual a la `potencia` de la tupla | Inmediato (0) |

### Restricciones de activación

- Si una habilidad tiene objetivo `carta_enemiga` y no hay cartas enemigas → no aparece en el menú.
- Si una habilidad tiene objetivo `carta_aliada` y no hay otra carta aliada (distinta a la fuente) → no aparece.
- Si no hay energía suficiente → se muestra deshabilitada con aviso.

---

## Cartas disponibles

| Carta | Tipo | Pot. | Coste | Atq.Coste | Estrés Lím. | Habilidades |
|---|---|---|---|---|---|---|
| Junior Dev 👶 | Programador | 1 | 1 | 1 | 2 | — |
| Mid Dev 💻 | Programador | 2 | 2 | 1 | 3 | — |
| Senior Dev 🧠 | Programador | 3 | 3 | 1 | 4 | Par Programming (pot:2, coste:2, dur:1) |
| Fullstack ⚡ | Programador | 2 | 2 | 1 | 3 | Par Programming (pot:1, coste:1, dur:1) |
| DevOps 🔧 | Programador | 1 | 1 | 1 | 2 | Automatización (pot:2, coste:2, dur:0) |
| Intern 🎒 | Programador | 1 | 1 | 1 | 2 | — |
| Architect 🏗️ | Programador | 3 | 2 | 0 | 5 | Par Programming (pot:3, coste:0, dur:1) |
| QA Tester 🔍 | QA | 1 | 1 | 1 | 2 | QA Testing (pot:0, coste:1, dur:0) |
| QA Lead 🛡️ | QA | 2 | 2 | 1 | 3 | QA Testing (pot:0, coste:2, dur:0) |

---

## Constantes de juego

| Constante | Valor |
|---|---|
| Complejidad del Bug | 10 |
| Tamaño del mazo | 20 |
| Robo inicial | 4 cartas |
| Slots en mesa | 4 |
| Energía por turno | 3 |
| Bonus por último golpe | +1 |
| Rondas máximas | 3 |

---

---

# Cosas a modificar

## ✅ 1. Bug: Par Programming no aplica el buff de potencia

### Implementado

- ✅ Refactor de `playerUseSkill` a switch por `skill.accionTipo` (elimina hardcoding por `skillId`)
- ✅ Interfaz `Effect` genérica con `tipo`, `valor`, `turnosRestantes`
- ✅ `CardInstance` migrada a `efectosActivos: Effect[]` (reemplaza `estados: Set<string>`)
- ✅ Función `calcularPotenciaReal()` que suma buffs/debuffs de efectos activos
- ✅ `playerAttackBug` y `playerAttackEnemy` usan potencia efectiva en cálculos
- ✅ `tickEfectos()` decrementa y expira efectos al fin de turno

---

## ✅ 2. Duración de efectos: añadir número de turnos al array de habilidades

### Implementado

- ✅ Tupla de habilidades ampliada a `[skillId, potencia, coste, duracion]`
- ✅ Duración controlada desde la carta, no desde la skill
- ✅ QA Testing: `duracion: 0` (acción instantánea)
- ✅ Par Programming: `duracion: 1` (buff por 1 turno)
- ✅ Automatización: `duracion: 0` (daño instantáneo)
- ✅ `playerUseSkill` lee `duracion` de la tupla (no de la skill)

---

## ✅ 3. Separar Skills, Efectos y Cartas en archivos distintos

### Implementado

- ✅ `src/constants/effects.ts` → `EffectType`, `Effect` interface
- ✅ `src/constants/skills.ts` → `Skill` interface, `SKILLS` catalog (sin `duracion`)
- ✅ `src/constants/cards.ts` → `CardTemplate`, `CardInstance`, `CARD_DEFINITIONS`, funciones de deck
- ✅ `src/constants/index.ts` → Barrel que re-exporta todo
- ✅ Todos los consumidores migrados a importar desde `@/constants`

---

## ✅ 4. Feedback visual de buffs/debuffs

### Implementado

- ✅ **Potencia visual dinámmica**: `GameCard` muestra `calcularPotenciaReal(card)` en lugar de `definition.potencia`
- ✅ **Coloreado por efecto**:
  - 🟢 Verde (`text-emerald-500`) si potencia real > base (buff activo)
  - 🔴 Rojo (`text-red-500`) si potencia real < base (debuff activo)
  - ⚪ Gris (`text-stone-800`) si son iguales (sin modificación)
- ✅ **Badge visual de efectos**: `✨` pulsa si `card.efectosActivos.length > 0`
- ✅ **Mensajes mejorados**: ataques muestran `"atacó con X de daño"`, buffs muestran `"recibe buff_ataque +2 por 1 turno(s)"`

**Pendiente:** Tooltip/desglose detallado de efectos activos (Potencia base: 3 | Buff: +2 (1 turno))

---

## ❌ 5. Visual del tablero: mano del bot ocupa demasiado espacio

### Pendiente

Las cartas de la **mano del rival** (boca abajo, parte superior) ocupan mucho espacio visual cuando el bot acumula varias cartas. En dispositivos móviles comprimen el resto del tablero.

### Propuesta

Reemplazar la fila de cartas boca abajo de la mano del bot por una **zona compacta** (esquina superior o lateral) con:
- Una sola carta boca abajo como representante visual.
- Un badge con el **número de cartas** en mano del bot (ej: `×3`).
- Esto libera espacio vertical para que las cartas del tablero rival (con sus stats de potencia, cordura, efectos) se vean con mayor claridad.

---

## ❌ 6. Rediseño visual de las cartas en el tablero

### Pendiente: Renombrar estrés → cordura

Cambiar la mecánica visual de estrés para que sea más intuitiva:
- **Cordura** empieza en el valor máximo (`estresLimite`) y baja cuando recibe daño.
- Cuando llega a **0**, la carta se destruye.
- Se muestra como un **número único** (la cordura restante), no como `X/Y`. Esto mantiene la carta limpia y es más intuitivo.
- Visualmente: `🧠 3` → recibe 1 de daño → `🧠 2` → recibe 2 más → `🧠 0` → carta destruida.

### Propuesta: Layout de la carta en tablero

```
┌──────────────┐
│  NOMBRE      │
│              │
│    😎 emoji  │
│              │
│  ⚔️2      🧠3│   ← potencia a la izquierda, cordura (número único) a la derecha
│              │
│  ⚡⚡        │   ← coste (solo en mano, no en tablero)
└──────────────┘
```

**Cambios necesarios:**
- Eliminar la descripción de texto de la carta cuando está en el tablero (solo mostrarla en la mano o en un tooltip).
- Potencia visible en la esquina inferior izquierda con icono ⚔️.
- Cordura como número único en la esquina inferior derecha con icono 🧠 (sin formato X/Y).
- Si la carta tiene habilidades, mostrar un pequeño icono/badge (ej: ✨) para indicar que tiene habilidad activable.
- El nombre de la carta más visible.

---

---

# Sugerencias de mejora (IA) — No implementadas

## Gameplay

1. **Ataque múltiple del bot** ❌: actualmente el bot solo ataca con 1 programador por turno. Podría atacar con todos los disponibles (consumiendo energía por cada uno), igual que el jugador.

2. **IA del bot mejorada** ❌: el bot no usa habilidades de buff (Par Programming). Añadir lógica para que use buffs en su programador más fuerte antes de atacar.

3. **Sistema de prioridad de ataque a cartas enemigas** ❌: los QA del jugador pueden atacar cualquier carta enemiga, pero no hay indicador de "amenaza". Mostrar qué carta enemiga tiene más potencia con un icono de peligro para guiar al jugador.

4. **Coste progresivo de energía** ❌: actualmente la energía crece indefinidamente cada turno. Considerar un cap (ya hay `MAX_ENERGY_CAP = 10` definido pero no usado en el código). Implementar el cap para que las partidas no se desequilibren en turnos tardíos.

5. **Más tipos de habilidades** ❌: con el sistema de efectos genérico ya implementado, se podrían añadir fácilmente:
   - **Escudo**: reduce el daño de estrés recibido durante N turnos.
   - **Stun**: la carta enemiga no puede actuar durante 1 turno.
   - **Robo de energía**: resta energía al rival y la suma a la propia.
   - **Curación**: reduce el estrés/cordura actual de una carta aliada.

## Visual

6. **Animaciones de efecto** ❌: al aplicar Par Programming, animar un destello verde en la carta aliada. Al usar QA Testing, animar la carta enemiga "volando" de vuelta a la mano.

7. **Historial de acciones mejorado** ❌: el log actual es texto plano. Reemplazar por un feed con iconos, colores por tipo de acción y agrupación por turno.

8. **Preview de daño** ❌: al pasar el ratón sobre "Atacar Bug", mostrar en el bug un preview del daño (número parpadeante o barra que se reduce temporalmente).

9. **Indicador de cartas restantes en mazo** ❌: ya existe el `DeckPile`, pero añadir un tooltip que muestre la composición restante del mazo (cuántas de cada tipo quedan).

10. **Modo oscuro/tema** ❌: las cartas y el tablero tienen un estilo medieval/fantasía. Considerar un tema alternativo "modo terminal" acorde con la temática de programadores (fondo oscuro tipo IDE, cartas con estética de código).
