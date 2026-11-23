# 🐛 Bug Battle

**Bug Battle** es un juego de cartas coleccionables (CCG) con temática de desarrollo de software. Construye mazos de programadores, QA y consumibles, abre sobres para reclutar cartas y combate por turnos contra una IA para derrotar bugs.

> Estado actual: **Alpha** — Modo vs IA funcional con sistema de energía, habilidades especiales, efectos temporales, cartas consumibles, sistema de cordura, gacha, routing SPA y autenticación. PvP online próximamente.

---

## Tabla de Contenidos

- [Tech Stack](#tech-stack)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Routing](#routing)
- [Autenticación y Perfil](#autenticación-y-perfil)
- [Idiomas (i18n)](#idiomas-i18n)
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
│   ├── auth/            # AuthScreen, PickNameScreen, ProfileMenu, AuthGuard
│   ├── decks/           # DeckSelectorScreen, DeckBuilderScreen, DeckCardThumb
│   ├── gacha/           # GachaScreen (apertura de sobres)
│   ├── game/            # GameBoard, GameCard, CardBack, BugCentral, ActionLog, ActionMenu, DeckPile
│   ├── ui/              # Componentes shadcn/ui (button, dialog, card, tabs, toast, etc.)
│   └── NavLink.tsx      # Wrapper de navegación con soporte activeClassName
├── constants/
│   ├── cards.ts         # CardTemplate, CardInstance, CARD_DEFINITIONS, constantes de juego
│   ├── skills.ts        # Skill interface, catálogo SKILLS (Par Programming, QA Testing, Automatización, Cafeína, Motivación, Parche Rápido)
│   ├── effects.ts       # EffectType, Effect interface (buff_ataque, debuff_ataque, escudo)
│   └── index.ts         # Barrel de re-exportación
├── contexts/
│   └── AuthContext.tsx   # Contexto de autenticación (user, profile, signOut)
├── i18n/
│   ├── index.ts         # Idioma actual, useI18n(), t(), traducción de cartas y mensajes del motor
│   └── messages/        # Diccionarios ES/EN/FR por namespace (common, game, decks, gacha...)
├── hooks/
│   ├── useAuth.ts       # Autenticación (email, Google, anónimo) con Supabase
│   ├── useAnonAuth.ts   # Autenticación anónima legacy
│   ├── useProfile.ts    # Perfil de usuario (display_name, avatar) con cache local
│   ├── useCollection.ts # Colección de cartas y monedas (localStorage)
│   ├── useDecks.ts      # CRUD de mazos + mazo activo
│   └── useGameLogic.ts  # Motor de juego: turnos, energía, IA, cordura, consumibles
├── integrations/
│   └── supabase/        # Cliente Supabase y tipos generados
├── lib/
│   └── utils.ts         # Utilidades (cn para clases)
├── pages/
│   ├── HomePage.tsx      # Menú principal
│   ├── LoginPage.tsx     # Pantalla de login/registro
│   ├── SetupPage.tsx     # Elección de nombre de usuario
│   ├── PlayPage.tsx      # Partida vs IA (wrapper de GameBoard)
│   ├── DecksPage.tsx     # Selector de mazos
│   ├── DeckEditorPage.tsx# Creación/edición de mazos
│   ├── GachaPage.tsx     # Reclutar (apertura de sobres)
│   └── NotFound.tsx      # Página 404
├── routes.ts            # Constantes de rutas centralizadas
└── test/                # Setup y tests de ejemplo
supabase/
└── migrations/          # Esquema SQL, triggers, RLS y datos semilla
local-ai/                # Servicio local de IA (Node) + Ollama gestionado; runtime/ y models/ no van a git
```

---

## Routing

La aplicación usa **React Router DOM v6** con rutas centralizadas en `src/routes.ts` para facilitar cambios futuros.

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | `HomePage` | Menú principal |
| `/login` | `LoginPage` | Login / Registro |
| `/setup` | `SetupPage` | Elegir nombre de usuario |
| `/play` | `PlayPage` | Partida vs IA |
| `/decks` | `DecksPage` | Selector de mazos |
| `/decks/new` | `DeckEditorPage` | Crear mazo |
| `/decks/edit/:deckId` | `DeckEditorPage` | Editar mazo existente |
| `/gacha` | `GachaPage` | Reclutar (sobres) |
| `*` | `NotFound` | Página 404 |

### Arquitectura de Routing

- **AuthGuard** (layout route): protege todas las rutas excepto `/login`. Redirige a login si no hay sesión, a `/setup` si falta perfil.
- **AuthContext**: provee `user`, `profile` y `signOut` a todas las páginas hijas sin recargar hooks.
- **Páginas wrapper** (`*Page.tsx`): adaptadores entre rutas y componentes de UI existentes. Los componentes de UI no conocen las rutas.
- **Navegación con state**: la composición del mazo se pasa a `/play` vía `location.state` para evitar URL params complejos.

---

## Autenticación y Perfil

- **Email + contraseña**: Registro e inicio de sesión tradicional.
- **Google OAuth**: Login con cuenta de Google; extrae nombre y avatar automáticamente.
- **Anónimo**: Sesión automática para visitantes sin registro.
- **Perfil**: Tras registrarse, el jugador elige un nombre de usuario (2-40 caracteres). El perfil se almacena en Supabase con cache local.
- **UI**: Estilo terminal/cyberpunk. Menú de perfil con avatar y nombre en la esquina superior derecha.

---

## Idiomas (i18n)

El juego está disponible en **español**, **inglés** y **francés**. El idioma se elige con el selector (menú de perfil y pantalla de login), se guarda en localStorage y, la primera vez, se detecta a partir del navegador.

- **Textos de la UI**: src/i18n/messages/<namespace>.ts contiene las tres traducciones de cada namespace. En componentes se usa const { t } = useI18n() y 	('namespace.clave', { param }); fuera de React, 	() de @/i18n.
- **Cartas y habilidades**: cardName, cardDescription, skillName y skillDescription traducen las cartas integradas por id (messages/content.ts); las cartas sin traducción muestran el texto guardado.
- **Mensajes de partida**: el motor (supabase/functions/_shared/engine.ts) emite msg/errorMsg estructurados (clave + parámetros) y sigue rellenando message/error en español para compatibilidad. El cliente los muestra en el idioma del jugador.
- **Añadir textos**: añade la clave en es, en y r. src/test/i18n.test.ts comprueba que los tres idiomas tienen las mismas claves y placeholders.

---

## Mecánicas de Juego

### Reglas Básicas

- **Objetivo**: Reducir la complejidad del Bug (10 HP) a 0 antes que el bot.
- **Formato**: Mejor de 3 rondas. El primero en ganar 2 rondas gana la partida.
- **Mano inicial**: 4 cartas. Se roba 1 carta por turno (excepto el primero).
- **Límite de mano**: Máximo 6 cartas. Si la mano está llena, no se roba carta ese turno.
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

### Sistema de Cordura 🧠

- Las cartas tienen **cordura** (`corduraMax`): empieza al máximo y baja al recibir ataques de QA.
- Cuando `cordura <= 0` → la carta es **destruida** (eliminada del tablero).
- Los Programadores **no pueden atacar** cartas enemigas directamente (solo al Bug).
- Visual: `🧠 3` → recibe 1 de daño → `🧠 2` → destruida al llegar a 0.

### IA del Bot

- Coloca cartas en slots vacíos con animaciones secuenciales (prioriza las más baratas).
- Si tiene cartas QA y el Bug tiene > 3 HP, usa QA Testing para devolver al programador más fuerte del jugador.
- Ataca al Bug con el programador disponible según la complejidad restante (estrategia adaptativa).

---

## Cartas

### Tipos de Carta

| Tipo | Ataque básico | Objetivo del ataque |
|---|---|---|
| **Programador** | Reduce complejidad del Bug | Bug |
| **QA** | Reduce cordura de una carta enemiga | Carta enemiga |
| **Consumible** | No tiene ataque básico | Se usa desde la mano, no se coloca en mesa |

### Estadísticas

| Campo | Descripción |
|-------|-------------|
| `potencia` | Daño base del ataque básico (no aplica a consumibles) |
| `coste` | Energía para colocar la carta / usar el consumible |
| `ataqueCoste` | Energía para ejecutar el ataque básico |
| `corduraMax` | Cordura inicial; al llegar a 0 la carta se destruye |
| `habilidades` | Array de tuplas `[skillId, potencia, coste, duracion]` |

### Programadores (Ataque al Bug)

| Carta | Emoji | Pot. | Coste | Atq.Coste | Cordura | Habilidades |
|-------|-------|------|-------|-----------|---------|-------------|
| Junior Dev | 👶 | 1 | 1 | 1 | 2 | — |
| Mid Dev | 💻 | 2 | 2 | 1 | 3 | — |
| Senior Dev | 🧠 | 3 | 3 | 1 | 4 | Par Programming (pot:2, coste:2, dur:1) |
| Fullstack | ⚡ | 2 | 2 | 1 | 3 | Par Programming (pot:1, coste:1, dur:1) |
| DevOps | 🔧 | 1 | 1 | 1 | 2 | Automatización (pot:2, coste:2, dur:0) |
| Intern | 🎒 | 1 | 1 | 1 | 2 | — |
| Architect | 🏗️ | 3 | 2 | 0 | 5 | Par Programming (pot:3, coste:0, dur:1) |

### QA (Ataque a cartas enemigas)

| Carta | Emoji | Pot. | Coste | Atq.Coste | Cordura | Habilidades |
|-------|-------|------|-------|-----------|---------|-------------|
| QA Tester | 🔍 | 1 | 1 | 1 | 2 | QA Testing (pot:0, coste:1, dur:0) |
| QA Lead | 🛡️ | 2 | 2 | 1 | 3 | QA Testing (pot:0, coste:2, dur:0) |

### Consumibles (Se usan desde la mano)

| Carta | Emoji | Coste | Efecto | Habilidad |
|-------|-------|-------|--------|-----------|
| Café de Máquina | ☕ | 1 | Restaura 3 de cordura a un aliado | Cafeína (pot:3, coste:1) |
| PR Aprobado | ✅ | 2 | +2 potencia a un aliado por 1 turno | Motivación (pot:2, coste:2, dur:1) |
| Hotfix de Emergencia | 🚑 | 2 | 2 de daño directo al Bug | Parche Rápido (pot:2, coste:2) |

---

## Habilidades Especiales

Las habilidades están en un catálogo centralizado (`SKILLS`). Cada carta referencia habilidades por tupla `[skillId, potencia, coste, duracion]`.

| ID | Nombre | Objetivo | Efecto | Duración |
|----|--------|----------|--------|----------|
| 3 | Par Programming | Carta aliada | Buff de ataque: suma potencia al aliado | 1 turno |
| 4 | QA Testing | Carta enemiga | Devuelve una carta enemiga a la mano rival | Inmediato |
| 5 | Automatización | Bug | Daño directo al Bug | Inmediato |
| 6 | Cafeína | Carta aliada | Restaura cordura a un aliado | Inmediato |
| 7 | Motivación | Carta aliada | Buff de ataque al aliado | 1 turno |
| 8 | Parche Rápido | Bug | Daño directo al Bug | Inmediato |

### Restricciones

- Si no hay targets válidos (ej: no hay cartas enemigas para QA Testing), la habilidad no aparece.
- Si no hay energía suficiente, la habilidad se muestra deshabilitada.
- Los consumibles se usan **desde la mano** (drag-and-drop o click en el target) y se descartan tras su uso.

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
| **Prueba Consumibles** | 🧪 | Centrado en consumibles para probar la mecánica |

### Constructor de Mazos

- Catálogo de cartas con filtros por tipo (Todos / Programadores / QA).
- Ajuste de cantidades con botones +/-.
- Barra de progreso visual con indicador de completitud.
- Validación: exactamente 20 cartas, máximo 2 copias por carta, nombre obligatorio.
- Los mazos se guardan en Supabase y el mazo activo se almacena en `localStorage`.

### Generación de mazos con IA local

En `/decks/new` el botón **Generar con IA** propone un mazo de 20 cartas de tu colección real con la estrategia elegida (Equilibrada, Agresiva o Defensiva). El resultado se carga en el editor sin guardarse: puedes editarlo, deshacerlo (se recupera exactamente la selección anterior), volver a generarlo y guardarlo con el flujo normal.

**Flujo**

1. El navegador lee la colección del jugador en Supabase y construye un DTO mínimo (solo estadísticas de las cartas poseídas y jugables: sin nombres, descripciones, imágenes, tokens ni `user_id`).
2. Lo envía a un servicio local (`local-ai/`, `POST http://127.0.0.1:8787/api/decks/generate`).
3. El servicio pregunta al modelo **`qwen2.5:1.5b`** (Qwen2.5 1.5B Instruct, Q4_K_M, ~1 GB en disco, ~1,5–2 GB de RAM, solo CPU, licencia Apache 2.0) a través de Ollama, con salida estructurada (JSON Schema). El modelo elige las cartas; los ids reales se sustituyen por referencias opacas.
4. El navegador valida la respuesta (Zod + reglas del juego: 20 cartas, máx. 2 copias, cartas poseídas y jugables).
5. Si hay errores sencillos (duplicados, copias de más, cartas desconocidas, total incorrecto) se reparan con perfiles deterministas por estrategia (`src/game/deckGenerator/strategies.ts`) y se valida de nuevo.
6. Si Ollama no responde, el modelo falta, hay timeout o la respuesta no se puede reparar, se usa un **generador determinista local** con la misma estrategia y se avisa al jugador. Si la colección no da para 20 cartas, se muestra un error y el editor no cambia.

El mensaje distingue el origen del mazo: **IA** («Mazo generado con IA.»), **IA ajustada** («La propuesta de la IA se ajustó para cumplir las reglas del juego.») o **respaldo** («La IA local no estaba disponible. Se utilizó el generador de respaldo.»), con un resumen fijo y traducido de la estrategia. La explicación libre del modelo no se muestra. Origen, modelo, seed, duraciones, reparaciones y motivo del fallback son datos transitorios: no se guardan; en desarrollo se registran en la consola (`console.debug`).

Cada generación usa un `seed` nuevo (temperatura 0.3) para variar ligeramente el resultado sin perder la estrategia.

**Preparación de la IA**: `npm run dev` arranca también el servicio local, que levanta su propio Ollama en `127.0.0.1:11435` con los modelos en `local-ai/models/` (no interfiere con otro Ollama instalado). El runtime se busca en `local-ai/runtime/` y después en una instalación del sistema. **Nunca se descarga nada sin que el jugador lo pida**: si falta el runtime o el modelo, el diálogo «Generar con IA» muestra el estado («Falta el modelo de IA…»), avisa de que la descarga es grande y ofrece **Preparar IA local** o **Usar generador de respaldo**. Durante la descarga se ve el progreso real (porcentaje y MB cuando se conoce el total; si no, solo los MB descargados) y se puede cancelar; la descarga continúa en el servicio aunque cierres el diálogo.

| Estado (`/health` → `status`) | Significado |
|---|---|
| `service_starting` | Comprobando qué hay instalado |
| `runtime_missing` | No hay Ollama (ni portable ni del sistema) |
| `runtime_downloading` | Descargando Ollama portable |
| `runtime_ready` | Arrancando el Ollama privado |
| `model_missing` | Ollama listo, falta el modelo |
| `model_downloading` | Descargando el modelo |
| `model_loading` | Cargando el modelo en memoria |
| `ready` | Se puede generar con IA |
| `error` | Ver `lastError` (`PORT_IN_USE`, `CHECKSUM_MISMATCH`, `RUNTIME_DOWNLOAD_FAILED`, `MODEL_DOWNLOAD_FAILED`, `OLLAMA_START_FAILED`…); el respaldo sigue disponible |

**Runtime fijado**: Ollama **v0.40.16** (`local-ai/release.ts`), verificado con `qwen2.5:1.5b` y salida estructurada. Nunca se usa `latest`. El runtime portable se descarga solo de la release oficial, se comprueba su SHA-256 (fijado en el código), se extrae en `local-ai/runtime/.staging` y solo se mueve a `local-ai/runtime/` cuando todo ha ido bien (marcador `.installed.json`). Una descarga parcial o cancelada se borra y nunca cuenta como instalación. El modelo lo descarga Ollama, que solo lo registra cuando está completo. Para actualizar Ollama: cambia `OLLAMA_RUNTIME_VERSION` y los checksums de `release.ts` (copiados de `sha256sum.txt` de la nueva release), pasa los tests y haz una generación real.

| Plataforma | Asset | Formato / extracción | Estado |
|---|---|---|---|
| Windows x64 | `ollama-windows-amd64.zip` (1,62 GB; 2,1 GB extraído) | zip / `tar.exe` de Windows | Probado |
| Windows arm64 | `ollama-windows-arm64.zip` | zip / `tar.exe` | Sin probar |
| Linux x64 / arm64 | `ollama-linux-{amd64,arm64}.tar.zst` | `tar --zstd` (requiere `zstd`) | Sin probar |
| macOS | `ollama-darwin.tgz` | `tar -xzf` | Sin probar |

**Procesos**: el servicio solo para el Ollama que ha arrancado él (lo apunta en `local-ai/runtime/ollama-<puerto>.pid`). Si el puerto privado lo ocupa otro programa, no lo toca: muestra `PORT_IN_USE` y se usa el respaldo. Se cierra limpiamente con Ctrl+C, SIGTERM o cuando se detiene `npm run dev`.

`local-ai/runtime/` y `local-ai/models/` están en `.gitignore` porque superan el límite de GitHub. Para distribuir el juego listo para usar sin conexión, prepara el ZIP así:

```bash
npm install
npm run ai:setup -- --portable   # descarga Ollama portable v0.40.16 (~1,6 GB en Windows) y el modelo (~1 GB) a local-ai/
# comprime la carpeta del juego incluyendo local-ai/runtime y local-ai/models (sin .staging ni *.pid)
```

**Comprobaciones**

```bash
curl http://127.0.0.1:8787/health     # estado, runtime (origen y versión), modelo, progreso, canGenerate, lastError
curl -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:8787/api/setup         # preparar (descarga si falta)
curl -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:8787/api/setup/cancel  # cancelar descarga
```

Si usas tu propio Ollama: `LOCAL_AI_MANAGE_OLLAMA=false`, `OLLAMA_BASE_URL=http://127.0.0.1:11434` y `ollama pull qwen2.5:1.5b`.

**Seguridad**: el servicio solo escucha en `127.0.0.1`, solo acepta los orígenes de `LOCAL_AI_ALLOWED_ORIGIN` y Hosts de loopback, exige JSON en las peticiones POST, limita el body a 64 KB, valida la entrada y la salida con Zod, aplica timeout y cancelación, no devuelve stack traces, rutas ni URLs, y no conoce Supabase ni recibe credenciales. La URL de Ollama y la de descarga solo se configuran en el servidor.

---

## Sistema Gacha

El reclutamiento se hace mediante **banners**: conjuntos de cartas disponibles durante un periodo de tiempo.

- **Disponibilidad**: un banner solo está disponible si `fecha_inicio <= ahora <= fecha_fin`. Se valida en la base de datos (RLS y `open_banner_pack`), no solo en la interfaz.
- **Coste y cartas por sobre**: configurables por banner (por defecto 100 monedas y 3 cartas; monedas iniciales: 300).
- **Sorteo**: ponderado por `banner_cards.peso_aparicion` (peso relativo; no hace falta que sumen 100), usando Efraimidis–Spirakis en `public.open_banner_pack()`.
- **Rareza**: se calcula siempre a partir de `cards.gacha_peso` (≤5 Legendario, ≤10 Épico, ≤30 Raro, resto Común), nunca a partir del peso del banner.
- **Administración**: los usuarios con `players.admin = true` pueden crear y editar banners desde la pantalla de reclutamiento (`public.save_banner()`, que comprueba `is_admin()`). Al añadir una carta, su peso de aparición se copia de `cards.gacha_peso` y luego se puede cambiar.
- **Copias máximas por carta**: 2 (igual que el máximo por mazo). Si en un sobre sale una carta de la que ya tienes 2, se convierte automáticamente en oro según su rareza: Común 5 🪙, Rara 10 🪙, Épica 20 🪙, Legendaria 100 🪙. Se calcula en la base de datos (`public.duplicate_gold(gacha_peso)`) y se muestra al revelar la carta.
- **Fases**: Selección de banner → Animación de apertura → Revelación con flip de cartas.
- La colección y las monedas se guardan en Supabase (`player_collection`, `players.gold`).

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
| `dev` | `bun dev` | Servidor de desarrollo (puerto 8080) + servicio de IA local |
| `build` | `bun run build` | Build de producción |
| `build:dev` | `bun run build:dev` | Build en modo development |
| `preview` | `bun run preview` | Previsualizar build |
| `lint` | `bun run lint` | Ejecutar ESLint |
| `test` | `bun run test` | Ejecutar tests (Vitest) |
| `test:watch` | `bun run test:watch` | Tests en modo watch |
| `ai` | `npm run ai` | Solo el servicio de IA local (`127.0.0.1:8787`) |
| `ai:setup` | `npm run ai:setup` | Prepara la IA por adelantado (descarga el modelo y, si falta, el runtime); `-- --portable` instala Ollama portable v0.40.16 para el ZIP |

---

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-clave-publica-de-supabase
```

Las variables de la IA local son opcionales; sus valores por defecto funcionan sin `.env`:

| Variable | Defecto | Uso |
|---|---|---|
| `VITE_LOCAL_AI_SERVICE_URL` | `http://127.0.0.1:8787` | URL del servicio para el navegador |
| `VITE_LOCAL_AI_TIMEOUT_MS` | `35000` | Timeout del navegador |
| `LOCAL_AI_PORT` | `8787` | Puerto del servicio (siempre en `127.0.0.1`) |
| `LOCAL_AI_ALLOWED_ORIGIN` | `http://localhost:8080,http://127.0.0.1:8080` | Orígenes CORS permitidos |
| `LOCAL_AI_AUTOSTART` | `true` | `false` evita que `npm run dev` arranque el servicio |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11435` | Ollama gestionado (solo loopback) |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Modelo (configurable) |
| `OLLAMA_TEMPERATURE` | `0.3` | Variación entre generaciones (0–1) |
| `OLLAMA_TIMEOUT_MS` | `30000` | Timeout de la llamada al modelo |
| `LOCAL_AI_MANAGE_OLLAMA` | `true` | `false` para usar un Ollama propio |
| `LOCAL_AI_DEBUG` | `true` con `npm run dev` | Registra duraciones por generación (sin prompts ni datos del jugador) |

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
| Límite de mano | 6 cartas |
| Slots en mesa | 4 |
| Energía por turno | 3 |
| Bonus por último golpe | +1⚡ |
| Cap máximo de energía | 10 |
| Rondas máximas | 3 |
| Monedas iniciales | 300 |
| Coste de sobre | Por banner (100 por defecto) |
| Cartas por sobre | Por banner (3 por defecto) |

---

## Licencia

Este proyecto es de código abierto. Consulta el archivo `LICENSE` para más detalles.
