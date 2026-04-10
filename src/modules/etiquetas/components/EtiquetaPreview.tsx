import { resolverUrlLogoInstitucional } from '../../../lib/logoInstitucional';
import type { EtiquetaFormData } from '../types/etiqueta.types';

type Props = {
  form: EtiquetaFormData;
};

export function EtiquetaPreview({ form }: Props) {
  const logoUrl = resolverUrlLogoInstitucional();
  const termica = form.formato.startsWith('termica');

  return (
    <div className="panel" style={{ background: '#f8fafc' }}>
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Preview</p>
          <h2>{form.formato}</h2>
        </div>
      </div>
      <div
        style={{
          border: '1px dashed #94a3b8',
          borderRadius: 12,
          padding: 16,
          background: '#fff',
          width: '100%',
          maxWidth: termica ? 360 : 520,
        }}
      >
        {logoUrl ? (
          <div style={{ marginBottom: 12 }}>
            <img
              alt=""
              src={logoUrl}
              style={{
                maxWidth: termica ? 120 : 160,
                maxHeight: termica ? 40 : 64,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              marginBottom: 10,
              padding: 8,
              border: '1px dashed #cbd5e1',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            Logo institucional (Configuracoes)
          </div>
        )}
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
          {form.modelo} • {form.larguraMm}x{form.alturaMm} mm
        </div>
        <strong style={{ display: 'block', fontSize: 18 }}>{form.titulo || 'Titulo da etiqueta'}</strong>
        <div style={{ fontFamily: 'Consolas, monospace', marginTop: 8 }}>{form.codigo || 'CODIGO'}</div>
        <p style={{ marginTop: 8, marginBottom: 8 }}>{form.descricao || 'Descricao da etiqueta'}</p>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Origem: {form.moduloOrigem} {form.referenciaId ? `• Ref ${form.referenciaId}` : ''}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Copias: {form.quantidadeCopias}</div>
      </div>
    </div>
  );
}
