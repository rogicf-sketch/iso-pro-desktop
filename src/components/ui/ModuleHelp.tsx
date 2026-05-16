import type { ReactNode } from 'react';
import { useMostrarAjudaModulos } from '@/modules/configuracoes/hooks/useMostrarAjudaModulos';

type ModuleHelpProps = {
  children: ReactNode;
};

/** Oculta blocos explicativos longos quando "Mostrar textos de ajuda nos modulos" esta desligado em Aparência. */
export function ModuleHelp({ children }: ModuleHelpProps) {
  const mostrar = useMostrarAjudaModulos();
  if (!mostrar) return null;
  return <>{children}</>;
}
