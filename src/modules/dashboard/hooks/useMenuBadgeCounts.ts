import { useCallback, useEffect, useState } from 'react';
import { getMenuBadgeCounts } from '../services/menuBadgeCounts.service';
import type { MenuBadgeCounts } from '../utils/pendenciasOperacionais.utils';

const REFRESH_MS = 90_000;

const INITIAL: MenuBadgeCounts = {
  conferencia: 0,
  rir: 0,
  rnc: 0,
  inventario: 0,
  recebimentos: 0,
};

export function useMenuBadgeCounts() {
  const [counts, setCounts] = useState<MenuBadgeCounts>(INITIAL);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getMenuBadgeCounts();
    setCounts(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { counts, loading, refresh };
}
