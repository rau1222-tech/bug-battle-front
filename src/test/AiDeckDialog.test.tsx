import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS } from '@/constants';
import DeckBuilderScreen from '@/components/decks/DeckBuilderScreen';
import AiDeckDialog, { type AiStatusView } from '@/components/decks/AiDeckDialog';
import { AI_SETUP_STATUSES, type AiSetupStatus, type DeckGenerateResponse, type LocalAiHealth } from '@/game/deckGenerator/contract';
import { POLL_MS, useLocalAiStatus, type LocalAiStatusApi } from '@/hooks/useLocalAiStatus';

const FULL = Object.fromEntries(CARD_DEFINITIONS.map((c) => [c.id, 2]));
const state = vi.hoisted(() => ({ collection: {} as Record<string, number> }));
const client = vi.hoisted(() => ({ requestDeckGeneration: vi.fn(), getLocalAiHealth: vi.fn(), startLocalAiSetup: vi.fn(), cancelLocalAiSetup: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
// BackButton's framer-motion `steps()` easing is not supported in jsdom (unrelated to this feature)
vi.mock('@/components/ui/BackButton', () => ({ default: ({ onClick }: { onClick: () => void }) => <button onClick={onClick}>back</button> }));
vi.mock('@/hooks/useCards', () => ({ useCards: () => ({ cards: CARD_DEFINITIONS, loading: false }) }));
vi.mock('@/hooks/useCollection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCollection')>()),
  useCollection: () => ({ collection: state.collection, loading: false, error: null, refresh: vi.fn() }),
  fetchCollection: async () => state.collection,
}));
vi.mock('@/lib/localAiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/localAiClient')>()),
  ...client,
}));

function health(status: AiSetupStatus, patch: Partial<LocalAiHealth> = {}): LocalAiHealth {
  const idle = { downloading: false, downloadedBytes: null, totalBytes: null, progress: null };
  return {
    service: 'ready',
    status,
    runtime: { source: 'system', ready: status === 'ready', expectedVersion: '0.40.16', detectedVersion: '0.40.16', ...idle },
    ollama: { reachable: status === 'ready' },
    model: { name: 'qwen2.5:1.5b', installed: status === 'ready', loaded: status === 'ready', ...idle },
    canGenerate: status === 'ready',
    canUseFallback: true,
    lastError: null,
    dataDir: 'local-ai/',
    ...patch,
  };
}

const VALID = CARD_DEFINITIONS.slice(0, 10).map((c) => ({ id: c.id, quantity: 2 }));
const modelResponse = (cards = VALID): DeckGenerateResponse => ({
  result: { strategy: 'aggressive', cards, explanation: 'English text that must never be shown' },
  meta: { model: 'qwen2.5:1.5b', seed: 1, temperature: 0.3, durationMs: 5 },
});

const renderScreen = () =>
  render(
    <MemoryRouter>
      <Toaster />
      <DeckBuilderScreen userId="u1" editing={null} onBack={vi.fn()} onSaved={vi.fn()} />
    </MemoryRouter>,
  );
const counter = () => screen.getAllByText(/^\d+\/20$/)[0].textContent;
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: /^(Generar con IA|Volver a generar)$/ }));
const dialog = () => screen.getByRole('dialog');
const submit = () => within(dialog()).getByRole('button', { name: /^(Generar|Reemplazar y generar|Reintentar|Usar generador de respaldo)$/ });
const addCard = (name: string) => fireEvent.click(screen.getAllByRole('button', { name: `Añadir ${name}` })[0]);
const waitReady = () => within(dialog()).findByText('La IA local está lista.');

/** A generation request that only settles when the test decides (and rejects on abort). */
function deferredGeneration() {
  const pending: ((r: DeckGenerateResponse) => void)[] = [];
  client.requestDeckGeneration.mockImplementation(
    (_req: unknown, opts: { signal: AbortSignal }) =>
      new Promise((res, rej) => {
        pending.push(res);
        opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { code: 'CANCELLED' })));
      }),
  );
  return pending;
}

beforeEach(() => {
  state.collection = FULL;
  Object.values(client).forEach((fn) => fn.mockReset());
  client.getLocalAiHealth.mockResolvedValue(health('ready'));
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AI deck generation in the deck builder', () => {
  it('opens the strategy selector, checks the AI and generates with the chosen strategy', async () => {
    client.requestDeckGeneration.mockResolvedValue(modelResponse());
    renderScreen();
    openDialog();
    expect(within(dialog()).getByText('Generar mazo con IA')).toBeInTheDocument();
    await waitReady();
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Agresiva/ }));
    expect(within(dialog()).getByRole('radio', { name: /Agresiva/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(submit());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.requestDeckGeneration.mock.calls[0][0]).toMatchObject({ strategy: 'aggressive', deckSize: 20, maxCopies: 2 });
    expect(counter()).toBe('20/20');
    expect(await screen.findByText('Mazo generado con IA.')).toBeInTheDocument();
    expect(screen.getByText('Mazo agresivo orientado a presión temprana y daño eficiente.')).toBeInTheDocument();
    expect(screen.queryByText(/English text/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a generar' })).toBeInTheDocument();
  });

  it('labels repaired and fallback results honestly', async () => {
    client.requestDeckGeneration.mockResolvedValueOnce(modelResponse([...VALID.slice(0, 9), { id: 'nope', quantity: 2 }]));
    renderScreen();
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    expect(await screen.findByText('La propuesta de la IA se ajustó para cumplir las reglas del juego.')).toBeInTheDocument();
    expect(counter()).toBe('20/20');

    client.requestDeckGeneration.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'NETWORK' }));
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    expect(await screen.findByText('La IA local no estaba disponible. Se utilizó el generador de respaldo.')).toBeInTheDocument();
    expect(counter()).toBe('20/20');
  });

  it('asks for confirmation before replacing cards and can undo exactly', async () => {
    client.requestDeckGeneration.mockResolvedValue(modelResponse());
    renderScreen();
    addCard('Hotfix de Emergencia');
    addCard('PR Aprobado');
    expect(counter()).toBe('2/20');
    openDialog();
    expect(within(dialog()).getByText(/Se reemplazarán las 2 cartas actuales/)).toBeInTheDocument();
    await waitReady();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reemplazar y generar' }));
    await waitFor(() => expect(counter()).toBe('20/20'));

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer generación' }));
    expect(counter()).toBe('2/20');
    expect(screen.queryByRole('button', { name: 'Deshacer generación' })).not.toBeInTheDocument();
  });

  it('shows an accessible, reduced-motion aware indicator and ignores double clicks', async () => {
    const pending = deferredGeneration();
    renderScreen();
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    fireEvent.click(submit());

    const status = await within(dialog()).findByText('La IA está pensando…');
    for (const dot of within(status.parentElement!).getByTestId('ai-thinking-dots').children) {
      expect(dot.className).toContain('motion-reduce:animate-none');
      expect(dot.className).toContain('ai-thinking-dot');
    }
    expect(status.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(submit()).toBeDisabled();
    await waitFor(() => expect(client.requestDeckGeneration).toHaveBeenCalledTimes(1));

    await act(async () => pending[0](modelResponse()));
    expect(screen.queryByTestId('ai-thinking-dots')).not.toBeInTheDocument();
    expect(client.requestDeckGeneration).toHaveBeenCalledTimes(1);
  });

  it('cancels a running generation, keeps the previous selection and ignores the stale answer', async () => {
    const pending = deferredGeneration();
    renderScreen();
    addCard('Hotfix de Emergencia');
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    await within(dialog()).findByText('La IA está pensando…');

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((client.requestDeckGeneration.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);

    // Regenerate with a new answer; the old one arriving late must not win
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    await waitFor(() => expect(pending).toHaveLength(2));
    const second = CARD_DEFINITIONS.slice(2, 12).map((c) => ({ id: c.id, quantity: 2 }));
    await act(async () => pending[1](modelResponse(second)));
    await act(async () => pending[0](modelResponse()));
    expect(counter()).toBe('20/20');
    // Only cards in the deck have an enabled "remove" button
    expect(screen.getAllByRole('button', { name: 'Quitar Hotfix de Emergencia' }).some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Quitar Junior Dev' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('survives unmounting during a request', async () => {
    const pending = deferredGeneration();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderScreen();
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    await waitFor(() => expect(pending).toHaveLength(1));
    view.unmount();
    await act(async () => pending[0](modelResponse()));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('offers the backup generator while the AI is being prepared', async () => {
    client.getLocalAiHealth.mockResolvedValue(health('model_missing'));
    renderScreen();
    openDialog();
    expect(await within(dialog()).findByText('Falta el modelo de IA. Prepararlo requiere una descarga grande.')).toBeInTheDocument();
    expect(within(dialog()).getByText(/puede descargar más de 1 GB/)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Usar generador de respaldo' }));
    expect(await screen.findByText('La IA local no estaba disponible. Se utilizó el generador de respaldo.')).toBeInTheDocument();
    expect(client.requestDeckGeneration).not.toHaveBeenCalled();
    expect(counter()).toBe('20/20');
  });

  it('reports an insufficient collection without touching the editor', async () => {
    state.collection = { 'senior-dev': 2, hotfix: 1 };
    renderScreen();
    addCard('Hotfix de Emergencia');
    openDialog();
    await waitReady();
    fireEvent.click(submit());
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Tu colección solo permite 3 de 20 cartas');
    expect(client.requestDeckGeneration).not.toHaveBeenCalled();
    expect(counter()).toBe('1/20');
  });

  it('is not offered when editing an existing deck', () => {
    render(
      <MemoryRouter>
        <DeckBuilderScreen
          userId="u1"
          editing={{ id: 'd1', name: 'Mine', cover_emoji: '⚔️', is_preset: false, user_id: 'u1', cards: VALID.map((c) => ({ card_id: c.id, quantity: c.quantity })), total: 20, programadores: 0, qas: 0, consumibles: 0 }}
          onBack={vi.fn()}
          onSaved={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Generar con IA' })).not.toBeInTheDocument();
  });
});

describe('AI preparation panel', () => {
  const view = (patch: Partial<AiStatusView> = {}): AiStatusView => ({
    health: health('ready'),
    unreachable: false,
    busy: false,
    prepare: vi.fn(),
    cancel: vi.fn(),
    refresh: vi.fn(),
    ...patch,
  });
  const renderDialog = (ai: AiStatusView, onGenerate = vi.fn()) => {
    const r = render(<AiDeckDialog open status="selecting" error={null} replaceCount={0} initialStrategy="balanced" ai={ai} onGenerate={onGenerate} onClose={vi.fn()} />);
    return { panel: within(screen.getByTestId('ai-status-panel')), onGenerate, unmount: r.unmount };
  };

  const TEXTS: Record<AiSetupStatus, string> = {
    service_starting: 'Preparando la IA local…',
    runtime_missing: 'Falta el motor de IA. Prepararlo requiere una descarga grande.',
    runtime_downloading: 'Descargando el motor de IA…',
    runtime_ready: 'Iniciando el motor de IA…',
    model_missing: 'Falta el modelo de IA. Prepararlo requiere una descarga grande.',
    model_downloading: 'Descargando el modelo de IA…',
    model_loading: 'Modelo descargado. Iniciando…',
    ready: 'La IA local está lista.',
    error: 'No se pudo preparar la IA local.',
  };

  it.each(AI_SETUP_STATUSES)('describes the %s state in an accessible status region', (status) => {
    const { panel } = renderDialog(view({ health: health(status) }));
    expect(panel.getByRole('status')).toHaveTextContent(TEXTS[status]);
    expect(screen.getByRole('button', { name: status === 'ready' ? 'Generar' : 'Usar generador de respaldo' })).toBeInTheDocument();
  });

  it('shows a real percentage and sizes when the total is known', () => {
    const { panel } = renderDialog(view({
      health: health('model_downloading', { model: { ...health('ready').model, installed: false, downloading: true, downloadedBytes: 524288000, totalBytes: 986000000, progress: 53 } }),
    }));
    const bar = panel.getByRole('progressbar', { name: 'Progreso de la descarga' });
    expect(bar).toHaveAttribute('aria-valuenow', '53');
    expect(panel.getByText('53%')).toBeInTheDocument();
    expect(panel.getByText('500 MB de 940 MB')).toBeInTheDocument();
  });

  it('never invents a percentage without a total', () => {
    const { panel } = renderDialog(view({
      health: health('runtime_downloading', { runtime: { ...health('ready').runtime, downloading: true, downloadedBytes: 1258291200, totalBytes: null, progress: null } }),
    }));
    expect(panel.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(panel.getByText('1,17 GB descargados')).toBeInTheDocument();
    expect(panel.getByTestId('ai-thinking-dots')).toBeInTheDocument();
  });

  it('prepares, cancels, retries and falls back on request', () => {
    const missing = view({ health: health('runtime_missing') });
    const { panel, onGenerate } = renderDialog(missing);
    fireEvent.click(panel.getByRole('button', { name: 'Preparar IA local' }));
    expect(missing.prepare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Usar generador de respaldo' }));
    expect(onGenerate).toHaveBeenCalledWith('balanced', false);
  });

  it('can cancel a download and retry after an error or an unreachable service', () => {
    const downloading = view({ health: health('model_downloading'), busy: false });
    const first = renderDialog(downloading);
    fireEvent.click(first.panel.getByRole('button', { name: 'Cancelar descarga' }));
    expect(downloading.cancel).toHaveBeenCalled();
    first.unmount();

    const failed = view({ health: health('error', { lastError: 'PORT_IN_USE' }) });
    const second = renderDialog(failed);
    expect(second.panel.getByText('Otro programa está usando el puerto de la IA local.')).toBeInTheDocument();
    fireEvent.click(second.panel.getByRole('button', { name: 'Reintentar' }));
    expect(failed.prepare).toHaveBeenCalled();
  });

  it('retries a service that is not reachable', () => {
    const down = view({ health: null, unreachable: true });
    const { panel } = renderDialog(down);
    expect(panel.getByRole('status')).toHaveTextContent('El servicio de IA local no está en marcha.');
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }));
    expect(down.refresh).toHaveBeenCalled();
  });

  it('disables the preparation buttons while a request is in flight', () => {
    const { panel } = renderDialog(view({ health: health('model_missing'), busy: true }));
    expect(panel.getByRole('button', { name: 'Preparar IA local' })).toBeDisabled();
  });
});

describe('useLocalAiStatus polling', () => {
  const api = () => ({ getHealth: vi.fn(), startSetup: vi.fn(), cancelSetup: vi.fn() }) as unknown as LocalAiStatusApi & Record<string, ReturnType<typeof vi.fn>>;

  it('polls only transient states, one request at a time, and stops at ready', async () => {
    vi.useFakeTimers();
    const a = api();
    vi.mocked(a.getHealth)
      .mockResolvedValueOnce(health('model_downloading'))
      .mockResolvedValueOnce(health('model_loading'))
      .mockResolvedValue(health('ready'));
    const { result } = renderHook(() => useLocalAiStatus(true, a));
    await act(async () => undefined);
    expect(a.getHealth).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(result.current.health?.status).toBe('ready');
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(a.getHealth).toHaveBeenCalledTimes(3);
  });

  it('does not poll while inactive and stops when unmounted', async () => {
    vi.useFakeTimers();
    const a = api();
    vi.mocked(a.getHealth).mockResolvedValue(health('runtime_downloading'));
    const { rerender, unmount } = renderHook(({ active }) => useLocalAiStatus(active, a), { initialProps: { active: false } });
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(a.getHealth).not.toHaveBeenCalled();
    rerender({ active: true });
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    const calls = vi.mocked(a.getHealth).mock.calls.length;
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 5));
    expect(a.getHealth).toHaveBeenCalledTimes(calls);
    expect((vi.mocked(a.getHealth).mock.calls.at(-1)![0] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });

  it('reports an unreachable service after a few retries', async () => {
    vi.useFakeTimers();
    const a = api();
    vi.mocked(a.getHealth).mockRejectedValue(new Error('NETWORK'));
    const { result } = renderHook(() => useLocalAiStatus(true, a));
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(result.current.unreachable).toBe(true);
    expect(a.getHealth).toHaveBeenCalledTimes(6);
  });

  it('starts the preparation and resumes polling', async () => {
    vi.useFakeTimers();
    const a = api();
    vi.mocked(a.getHealth).mockResolvedValueOnce(health('runtime_missing')).mockResolvedValue(health('runtime_downloading'));
    vi.mocked(a.startSetup).mockResolvedValue(health('runtime_downloading'));
    const { result } = renderHook(() => useLocalAiStatus(true, a));
    await act(async () => undefined);
    expect(result.current.health?.status).toBe('runtime_missing');
    await act(async () => result.current.prepare());
    expect(a.startSetup).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(result.current.health?.status).toBe('runtime_downloading');
    expect(vi.mocked(a.getHealth).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
