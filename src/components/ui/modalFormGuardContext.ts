import { createContext } from 'react';

export type ModalFormGuardApi = {
  registerDirty: (dirty: boolean) => void;
  requestClose: (close: () => void) => void;
  isDirty: boolean;
};

export const ModalFormGuardContext = createContext<ModalFormGuardApi | null>(null);
