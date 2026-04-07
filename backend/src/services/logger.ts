export type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = Record<string, unknown> & {
  msg: string;
  requestId?: string;
};

export function log(level: LogLevel, payload: LogPayload): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    ...payload,
  };
  if (level === 'error') {
    console.error(JSON.stringify(line));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(line));
    return;
  }
  console.log(JSON.stringify(line));
}

