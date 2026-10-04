import { EventEmitter } from 'node:events';

export type EventSource = 'SYSTEM' | 'MINECRAFT' | 'DISCORD' | 'HOTMC';
export type EventLevel  = 'info' | 'success' | 'warning' | 'error';

export interface GlobalEvent {
  id: number;
  timestamp: string;
  timestampMs: number;
  source: EventSource;
  level: EventLevel;
  message: string;
}

const HISTORY_LIMIT = 200;
const history: GlobalEvent[] = [];
let lastId = 0;

// Внутренний emitter — wsServer подпишется на него и будет рассылать события
export const eventBus = new EventEmitter();

function nowTime(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => n.toString().padStart(2, '0'))
    .join(':');
}

export function emitEvent(source: EventSource, level: EventLevel, message: string): GlobalEvent {
  const evt: GlobalEvent = {
    id: ++lastId,
    timestamp: nowTime(),
    timestampMs: Date.now(),
    source,
    level,
    message,
  };
  history.push(evt);
  if (history.length > HISTORY_LIMIT) history.shift();

  eventBus.emit('event', evt);   // ← ловит wsServer
  return evt;
}

export function getRecentEvents(limit = 100): GlobalEvent[] {
  return history.slice(-limit);
}