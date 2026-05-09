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
| `habilidades` | Array de tuplas `[skillId, potencia, coste]` — habilidades especiales |

### Carta en juego (CardInstance)

| Campo | Descripción |
|---|---|
| `estresActual` | Inicia en 0. Aumenta cuando recibe ataques de cartas QA enemigas |
| `estados` | `Set<string>` para efectos temporales (ej: `buff_ataque`) |
| `disponible` | `true` al inicio de cada turno; pasa a `false` tras actuar |

---

## Sistema de estrés

- Las cartas QA atacan a cartas enemigas, sumando su `potencia` al `estresActual` del objetivo.
- Cuando `estresActual >= estresLimite` → la carta es **destruida** (eliminada del tablero).
- Las cartas Programador **no pueden atacar** cartas enemigas directamente (solo al bug).

---

## Habilidades especiales

Las habilidades están definidas en un catálogo centralizado (`SKILLS`). Cada carta puede tener 0 o más habilidades referenciadas por tupla `[skillId, potencia, coste]`.

| ID | Nombre | Objetivo | Efecto actual |
|---|---|---|---|
| 3 | Par Programming | `carta_aliada` | Añade el estado `buff_ataque` al aliado seleccionado |
| 4 | QA Testing | `carta_enemiga` | Devuelve una carta enemiga a la mano del rival |
| 5 | Automatización | `bug` | Inflige daño directo al bug igual a la `potencia` de la tupla |

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
| Senior Dev 🧠 | Programador | 3 | 3 | 1 | 4 | Par Programming (pot:2, coste:2) |
| Fullstack ⚡ | Programador | 2 | 2 | 1 | 3 | Par Programming (pot:1, coste:1) |
| DevOps 🔧 | Programador | 1 | 1 | 1 | 2 | Automatización (pot:2, coste:2) |
| Intern 🎒 | Programador | 1 | 1 | 1 | 2 | — |
| Architect 🏗️ | Programador | 3 | 2 | 0 | 5 | Par Programming (pot:3, coste:0) |
| QA Tester 🔍 | QA | 1 | 1 | 1 | 2 | QA Testing (pot:0, coste:1) |
| QA Lead 🛡️ | QA | 2 | 2 | 1 | 3 | QA Testing (pot:0, coste:2) |

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

## 1. Bug: Par Programming no aplica el buff de potencia

### Problema

Cuando se usa Par Programming, la carta aliada recibe el estado `buff_ataque` en su `Set<string> estados`, pero **nadie lee ese estado**. Las funciones `playerAttackBug` y `playerAttackEnemy` usan directamente `card.definition.potencia` (que es inmutable del template) e ignoran completamente `card.estados`.

La habilidad se ejecuta, la energía se consume, el mensaje aparece, pero la carta aliada ataca con la misma potencia de siempre.

### Rediseño propuesto: efectos genéricos basados en la potencia de la tupla

El problema de fondo es que cada habilidad tiene código hardcodeado por `skillId` dentro de `playerUseSkill`. Si las habilidades están numerizadas para evitar tener atributos ad-hoc por tipo, **los efectos deben seguir la misma filosofía**: la potencia de la tupla `[skillId, potencia, coste]` debe trasladarse automáticamente al estado/efecto que reciba la carta objetivo, sin lógica específica por skill.

**Propuesta:**
- Cuando una habilidad se aplica sobre una carta (aliada o enemiga), se debe crear un **efecto** asociado a esa carta que contenga: el tipo de modificación (ej: `+potencia`, `-potencia`), el valor (tomado de la `potencia` de la tupla) y la duración en turnos.
- Las funciones de ataque (`playerAttackBug`, `playerAttackEnemy`, y la del bot) deben calcular la potencia efectiva sumando `definition.potencia` + todos los modificadores de efectos activos.
- Los efectos deben decrementarse automáticamente al pasar turno y eliminarse cuando expiren.

---

## 2. Duración de efectos: añadir número de turnos al array de habilidades

### Cambio

Ampliar la tupla de habilidades de `[skillId, potencia, coste]` a `[skillId, potencia, coste, duracion]`.

- `duracion`: número de turnos que dura el efecto (0 = acción instantánea sin efecto persistente).
- Para habilidades como **QA Testing** (devolver carta a la mano), la duración será `0` ya que no aplica un efecto sobre la carta, sino que ejecuta una acción directa.
- Para **Par Programming**, la duración sería `1` (buff durante 1 turno) o el valor que se desee.
- Para **Automatización** (daño al bug), la duración sería `0` (daño instantáneo).

---

## 3. Separar Skills, Efectos y Cartas en archivos distintos

### Estructura propuesta

```
src/constants/
  skills.ts       → Catálogo de Skills (SKILLS) + interfaz Skill
  effects.ts      → Clase/interfaz Effect, lógica de aplicar/decrementar/expirar efectos
  cards.ts        → CardTemplate, CardInstance, CARD_DEFINITIONS, createDeck (sin skills)
```

**Interfaz `Effect` (nueva):**
```ts
interface Effect {
  skillId: number;        // qué skill lo originó
  tipo: string;           // 'buff_potencia' | 'debuff_potencia' | etc.
  valor: number;          // potencia transferida desde la tupla
  turnosRestantes: number; // se decrementa al pasar turno
}
```

**`CardInstance` modificada:**
```ts
interface CardInstance {
  instanceId: string;
  definition: CardTemplate;
  estresActual: number;
  efectos: Effect[];      // reemplaza a estados: Set<string>
  disponible: boolean;
}
```

---

## 4. Feedback visual de buffs/debuffs

### Cambios necesarios en `GameCard.tsx`

- **Contorno de potencia**: si la carta tiene algún efecto `buff_potencia` activo → contorno verde alrededor del número de potencia. Si tiene `debuff_potencia` → contorno rojo.
- **Potencia visual**: en vez de mostrar `definition.potencia`, mostrar la **potencia efectiva** (base + suma de efectos). Si es distinta a la base, cambiar el color del número:
  - Verde y con `↑` si la efectiva es mayor que la base.
  - Rojo y con `↓` si es menor.
- **Tooltip/detalle**: al mantener presionada una carta (o al seleccionarla), mostrar un desglose: `Potencia base: 2 | Buff: +1 (1 turno)`.

---

## 5. Visual del tablero: mano del bot ocupa demasiado espacio

### Problema

Las cartas de la **mano del rival** (boca abajo, parte superior) ocupan mucho espacio visual cuando el bot acumula varias cartas. En dispositivos móviles comprimen el resto del tablero. Las cartas del **tablero** rival deben seguir siendo todas visibles en todo momento, ya que es indispensable para la jugabilidad.

### Propuesta

Reemplazar la fila de cartas boca abajo de la mano del bot por una **zona compacta** (esquina superior o lateral) con:
- Una sola carta boca abajo como representante visual.
- Un badge con el **número de cartas** en mano del bot (ej: `×3`).
- Esto libera espacio vertical para que las cartas del tablero rival (con sus stats de potencia, cordura, efectos) se vean con mayor claridad.

---

## 6. Rediseño visual de las cartas en el tablero

### Renombrar estrés → cordura

Cambiar la mecánica visual de estrés para que sea más intuitiva:
- **Cordura** empieza en el valor máximo (`estresLimite`) y baja cuando recibe daño.
- Cuando llega a **0**, la carta se destruye.
- Se muestra como un **número único** (la cordura restante), no como `X/Y`. Esto mantiene la carta limpia y es más intuitivo.
- Visualmente: `🧠 3` → recibe 1 de daño → `🧠 2` → recibe 2 más → `🧠 0` → carta destruida.

### Layout de la carta en tablero

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

**Cambios:**
- Eliminar la descripción de texto de la carta cuando está en el tablero (solo mostrarla en la mano o en un tooltip).
- Potencia visible en la esquina inferior izquierda con icono ⚔️.
- Cordura como número único en la esquina inferior derecha con icono 🧠 (sin formato X/Y).
- Si la carta tiene habilidades, mostrar un pequeño icono/badge (ej: ✨) para indicar que tiene habilidad activable.
- El nombre de la carta más visible.

---

---

# Sugerencias de mejora (IA)

## Gameplay

1. **Ataque múltiple del bot**: actualmente el bot solo ataca con 1 programador por turno. Podría atacar con todos los disponibles (consumiendo energía por cada uno), igual que el jugador.

2. **IA del bot mejorada**: el bot no usa habilidades de buff (Par Programming). Añadir lógica para que use buffs en su programador más fuerte antes de atacar.

3. **Sistema de prioridad de ataque a cartas enemigas**: los QA del jugador pueden atacar cualquier carta enemiga, pero no hay indicador de "amenaza". Mostrar qué carta enemiga tiene más potencia con un icono de peligro para guiar al jugador.

4. **Coste progresivo de energía**: actualmente la energía crece indefinidamente cada turno. Considerar un cap (ya hay `MAX_ENERGY_CAP = 10` definido pero no usado en el código). Implementar el cap para que las partidas no se desequilibren en turnos tardíos.

5. **Más tipos de habilidades**: con el sistema de efectos genérico propuesto, se podrían añadir fácilmente:
   - **Escudo**: reduce el daño de estrés recibido durante N turnos.
   - **Stun**: la carta enemiga no puede actuar durante 1 turno.
   - **Robo de energía**: resta energía al rival y la suma a la propia.
   - **Curación**: reduce el estrés/cordura actual de una carta aliada.

## Visual

6. **Animaciones de efecto**: al aplicar Par Programming, animar un destello verde en la carta aliada. Al usar QA Testing, animar la carta enemiga "volando" de vuelta a la mano.

7. **Historial de acciones mejorado**: el log actual es texto plano. Reemplazar por un feed con iconos, colores por tipo de acción y agrupación por turno.

8. **Preview de daño**: al pasar el ratón sobre "Atacar Bug", mostrar en el bug un preview del daño (número parpadeante o barra que se reduce temporalmente).

9. **Indicador de cartas restantes en mazo**: ya existe el `DeckPile`, pero añadir un tooltip que muestre la composición restante del mazo (cuántas de cada tipo quedan).

10. **Modo oscuro/tema**: las cartas y el tablero tienen un estilo medieval/fantasía. Considerar un tema alternativo "modo terminal" acorde con la temática de programadores (fondo oscuro tipo IDE, cartas con estética de código).
