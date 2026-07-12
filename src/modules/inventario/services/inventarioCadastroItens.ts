import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import type { InventarioItem } from '../types/inventario.types';

export type MaterialCadastroInventario = {
  codigo: string;
  descricao: string;
  unidade: string;
};

/** Monta linhas de inventário a partir do cadastro + saldo operacional (sem duplicar códigos já na lista). */
export function montarItensInventarioDoCadastro(input: {
  materiais: MaterialCadastroInventario[];
  saldoPorCodigo: Map<string, number>;
  itensExistentes: InventarioItem[];
  incluirSaldoZero: boolean;
}): InventarioItem[] {
  const existentes = new Set(
    input.itensExistentes.map((item) => codigoMaterialKey(item.codigoMaterial)).filter(Boolean),
  );
  const novos: InventarioItem[] = [];

  for (const material of input.materiais) {
    const codigo = String(material.codigo ?? '').trim();
    if (!codigo) continue;
    const key = codigoMaterialKey(codigo);
    if (!key || existentes.has(key)) continue;

    const saldo = input.saldoPorCodigo.get(key) ?? 0;
    if (!input.incluirSaldoZero && saldo <= 1e-9) continue;

    novos.push({
      id: crypto.randomUUID(),
      codigoMaterial: codigo,
      descricaoMaterial: String(material.descricao ?? '').trim() || codigo,
      unidade: String(material.unidade ?? '').trim() || 'UN',
      saldoSistema: saldo,
      quantidadeContada: 0,
      localizacaoContada: '',
    });
    existentes.add(key);
  }

  return novos;
}
