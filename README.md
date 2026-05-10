# 🐛 Bug Battle

**Bug Battle** es un juego de cartas coleccionables (CCG) con temática de desarrollo de software. Construye mazos de programadores y QA, abre sobres para reclutar cartas y combate por turnos contra una IA para derrotar bugs.

> Estado actual: **Alpha** — Modo vs IA funcional con sistema de energía, habilidades especiales, efectos temporales, gacha y autenticación. PvP online próximamente.

---

## Tabla de Contenidos

- [Tech Stack](#tech-stack)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Autenticación y Perfil](#autenticación-y-perfil)
- [Mecánicas de Juego](#mecánicas-de-juego)
- [Cartas](#cartas)
- [Habilidades Especiales](#habilidades-especiales)
- [Sistema de Efectos](#sistema-de-efectos)
- [Sistema de Mazos](#sistema-de-mazos)
- [Sistema Gacha](#sistema-gacha)
- [Base de Datos](#base-de-datos)
- [Instalación](#instalación)
- [Scripts Disponibles](#scripts-disponibles)
- [Variables de Entorno](#variables-de-entorno)
- [Testing](#testing)

---

## Tech Stack

| Categoría | Tecnologías |
|-----------|-------------|
| **Frontend** | React 18, TypeScript, Vite 5 (SWC) |
| **Estilos** | Tailwind CSS 3, Framer Motion |
| **UI Components** | shadcn/ui + Radix UI, Lucide Icons |
| **Estado del servidor** | TanStack React Query |
| **Backend** | Supabase (PostgreSQL + Auth email/Google/anónimo) |
| **Formularios** | React Hook Form + Zod |
| **Routing** | React Router DOM 6 |
| **Testing** | Vitest + Testing Library, Playwright (E2E) |
| **Linting** | ESLint + TypeScript ESLint |

---

## Estructura del Proyecto

```
src/
├── assets/              # Imágenes y recursos visuales
├── components/
│   ├── auth/            # AuthScreen, PickNameScreen, ProfileMenu
│   ├── decks/           # DeckSelectorScreen, DeckBuilderScreen, DeckCardThumb
│   ├── gacha/           # GachaScreen (apertura de sobres)
│   ├── game/            # GameBoard, GameCard, CardBack, BugCentral, ActionLog, ActionMenu, DeckPile
│   ├── ui/              # Componentes shadcn/ui (button, dialog, card, tabs, toast, etc.)
│   └── NavLink.tsx      # Wrapper de navegación con soporte activeClassName
├── constants/
│   ├── cards.ts         # CardTemplate, CardInstance, CARD_DEFINITIONS, constantes de juego
│   ├── skills.ts        # Skill interface, catálogo SKILLS (Par Programming, QA Testing, Automatización)
│   ├── effects.ts       # EffectType, Effect interface (buff_ataque, debuff_ataque, escudo)
│   └── index.ts         # Barrel de re-exportación
├── hooks/
│   ├── useAuth.ts       # Autenticación (email, Google, anónimo) con Supabase
│   ├── useAnonAuth.ts   # Autenticación anónima legacy
│   ├── useProfile.ts    # Perfil de usuario (display_name, avatar) con cache local
│   ├── useCollection.ts # Colección de cartas y monedas (localStorage)
│   ├── useDecks.ts      # CRUD de mazos + mazo activo
│   └── useGameLogic.ts  # Motor de juego: turnos, energía, IA, efectos
├── integrations/
│   └── supabase/        # Cliente Supabase y tipos generados
├── lib/
│   └── utils.ts         # Utilidades (cn para clases)
├── pages/
│   ├── Index.tsx         # Menú principal y router de pantallas
│   └── NotFound.tsx      # Página 404
└── test/                # Setup y tests de ejemplo
supabase/
└── migrations/          # Esquema SQL, triggers, RLS y datos semilla
```

---

## Autenticación y Perfil

- **Email + contraseña**: Registro e inicio de sesión tradicional.
- **Google OAuth**: Login con cuenta de Google; extrae nombre y avatar automáticamente.
- **Anónimo**: Sesión automática para visitantes sin registro.
- **Perfil**: Tras registrarse, el jugador elige un nombre de usuario (2-40 caracteres). El perfil se almacena en Supabase con cache local.
- **UI**: Estilo terminal/cyberpunk. Menú de perfil con avatar y nombre en la esquina superior derecha.

---

## Mecánicas de Juego

### Reglas Básicas

- **Objetivo**: Reducir la complejidad del Bug (10 HP) a 0 antes que el bot.
- **Formato**: Mejor de 3 rondas. El primero en ganar 2 rondas gana la partida.
- **Mano inicial**: 4 cartas. Se roba 1 carta por turno (excepto el primero).
- **Slots de mesa**: Cada jugador tiene 4 espacios para colocar cartas.
- **Tamaño de mazo**: Exactamente 20 cartas (máx. 2 copias por carta en mazos de usuario).

### Sistema de Energía ⚡

- Cada turno se reciben **3⚡** de energía.
- **Bonus**: si fuiste el último en golpear al Bug, recibes **+1⚡** extra.
- La energía se gasta al:
  - **Colocar una carta** → gasta el `coste` de invocación.
  - **Atacar con una carta** → gasta el `ataqueCoste`.
  - **Usar una habilidad especial** → gasta el `coste` de la habilidad.
- Cap máximo de energía acumulada: 10.

### Estructura del Turno

1. **Inicio** — Se roba 1 carta del mazo (omitido en turno 1) y se recibe energía.
2. **Fase de acción libre** (repetible mientras haya cartas/energía):
   - Colocar cartas de la mano al tablero (máximo 4 slots).
   - Seleccionar cualquier carta propia en el tablero → menú de acciones:
     - **Ataque básico**: Programadores atacan al Bug; QA ataca cartas enemigas (sube estrés).
     - **Habilidades especiales**: Si la carta tiene habilidades y hay targets válidos.
   - Cada carta solo puede actuar **una vez por turno** (`disponible` → `false`).
3. **Saltar turno** — Pasa la acción al bot.

### Sistema de Estrés

- Las cartas QA atacan a cartas enemigas, sumando su `potencia` al `estresActual` del objetivo.
- Cuando `estresActual >= estresLimite` → la carta es **destruida** (eliminada del tablero).
- Los Programadores **no pueden atacar** cartas enemigas directamente (solo al Bug).

### IA del Bot

- Coloca cartas en slots vacíos con animaciones secuenciales (prioriza las más baratas).
- Si tiene cartas QA y el Bug tiene > 3 HP, usa QA Testing para devolver al programador más fuerte del jugador.
- Ataca al Bug con el programador disponible según la complejidad restante (estrategia adaptativa).

---

## Cartas

### Estadísticas

| Campo | Descripción |
|-------|-------------|
| `potencia` | Daño base del ataque básico |
| `coste` | Energía para colocar la carta en el tablero |
| `ataqueCoste` | Energía para ejecutar el ataque básico |
| `estresLimite` | Estrés máximo que aguanta; al alcanzarlo, la carta se destruye |
| `habilidades` | Array de tuplas `[skillId, potencia, coste, duracion]` |

### Programadores (Ataque al Bug)

| Carta | Emoji | Pot. | Coste | Atq.Coste | Estrés Lím. | Habilidades |
|-------|-------|------|-------|-----------|-------------|-------------|
| Junior Dev | 👶 | 1 | 1 | 1 | 2 | — |
| Mid Dev | 💻 | 2 | 2 | 1 | 3 | — |
| Senior Dev | 🧠 | 3 | 3 | 1 | 4 | Par Programming (pot:2, coste:2, dur:1) |
| Fullstack | ⚡ | 2 | 2 | 1 | 3 | Par Programming (pot:1, coste:1, dur:1) |
| DevOps | 🔧 | 1 | 1 | 1 | 2 | Automatización (pot:2, coste:2, dur:0) |
| Intern | 🎒 | 1 | 1 | 1 | 2 | — |
| Architect | 🏗️ | 3 | 2 | 0 | 5 | Par Programming (pot:3, coste:0, dur:1) |

### QA (Ataque a cartas enemigas)

| Carta | Emoji | Pot. | Coste | Atq.Coste | Estrés Lím. | Habilidades |
|-------|-------|------|-------|-----------|-------------|-------------|
| QA Tester | 🔍 | 1 | 1 | 1 | 2 | QA Testing (pot:0, coste:1, dur:0) |
| QA Lead | 🛡️ | 2 | 2 | 1 | 3 | QA Testing (pot:0, coste:2, dur:0) |

---

## Habilidades Especiales

Las habilidades están en un catálogo centralizado (`SKILLS`). Cada carta referencia habilidades por tupla `[skillId, potencia, coste, duracion]`.

| ID | Nombre | Objetivo | Efecto | Duración |
|----|--------|----------|--------|----------|
| 3 | Par Programming | Carta aliada | Buff de ataque: suma potencia al aliado | 1 turno |
| 4 | QA Testing | Carta enemiga | Devuelve una carta enemiga a la mano rival | Inmediato |
| 5 | Automatización | Bug | Daño directo al Bug | Inmediato |

### Restricciones

- Si no hay targets válidos (ej: no hay cartas enemigas para QA Testing), la habilidad no aparece.
- Si no hay energía suficiente, la habilidad se muestra deshabilitada.

---

## Sistema de Efectos

Los efectos temporales modifican las estadísticas de las cartas en juego:

| Tipo | Efecto |
|------|--------|
| `buff_ataque` | Aumenta la potencia efectiva de la carta |
| `debuff_ataque` | Reduce la potencia efectiva de la carta |
| `escudo` | Reduce el daño de estrés recibido |

- Los efectos tienen duración en turnos y se decrementan automáticamente al fin de turno.
- `calcularPotenciaReal()` calcula la potencia efectiva sumando/restando buffs/debuffs activos.
- **Feedback visual**: la potencia se muestra en verde (buff) o rojo (debuff), y un badge ✨ indica efectos activos.

---

## Sistema de Mazos

### Mazos Predefinidos

| Mazo | Emoji | Estrategia |
|------|-------|------------|
| **Ataque Frontal** | ⚔️ | Agresivo, muchos programadores de alto poder |
| **Defensa Total** | 🛡️ | Control con cartas QA, elimina amenazas rivales |
| **Equilibrio** | ⚖️ | Balanceado, ideal para nuevos jugadores |

### Constructor de Mazos

- Catálogo de cartas con filtros por tipo (Todos / Programadores / QA).
- Ajuste de cantidades con botones +/-.
- Barra de progreso visual con indicador de completitud.
- Validación: exactamente 20 cartas, máximo 2 copias por carta, nombre obligatorio.
- Los mazos se guardan en Supabase y el mazo activo se almacena en `localStorage`.

---

## Sistema Gacha

Sistema de apertura de sobres para reclutar cartas:

- **Coste por sobre**: 100 monedas (monedas iniciales: 300).
- **Cartas por sobre**: 3.
- **Rareza** (basada en potencia):
  - ⚪ Common (potencia 1) — 60% probabilidad
  - 🔵 Rare (potencia 2) — 30% probabilidad
  - 🟣 Epic (potencia 3) — 10% probabilidad
- **Fases**: Tienda → Animación de apertura → Revelación con flip de cartas.
- La colección y monedas se persisten en `localStorage`.

---

## Base de Datos

### Esquema (Supabase PostgreSQL)

**`profiles`** — Perfiles de usuario:
- `id` (UUID, FK a auth.users), `display_name` (1-40 chars), `avatar_url`, `created_at`, `updated_at`
- RLS: lectura pública, inserción y edición solo del propio usuario.

**`decks`** — Mazos de los jugadores y presets:
- `id` (UUID), `user_id` (FK a auth.users, null para presets), `name`, `cover_emoji`, `is_preset`
- Constraint: presets deben tener `user_id = NULL`; mazos de usuario requieren `user_id`.

**`deck_cards`** — Composición de cada mazo:
- `deck_id` (FK), `card_id` (texto), `quantity` (1-4)
- PK compuesta: `(deck_id, card_id)`

### Seguridad (RLS)

- Los mazos preset son **visibles para todos**.
- Los mazos de usuario son **visibles y editables solo por su dueño**.
- Los perfiles son **visibles para todos**, editables solo por su dueño.

---

## Instalación

### Prerequisitos

- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) o npm

### Pasos

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd bug-battle-front

# Instalar dependencias
bun install
# o
npm install

# Configurar variables de entorno (ver sección siguiente)
cp .env.example .env

# Iniciar servidor de desarrollo
bun dev
# o
npm run dev
```

La aplicación estará disponible en `http://localhost:8080`.

---

## Scripts Disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `dev` | `bun dev` | Servidor de desarrollo (puerto 8080) |
| `build` | `bun run build` | Build de producción |
| `build:dev` | `bun run build:dev` | Build en modo development |
| `preview` | `bun run preview` | Previsualizar build |
| `lint` | `bun run lint` | Ejecutar ESLint |
| `test` | `bun run test` | Ejecutar tests (Vitest) |
| `test:watch` | `bun run test:watch` | Tests en modo watch |

---

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-clave-publica-de-supabase
```

---

## Testing

### Tests Unitarios (Vitest + Testing Library)

```bash
bun run test         # Ejecución única
bun run test:watch   # Modo watch
```

### Tests E2E (Playwright)

```bash
npx playwright test
```

---

## Constantes de Juego

| Constante | Valor |
|-----------|-------|
| Complejidad del Bug | 10 |
| Tamaño del mazo | 20 |
| Robo inicial | 4 cartas |
| Slots en mesa | 4 |
| Energía por turno | 3 |
| Bonus por último golpe | +1⚡ |
| Cap máximo de energía | 10 |
| Rondas máximas | 3 |
| Monedas iniciales | 300 |
| Coste de sobre | 100 |
| Cartas por sobre | 3 |

---

## Licencia

Este proyecto es de código abierto. Consulta el archivo `LICENSE` para más detalles.
