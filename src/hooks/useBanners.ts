import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { validateBannerDraft, type Banner, type BannerDraft } from '@/lib/banners';

/** RLS returns only active banners to players; admins also get scheduled and finished ones. */
export function useBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: queryErr } = await supabase
        .from('banners')
        .select('id, titulo, fecha_inicio, fecha_fin, coste, cartas_por_sobre, banner_cards(card_id, peso_aparicion)')
        .order('fecha_inicio', { ascending: false });

      if (cancelled) return;
      if (queryErr) {
        console.error('Failed to load banners:', queryErr);
        setError(queryErr.message);
        setLoading(false);
        return;
      }

      setBanners(
        (data ?? []).map((row) => ({
          id: row.id,
          titulo: row.titulo,
          fechaInicio: row.fecha_inicio,
          fechaFin: row.fecha_fin,
          coste: row.coste,
          cartasPorSobre: row.cartas_por_sobre,
          cards: (row.banner_cards ?? []).map((bc) => ({ cardId: bc.card_id, pesoAparicion: bc.peso_aparicion })),
        })),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Creates (bannerId = null) or updates a banner and replaces its cards atomically. Returns the banner id. */
  const saveBanner = useCallback(async (bannerId: string | null, draft: BannerDraft): Promise<string> => {
    const validation = validateBannerDraft(draft);
    if (validation) throw new Error(validation);

    const { data, error: rpcErr } = await supabase.rpc('save_banner', {
      p_banner_id: bannerId,
      p_titulo: draft.titulo.trim(),
      p_fecha_inicio: draft.fechaInicio,
      p_fecha_fin: draft.fechaFin,
      p_coste: draft.coste,
      p_cartas_por_sobre: draft.cartasPorSobre,
      p_cards: draft.cards.map((c) => ({ card_id: c.cardId, peso_aparicion: c.pesoAparicion })),
    });
    if (rpcErr) throw new Error(rpcErr.message);

    setReloadKey((k) => k + 1);
    return data;
  }, []);

  return { banners, loading, error, refresh, saveBanner };
}
