
type LogLevel = 'info' | 'warn' | 'error';

interface ClientLogPayload {
  level: LogLevel;
  message: string;
  url: string;
  stack?: string;
}

const API_BASE = '';

async function sendToServer(payload: ClientLogPayload): Promise<void> {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    await fetch(`${API_BASE}/api/logs/client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
  }
}

function errorToString(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.info(`[INFO] ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
    const full = args.length ? `${message} ${args.map(errorToString).join(' ')}` : message;
    sendToServer({ level: 'warn', message: full, url: location.href });
  },

  error(message: string, cause?: unknown): void {
    console.error(`[ERROR] ${message}`, cause ?? '');
    const detail = cause !== undefined ? `: ${errorToString(cause)}` : '';
    const stack = cause instanceof Error ? cause.stack : undefined;
    sendToServer({
      level: 'error',
      message: `${message}${detail}`,
      url: location.href,
      stack,
    });
  },
};

export function createDevLogger(tag: string, color = '#9c7ef7') {
  return (msg: string, ...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.log(`%c[${tag}]`, `color:${color};font-weight:bold`, msg, ...args);
    }
  };
}
