export type MobileDeviceStatus = 'pendente' | 'autorizado' | 'bloqueado';

export type MobileDevice = {
  id: string;
  deviceId: string;
  nomeAparelho: string;
  usuarioLogin: string;
  usuarioNome: string;
  plataforma: 'android' | 'ios' | 'unknown';
  modelo: string;
  versaoApp: string;
  status: MobileDeviceStatus;
  ultimoAcessoEm: string;
  criadoEm: string;
};

export type MobileDeviceFilter = {
  busca: string;
  status: 'todos' | MobileDeviceStatus;
  page: number;
  pageSize: number;
};
