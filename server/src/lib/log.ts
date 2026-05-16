// Minimal structured logger. One place to change format / ship to a service later.
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${level.toUpperCase()} (${scope}) ${msg}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) fn(line, safe(extra));
  else fn(line);
}

function safe(e: unknown) {
  if (e instanceof Error) return { message: e.message, name: e.name, stack: e.stack, ...(e as any) };
  return e;
}

export const log = {
  info: (scope: string, msg: string, extra?: unknown) => emit('info', scope, msg, extra),
  warn: (scope: string, msg: string, extra?: unknown) => emit('warn', scope, msg, extra),
  error: (scope: string, msg: string, extra?: unknown) => emit('error', scope, msg, extra),
};
