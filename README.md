# 🐛 Bug Hunters

**Bug Hunters** es un juego de cartas coleccionables (CCG) donde los jugadores construyen mazos de desarrolladores y QA para derrotar bugs. Combate por turnos contra una IA, con sistema de mazos personalizables y partidas al mejor de 3 rondas.

> Estado actual: **Alpha** — Modo local vs IA funcional. PvP online próximamente.

---

## Tabla de Contenidos

- [Capturas](#capturas)
- [Tech Stack](#tech-stack)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Mecánicas de Juego](#mecánicas-de-juego)
- [Cartas](#cartas)
- [Sistema de Mazos](#sistema-de-mazos)
- [Base de Datos](#base-de-datos)
- [Instalación](#instalación)
- [Scripts Disponibles](#scripts-disponibles)
- [Variables de Entorno](#variables-de-entorno)
- [Testing](#testing)

---

## Tech Stack

| Categoría | Tecnologías |
|-----------|-------------|
| **Frontend** | React 18, TypeScript, Vite (SWC) |
| **Estilos** | Tailwind CSS 3, Framer Motion |
| **UI Components** | shadcn/ui + Radix UI, Lucide Icons |
| **Estado del servidor** | TanStack React Query |
| **Backend** | Supabase (PostgreSQL + Auth anónimo) |
| **Formularios** | React Hook Form + Zod |
| **Routing** | React Router DOM 6 |
| **Testing** | Vitest + Testing Library, Playwright (E2E) |
| **Linting** | ESLint + TypeScript ESLint |

---

## Estructura del Proyecto

```
src/
├── assets/              # Imágenes, videos de animaciones (bug, explosión, carta base)
├── components/
│   ├── decks/           # DeckSelectorScreen, DeckBuilderScreen, DeckCardThumb
│   ├── game/            # GameBoard, GameCard, CardBack, BugCentral, ActionLog, ActionMenu, DeckPile
│   └── ui/              # Componentes shadcn/ui (button, dialog, card, tabs, toast, etc.)
├── constants/
│   └── cards.ts         # Definiciones de las 9 cartas (7 programadores + 2 QA)
├── hooks/
│   ├── useAnonAuth.ts   # Autenticación anónima con Supabase
│   ├── useDecks.ts      # CRUD de mazos + mazo activo (localStorage)
│   └── useGameLogic.ts  # Máquina de estados del juego, turnos, IA
├── integrations/
│   └── supabase/        # Cliente Supabase y tipos generados
├── lib/
│   └── utils.ts         # Utilidades (cn para clases)
├── pages/
│   ├── Index.tsx         # Menú principal y navegación entre pantallas
│   └── NotFound.tsx      # Página 404
└── test/                # Setup y tests de ejemplo
supabase/
└── migrations/          # Esquema SQL, triggers, RLS y datos semilla
```

---

## Mecánicas de Juego

### Reglas Básicas

- **Objetivo**: Reducir la complejidad del Bug (10 HP) a 0 antes que tu oponente (IA).
- **Formato**: Mejor de 3 rondas. El primero en ganar 2 rondas gana la partida.
- **Mano inicial**: 4 cartas. Se roba 1 carta por turno (excepto el primero).
- **Slots de mesa**: Cada jugador tiene 4 espacios para colocar cartas.
- **Tamaño de mazo**: Exactamente 20 cartas (máx. 2 copias por carta en mazos de usuario).

### Estructura del Turno

1. **Robar** — Se roba 1 carta del mazo (omitido en el turno 1).
2. **Colocar** — Arrastra cartas de tu mano a los slots vacíos de la mesa (drag & drop).
3. **Acción** (mutuamente excluyente):
   - **Atacar Bug**: Selecciona un programador de la mesa → resta su poder al HP del bug → fin del turno.
   - **Usar habilidad QA**: Selecciona una carta QA → elige un programador rival → lo devuelve a su mano → **no termina el turno** (una vez por turno).
   - **Pasar turno**: Termina el turno sin atacar.

### IA del Bot

- Coloca cartas en slots vacíos con animaciones secuenciales.
- Si el bug tiene > 3 HP, puede usar QA para eliminar al programador más fuerte del jugador (~50% probabilidad).
- Ataca con el programador más fuerte si el bug está sano; con el más débil si está débil (estrategia adaptativa).

---

## Cartas

### Programadores (Ataque)

| Carta | Emoji | Poder | Descripción |
|-------|-------|-------|-------------|
| Junior Dev | 👶 | 1 | Resuelve bugs simples con entusiasmo |
| Mid Dev | 💻 | 2 | Experiencia sólida en debugging |
| Senior Dev | 🧠 | 3 | Veterano cazador de bugs |
| Fullstack | ⚡ | 2 | Ataca bugs en frontend y backend |
| DevOps | 🔧 | 1 | Automatiza la destrucción de bugs |
| Intern | 🎒 | 1 | Novato con ganas de aprender |
| Architect | 🏗️ | 3 | Diseña la solución desde la raíz |

### QA (Control)

| Carta | Emoji | Habilidad |
|-------|-------|-----------|
| QA Tester | 🔍 | Devuelve un programador rival a su mano |
| QA Lead | 🛡️ | Limpia la mesa del rival con autoridad |

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

## Base de Datos

### Esquema (Supabase PostgreSQL)

**`decks`** — Mazos de los jugadores y presets:
- `id` (UUID), `user_id` (FK a auth.users, null para presets), `name`, `cover_emoji`, `is_preset`
- Constraint: presets deben tener `user_id = NULL`; mazos de usuario requieren `user_id`.

**`deck_cards`** — Composición de cada mazo:
- `deck_id` (FK), `card_id` (texto), `quantity` (1-4)
- PK compuesta: `(deck_id, card_id)`

### Seguridad (RLS)

- Los mazos preset son **visibles para todos**.
- Los mazos de usuario son **visibles y editables solo por su dueño**.
- Autenticación anónima: cada visitante obtiene una sesión automáticamente.

---

## Instalación

### Prerequisitos

- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) o npm

### Pasos

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd code-crush-clash-main

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
| `dev` | `npm run dev` | Servidor de desarrollo (puerto 8080) |
| `build` | `npm run build` | Build de producción |
| `build:dev` | `npm run build:dev` | Build en modo development |
| `preview` | `npm run preview` | Previsualizar build |
| `lint` | `npm run lint` | Ejecutar ESLint |
| `test` | `npm run test` | Ejecutar tests (Vitest) |
| `test:watch` | `npm run test:watch` | Tests en modo watch |

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
npm run test         # Ejecución única
npm run test:watch   # Modo watch
```

### Tests E2E (Playwright)

```bash
npx playwright test
```

---

## Licencia

Este proyecto es de código abierto. Consulta el archivo `LICENSE` para más detalles.
