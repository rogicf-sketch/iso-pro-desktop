/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SnapshotConflictHint } from './SnapshotConflictHint';

describe('SnapshotConflictHint', () => {
  it('nao renderiza nada quando show e false', () => {
    const { container } = render(<SnapshotConflictHint show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza aviso quando show e true', () => {
    render(<SnapshotConflictHint show />);
    expect(screen.getByText(/Dados no servidor mudaram/i)).toBeDefined();
  });

  it('nao exibe botao Recarregar sem onReload', () => {
    render(<SnapshotConflictHint show />);
    expect(screen.queryByRole('button', { name: /Recarregar dados/i })).toBeNull();
  });

  it('exibe Recarregar dados e chama onReload ao clicar', () => {
    const onReload = vi.fn();
    render(<SnapshotConflictHint show onReload={onReload} />);

    const btn = screen.getByRole('button', { name: /Recarregar dados/i });
    fireEvent.click(btn);

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
