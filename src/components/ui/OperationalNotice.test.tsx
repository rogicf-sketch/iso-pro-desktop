/** @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationalNotice, SUCCESS_NOTICE_AUTO_HIDE_MS } from './OperationalNotice';

describe('OperationalNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('success some sozinho apos o tempo padrao', () => {
    render(<OperationalNotice tone="success">Salvo com sucesso.</OperationalNotice>);
    expect(screen.getByText('Salvo com sucesso.')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(SUCCESS_NOTICE_AUTO_HIDE_MS - 1);
    });
    expect(screen.getByText('Salvo com sucesso.')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Salvo com sucesso.')).toBeNull();
  });

  it('warning e critical nao somem sozinhos', () => {
    const { rerender } = render(
      <OperationalNotice tone="warning">Atenção</OperationalNotice>,
    );
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Atenção')).toBeTruthy();

    rerender(<OperationalNotice tone="critical">Erro</OperationalNotice>);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Erro')).toBeTruthy();
  });

  it('nova mensagem success reinicia o timer', () => {
    const { rerender } = render(
      <OperationalNotice tone="success">Primeira</OperationalNotice>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(<OperationalNotice tone="success">Segunda</OperationalNotice>);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Segunda')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SUCCESS_NOTICE_AUTO_HIDE_MS - 3000);
    });
    expect(screen.queryByText('Segunda')).toBeNull();
  });

  it('chama onAutoHide ao esconder', () => {
    const onAutoHide = vi.fn();
    render(
      <OperationalNotice tone="success" onAutoHide={onAutoHide}>
        Ok
      </OperationalNotice>,
    );
    act(() => {
      vi.advanceTimersByTime(SUCCESS_NOTICE_AUTO_HIDE_MS);
    });
    expect(onAutoHide).toHaveBeenCalledTimes(1);
  });
});
