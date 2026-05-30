import { collectAllPages } from '../../../lib/collectAllPages';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import { montarMenuBadgeCounts, type MenuBadgeCounts } from '../utils/pendenciasOperacionais.utils';

const BADGES_VAZIOS: MenuBadgeCounts = {
  conferencia: 0,
  rir: 0,
  rnc: 0,
  inventario: 0,
  recebimentos: 0,
};

export async function getMenuBadgeCounts(): Promise<MenuBadgeCounts> {
  try {
    const [recebimentos, rir, rnc, inventarios] = await Promise.all([
      collectAllPages((page, pageSize) =>
        listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
      ),
      collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    ]);
    return montarMenuBadgeCounts({ recebimentos, rir, rnc, inventarios });
  } catch {
    return { ...BADGES_VAZIOS };
  }
}
