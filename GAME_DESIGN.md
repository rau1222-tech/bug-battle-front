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
  - **Usar un consumible desde la mano** → gasta el `coste` del consumible.
- Cap máximo de energía acumulada: 10.

### Turno del jugador

1. **Inicio**: roba 1 carta del mazo (excepto el primer turno) y recibe energía.
  - Si la mano ya tiene 6 cartas, no roba carta en ese turno.
2. **Fase de acción libre** (repetible mientras haya cartas disponibles):
   - Colocar cartas (programadores/QA) de la mano al tablero (máximo 4 slots).
   - Usar consumibles desde la mano (drag-and-drop o click en el target correspondiente).
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

| Tipo | Ataque básico | Objetivo del ataque básico | Se coloca en mesa |
|---|---|---|---|
| **Programador** | Reduce complejidad del Bug | Bug | Sí |
| **QA** | Reduce cordura de una carta enemiga | Carta enemiga | Sí |
| **Consumible** | No tiene ataque básico | — | No (se usa desde la mano) |

### Estadísticas de una carta (CardTemplate)

| Campo | Descripción |
|---|---|
| `potencia` | Daño base del ataque básico (opcional, no aplica a consumibles) |
| `coste` | Energía para colocar la carta en el tablero o usar el consumible |
| `ataqueCoste` | Energía para ejecutar el ataque básico (opcional) |
| `corduraMax` | Cordura inicial; al llegar a 0, la carta es destruida (opcional, no aplica a consumibles) |
| `habilidades` | Array de tuplas `[skillId, potencia, coste, duracion]` — habilidades especiales con duración |

### Carta en juego (CardInstance)

| Campo | Descripción |
|---|---|
| `cordura` | Inicia en `corduraMax`. Disminuye cuando recibe ataques de cartas QA enemigas. A 0 → destruida |
| `efectosActivos` | Array de efectos temporales activos (ej: `{ tipo: 'buff_ataque', valor: 2, turnosRestantes: 1 }`) |
| `disponible` | `true` al inicio de cada turno; pasa a `false` tras actuar |

---

## Sistema de cordura 🧠

- Las cartas en mesa tienen **cordura** que empieza en su valor máximo (`corduraMax`).
- Las cartas QA atacan a cartas enemigas, restando su `potencia` a la `cordura` del objetivo.
- Cuando `cordura <= 0` → la carta es **destruida** (eliminada del tablero).
- Las cartas Programador **no pueden atacar** cartas enemigas directamente (solo al bug).
- Visual: `🧠 3` → recibe 1 de daño → `🧠 2` → llega a 0 → carta destruida.
- Colores: verde (cordura llena), rojo (cordura baja).

---

## Consumibles 🧪

Los consumibles son un tercer tipo de carta que **no se coloca en el tablero**. Se usan directamente desde la mano:

### Mecánica

1. El jugador selecciona un consumible de su mano (click o drag).
2. Selecciona el target según la habilidad del consumible:
   - **Target `bug`**: se arrastra/hace click sobre el Bug central.
   - **Target `carta_aliada`**: se arrastra/hace click sobre una carta propia en mesa.
   - **Target `carta_enemiga`**: se arrastra/hace click sobre una carta enemiga en mesa.
3. Se gasta la energía del consumible, se aplica el efecto y la carta se descarta.

### Interacción (Drag & Drop + Click)

- **Drag**: arrastrar el consumible desde la mano hasta el target válido (Bug, aliado o enemigo).
- **Click**: hacer click en el consumible → se entra en modo de selección → click en el target.
- Feedback visual: glow cyan en el consumible seleccionado, ring highlights en targets válidos, hint pills indicando la acción.

### Consumibles disponibles

| Carta | Coste | Target | Efecto |
|---|---|---|---|
| Café de Máquina ☕ | 1 | Carta aliada | Restaura 3 de cordura |
| PR Aprobado ✅ | 2 | Carta aliada | +2 potencia por 1 turno |
| Hotfix de Emergencia 🚑 | 2 | Bug | 2 de daño directo |

---

## Habilidades especiales

Las habilidades están definidas en un catálogo centralizado (`SKILLS`). Cada carta puede tener 0 o más habilidades referenciadas por tupla `[skillId, potencia, coste, duracion]`.

| ID | Nombre | Objetivo | Efecto | Duración |
|---|---|---|---|---|
| 3 | Par Programming | `carta_aliada` | Buff de ataque: suma `potencia` a la potencia efectiva del aliado | 1 turno |
| 4 | QA Testing | `carta_enemiga` | Devuelve una carta enemiga a la mano del rival | Inmediato (0) |
| 5 | Automatización | `bug` | Inflige daño directo al bug igual a la `potencia` de la tupla | Inmediato (0) |
| 6 | Cafeína | `carta_aliada` | Restaura `potencia` puntos de cordura a un aliado | Inmediato (0) |
| 7 | Motivación | `carta_aliada` | Buff de ataque: suma `potencia` a la potencia efectiva del aliado | Configurable |
| 8 | Parche Rápido | `bug` | Inflige daño directo al bug | Inmediato (0) |

### Restricciones de activación

- Si una habilidad tiene objetivo `carta_enemiga` y no hay cartas enemigas → no aparece en el menú.
- Si una habilidad tiene objetivo `carta_aliada` y no hay otra carta aliada (distinta a la fuente) → no aparece.
- Si no hay energía suficiente → se muestra deshabilitada con aviso.
- Los consumibles ignoran la restricción de "distinta a la fuente" (pueden curar/buffear cualquier aliado en mesa).

---

## Cartas disponibles

### Programadores

| Carta | Tipo | Pot. | Coste | Atq.Coste | Cordura | Habilidades |
|---|---|---|---|---|---|---|
| Junior Dev 👶 | Programador | 1 | 1 | 1 | 2 | — |
| Mid Dev 💻 | Programador | 2 | 2 | 1 | 3 | — |
| Senior Dev 🧠 | Programador | 3 | 3 | 1 | 4 | Par Programming (pot:2, coste:2, dur:1) |
| Fullstack ⚡ | Programador | 2 | 2 | 1 | 3 | Par Programming (pot:1, coste:1, dur:1) |
| DevOps 🔧 | Programador | 1 | 1 | 1 | 2 | Automatización (pot:2, coste:2, dur:0) |
| Intern 🎒 | Programador | 1 | 1 | 1 | 2 | — |
| Architect 🏗️ | Programador | 3 | 2 | 0 | 5 | Par Programming (pot:3, coste:0, dur:1) |

### QA

| Carta | Tipo | Pot. | Coste | Atq.Coste | Cordura | Habilidades |
|---|---|---|---|---|---|---|
| QA Tester 🔍 | QA | 1 | 1 | 1 | 2 | QA Testing (pot:0, coste:1, dur:0) |
| QA Lead 🛡️ | QA | 2 | 2 | 1 | 3 | QA Testing (pot:0, coste:2, dur:0) |

### Consumibles

| Carta | Tipo | Coste | Target | Habilidad |
|---|---|---|---|---|
| Café de Máquina ☕ | Consumible | 1 | Carta aliada | Cafeína (pot:3, coste:1, dur:0) |
| PR Aprobado ✅ | Consumible | 2 | Carta aliada | Motivación (pot:2, coste:2, dur:1) |
| Hotfix de Emergencia 🚑 | Consumible | 2 | Bug | Parche Rápido (pot:2, coste:2, dur:0) |

---

## Constantes de juego

| Constante | Valor |
|---|---|
| Complejidad del Bug | 10 |
| Tamaño del mazo | 20 |
| Robo inicial | 4 cartas |
| Límite de mano | 6 cartas |
| Slots en mesa | 4 |
| Energía por turno | 3 |
| Bonus por último golpe | +1 |
| Cap máximo de energía | 10 |
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

- ✅ **Potencia visual dinámica**: `GameCard` muestra `calcularPotenciaReal(card)` en lugar de `definition.potencia`
- ✅ **Coloreado por efecto**:
  - 🟢 Verde (`text-emerald-500`) si potencia real > base (buff activo)
  - 🔴 Rojo (`text-red-500`) si potencia real < base (debuff activo)
  - ⚪ Gris (`text-stone-800`) si son iguales (sin modificación)
- ✅ **Badge visual de efectos**: `✨` pulsa si `card.efectosActivos.length > 0`
- ✅ **Mensajes mejorados**: ataques muestran `"atacó con X de daño"`, buffs muestran `"recibe buff_ataque +2 por 1 turno(s)"`

---

## ✅ 5. Visual del tablero: mano del bot ocupa demasiado espacio

### Implementado

Se reemplazó la fila de cartas de la **mano del rival** por un indicador compacto con estética consistente al tablero actual.

---

## ✅ 6. Renombrar estrés → cordura (mecánica invertida)

### Implementado

- ✅ `CardTemplate`: campo `corduraMax` sustituye a `estresLimite`
- ✅ `CardInstance`: campo `cordura` sustituye a `estresActual` (inicia en `corduraMax`, baja)
- ✅ Carta destruida cuando `cordura <= 0` (inverso al antiguo estrés)
- ✅ `createDeck()` inicializa `cordura: def.corduraMax ?? 0`
- ✅ `playerAttackEnemy` resta potencia de la cordura (en vez de sumar estrés)
- ✅ Visual: `🧠 N` con color verde (llena) → rojo (baja)
- ✅ `calcularPotenciaReal` usa `potencia ?? 0` para no romper consumibles sin potencia

---

## ✅ 7. Sistema de cartas consumibles

### Implementado

- ✅ `CardType = 'programador' | 'qa' | 'consumible'`
- ✅ 3 cartas consumibles: Café de Máquina, PR Aprobado, Hotfix de Emergencia
- ✅ 3 skills nuevas: Cafeína (id:6), Motivación (id:7), Parche Rápido (id:8)
- ✅ `SkillActionType` incluye `'CURAR_CORDURA'`
- ✅ `playerUseConsumable(cardInstanceId, targetId?)` en `useGameLogic`
- ✅ Consumibles no se colocan en mesa; se juegan desde la mano y se descartan
- ✅ Drag-and-drop contextual por tipo de target (bug, aliado, enemigo)
- ✅ Click path completo con fases de selección: `consumable-picking-ally`, `consumable-picking-enemy`
- ✅ Feedback visual: glow cyan, ring highlights, hint pills
- ✅ Mazo preset "Prueba Consumibles" para testing

---

## ✅ 8. Routing SPA con React Router

### Implementado

- ✅ Rutas centralizadas en `src/routes.ts` (fácil de cambiar en el futuro)
- ✅ `AuthGuard` como layout route (protege todas las rutas autenticadas)
- ✅ `AuthContext` con `user`, `profile`, `signOut` (evita re-llamar hooks)
- ✅ Páginas separadas: `HomePage`, `LoginPage`, `SetupPage`, `PlayPage`, `DecksPage`, `DeckEditorPage`, `GachaPage`
- ✅ Estado de navegación (`location.state`) para pasar composición de mazo a `/play`
- ✅ Componentes de UI no conocen las rutas (desacoplamiento total)
- ✅ Eliminado `Index.tsx` monolítico con `useState<Screen>`

### Mapa de rutas

| Ruta | Página | Auth |
|---|---|---|
| `/login` | LoginPage | No |
| `/setup` | SetupPage | Sí |
| `/` | HomePage | Sí |
| `/play` | PlayPage | Sí |
| `/decks` | DecksPage | Sí |
| `/decks/new` | DeckEditorPage | Sí |
| `/decks/edit/:deckId` | DeckEditorPage | Sí |
| `/gacha` | GachaPage | Sí |

---

---

# Sugerencias de mejora (IA) — No implementadas

## Gameplay

1. **Ataque múltiple del bot** ❌: actualmente el bot solo ataca con 1 programador por turno. Podría atacar con todos los disponibles (consumiendo energía por cada uno), igual que el jugador.

2. **IA del bot mejorada** ❌: el bot no usa habilidades de buff (Par Programming) ni consumibles. Añadir lógica para que use buffs en su programador más fuerte antes de atacar y juegue consumibles.

3. **Sistema de prioridad de ataque a cartas enemigas** ❌: los QA del jugador pueden atacar cualquier carta enemiga, pero no hay indicador de "amenaza". Mostrar qué carta enemiga tiene más potencia con un icono de peligro para guiar al jugador.

4. **Coste progresivo de energía** ❌: la energía tiene un cap en 10 (`MAX_ENERGY_CAP`). Considerar mecánicas adicionales como costes que escalen con el turno para variar la cadencia del juego.

5. **Más tipos de habilidades** ❌: con el sistema de efectos genérico ya implementado, se podrían añadir fácilmente:
   - **Escudo**: reduce el daño de cordura recibido durante N turnos.
   - **Stun**: la carta enemiga no puede actuar durante 1 turno.
   - **Robo de energía**: resta energía al rival y la suma a la propia.

6. **Tooltip detallado de efectos** ❌: al pasar el ratón sobre una carta con efectos activos, mostrar desglose (Potencia base: 3 | Buff: +2 (1 turno)).

## Visual

7. **Animaciones de efecto** ❌: al aplicar Par Programming, animar un destello verde en la carta aliada. Al usar QA Testing, animar la carta enemiga "volando" de vuelta a la mano.

8. **Historial de acciones mejorado** ❌: el log actual es texto plano. Reemplazar por un feed con iconos, colores por tipo de acción y agrupación por turno.

9. **Preview de daño** ❌: al pasar el ratón sobre "Atacar Bug", mostrar en el bug un preview del daño (número parpadeante o barra que se reduce temporalmente).

10. **Indicador de cartas restantes en mazo** ❌: ya existe el `DeckPile`, pero añadir un tooltip que muestre la composición restante del mazo (cuántas de cada tipo quedan).

11. **Modo oscuro/tema** ❌: considerar un tema alternativo "modo terminal" acorde con la temática de programadores (fondo oscuro tipo IDE, cartas con estética de código).
