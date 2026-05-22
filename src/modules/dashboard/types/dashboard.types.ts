export type DashboardIndicatorTone = 'neutral' | 'ok' | 'warning' | 'danger';

export type DashboardIndicator = {
  label: string;
  value: string;
  /** Valor numerico para animacao e medidor (quando aplicavel). */
  numericValue?: number;
  helper: string;
  route?: string;
  tone?: DashboardIndicatorTone;
};

export type DashboardAlertSeverity = 'critical' | 'warning' | 'info' | 'success';

export type DashboardAlert = {
  title: string;
  detail: string;
  severity: DashboardAlertSeverity;
  route?: string;
};

export type DashboardCloudPanel = {
  status: 'ready' | 'partial' | 'missing';
  title: string;
  detail: string;
  tone: DashboardIndicatorTone;
  materiaisNuvem: boolean;
};
