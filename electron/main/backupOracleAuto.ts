import { app, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deveExecutarBackupOracleAutomatico } from '../../src/lib/backupOracleAuto.policy';

type BackupOracleActivityKind = 'atendimento' | 'recebimento' | 'cadastro';

type BackupOracleRuntimeSettings = {
  habilitado: boolean;
  intervaloRotinaDias: number;
  intervaloFluxoAltoDias: number;
  minAtendimentosFluxo: number;
  minRecebimentosFluxo: number;
  minCadastrosFluxo: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  cliente: string;
  projeto: string;
};

type BackupOracleState = {
  ultimoBackupEm: string | null;
  ultimoBackupOk: boolean;
  ultimoErro: string;
  ultimoMotivo: string;
  atividade: { atendimentos: number; recebimentos: number; cadastros: number };
};

const DEFAULT_SETTINGS: BackupOracleRuntimeSettings = {
  habilitado: false,
  intervaloRotinaDias: 7,
  intervaloFluxoAltoDias: 3,
  minAtendimentosFluxo: 10,
  minRecebimentosFluxo: 3,
  minCadastrosFluxo: 5,
  supabaseUrl: '',
  supabaseAnonKey: '',
  cliente: '',
  projeto: '',
};

let settings: BackupOracleRuntimeSettings = { ...DEFAULT_SETTINGS };
let state: BackupOracleState = {
  ultimoBackupEm: null,
  ultimoBackupOk: true,
  ultimoErro: '',
  ultimoMotivo: '',
  atividade: { atendimentos: 0, recebimentos: 0, cadastros: 0 },
};
let backupEmCurso = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounceCheck: ReturnType<typeof setTimeout> | null = null;

function statePath(): string {
  return path.join(app.getPath('userData'), 'backup-oracle-auto-state.json');
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'backup-oracle-runtime-settings.json');
}

function scriptsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backup-scripts');
  }
  return path.join(app.getAppPath(), 'scripts');
}

function projectRootForBackups(): string {
  if (app.isPackaged) {
    return app.getPath('userData');
  }
  return app.getAppPath();
}

async function loadPersisted(): Promise<void> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    const j = JSON.parse(raw) as Partial<BackupOracleState>;
    state = {
      ultimoBackupEm: j.ultimoBackupEm ?? null,
      ultimoBackupOk: j.ultimoBackupOk !== false,
      ultimoErro: String(j.ultimoErro ?? ''),
      ultimoMotivo: String(j.ultimoMotivo ?? ''),
      atividade: {
        atendimentos: Number(j.atividade?.atendimentos ?? 0),
        recebimentos: Number(j.atividade?.recebimentos ?? 0),
        cadastros: Number(j.atividade?.cadastros ?? 0),
      },
    };
  } catch {
    /* primeiro arranque */
  }
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as BackupOracleRuntimeSettings) };
  } catch {
    /* defaults */
  }
}

async function saveState(): Promise<void> {
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
}

async function saveSettings(): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function runNodeScript(scriptName: string, extraEnv: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const script = path.join(scriptsRoot(), scriptName);
    const cwd = projectRootForBackups();
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...extraEnv,
    };
    const child = spawn(process.execPath, ['--use-system-ca', script], {
      cwd,
      env,
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (c) => {
      output += String(c);
    });
    child.stderr?.on('data', (c) => {
      output += String(c);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function prepararAmbienteBackup(): Promise<Record<string, string>> {
  const root = projectRootForBackups();
  const backupDir = path.join(root, 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  if (settings.cliente || settings.projeto) {
    await fs.writeFile(
      path.join(backupDir, 'oci-upload-context.json'),
      JSON.stringify(
        {
          cliente: settings.cliente,
          projeto: settings.projeto,
          atualizadoEm: new Date().toISOString(),
          origem: 'I.S.O PRO backup automatico',
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const env: Record<string, string> = {};
  if (settings.supabaseUrl) {
    env.SUPABASE_URL = settings.supabaseUrl;
    env.VITE_SUPABASE_URL = settings.supabaseUrl;
  }
  if (settings.supabaseAnonKey) {
    env.SUPABASE_ANON_KEY = settings.supabaseAnonKey;
    env.VITE_SUPABASE_ANON_KEY = settings.supabaseAnonKey;
  }
  env.SNAPSHOT_EXPORT_DIR = backupDir;
  env.SUPPRESS_LABEL_WARNING = 'True';
  return env;
}

async function executarBackupOracle(motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (backupEmCurso) {
    return { ok: false, error: 'Backup Oracle ja em curso.' };
  }
  if (!settings.habilitado && motivo !== 'manual') {
    return { ok: false, error: 'Backup automatico desactivado.' };
  }
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
    return { ok: false, error: 'Supabase nao configurado nas Configuracoes.' };
  }

  backupEmCurso = true;
  try {
    const env = await prepararAmbienteBackup();
    const exportRun = await runNodeScript('export-iso-pro-snapshot.mjs', env);
    if (exportRun.code !== 0) {
      throw new Error(exportRun.output.trim() || 'export-iso-pro-snapshot falhou');
    }
    const uploadRun = await runNodeScript('upload-backup-to-oci-node.mjs', env);
    if (uploadRun.code !== 0) {
      throw new Error(uploadRun.output.trim() || 'upload-backup-to-oci falhou');
    }

    state.ultimoBackupEm = new Date().toISOString();
    state.ultimoBackupOk = true;
    state.ultimoErro = '';
    state.ultimoMotivo = motivo;
    state.atividade = { atendimentos: 0, recebimentos: 0, cadastros: 0 };
    await saveState();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.ultimoBackupOk = false;
    state.ultimoErro = msg;
    state.ultimoMotivo = motivo;
    await saveState();
    return { ok: false, error: msg };
  } finally {
    backupEmCurso = false;
  }
}

async function avaliarBackupAutomatico(): Promise<void> {
  if (!settings.habilitado || backupEmCurso) return;

  const decisao = deveExecutarBackupOracleAutomatico({
    agora: new Date(),
    ultimoBackupEm: state.ultimoBackupEm,
    atividade: state.atividade,
    intervaloRotinaDias: settings.intervaloRotinaDias,
    intervaloFluxoAltoDias: settings.intervaloFluxoAltoDias,
    minAtendimentosFluxo: settings.minAtendimentosFluxo,
    minRecebimentosFluxo: settings.minRecebimentosFluxo,
    minCadastrosFluxo: settings.minCadastrosFluxo,
  });

  if (!decisao.executar) return;
  await executarBackupOracle(decisao.motivo);
}

function agendarVerificacao(): void {
  if (debounceCheck) clearTimeout(debounceCheck);
  debounceCheck = setTimeout(() => {
    void avaliarBackupAutomatico();
  }, 60_000);
}

function registrarAtividade(kind: BackupOracleActivityKind): void {
  if (kind === 'atendimento') state.atividade.atendimentos += 1;
  else if (kind === 'recebimento') state.atividade.recebimentos += 1;
  else state.atividade.cadastros += 1;
  void saveState();
  agendarVerificacao();
}

export function registerBackupOracleAutoHandlers(): void {
  void loadPersisted();

  ipcMain.handle('desktop-backup-oracle:sync-settings', async (_e, payload: unknown) => {
    try {
      settings = { ...DEFAULT_SETTINGS, ...(payload as BackupOracleRuntimeSettings) };
      await saveSettings();
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('desktop-backup-oracle:registrar-atividade', async (_e, kind: unknown) => {
    if (kind === 'atendimento' || kind === 'recebimento' || kind === 'cadastro') {
      registrarAtividade(kind);
    }
    return { ok: true as const };
  });

  ipcMain.handle('desktop-backup-oracle:estado', async () => {
    return {
      ok: true as const,
      ultimoBackupEm: state.ultimoBackupEm,
      ultimoBackupOk: state.ultimoBackupOk,
      ultimoErro: state.ultimoErro,
      ultimoMotivo: state.ultimoMotivo,
      atividade: state.atividade,
      backupEmCurso,
    };
  });

  ipcMain.handle('desktop-backup-oracle:executar-agora', async () => {
    const r = await executarBackupOracle('manual');
    if (r.ok) return { ok: true as const, detail: 'Backup Oracle concluido.' };
    return { ok: false as const, error: r.error };
  });

  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void avaliarBackupAutomatico();
  }, 60 * 60 * 1000);

  app.on('before-quit', () => {
    if (timer) clearInterval(timer);
  });
}

export async function initBackupOracleAuto(): Promise<void> {
  await loadPersisted();
  setTimeout(() => {
    void avaliarBackupAutomatico();
  }, 15_000);
}
