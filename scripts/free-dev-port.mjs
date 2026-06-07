/**
 * Libera a porta do Vite (5173) antes de `npm run dev`.
 * Evita "Port 5173 is already in use" quando uma sessão anterior ficou aberta.
 */
import { execSync } from 'node:child_process';

const PORT = Number(process.env.VITE_DEV_PORT || 5173);

function freePortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[free-dev-port] Encerrado processo PID ${pid} na porta ${port}.`);
      } catch {
        /* processo já encerrado */
      }
    }
    if (pids.size === 0) {
      console.log(`[free-dev-port] Porta ${port} livre.`);
    }
  } catch {
    console.log(`[free-dev-port] Porta ${port} livre (nenhum listener).`);
  }
}

function freePortUnix(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    for (const pid of out.trim().split(/\s+/).filter(Boolean)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        console.log(`[free-dev-port] Encerrado processo PID ${pid} na porta ${port}.`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    console.log(`[free-dev-port] Porta ${port} livre.`);
  }
}

if (process.platform === 'win32') {
  freePortWindows(PORT);
} else {
  freePortUnix(PORT);
}
