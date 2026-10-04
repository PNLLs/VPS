import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { eventBus, getRecentEvents } from '../events/event-bus.js';

let wss: WebSocketServer | null = null;
let isInitialized = false;

export function initializeWebSocket(server: Server) {
  if (isInitialized && wss) {
    console.log('🔄 [WebSocket] Уже инициализирован, пропускаем дублирование.');
    return;
  }

  wss = new WebSocketServer({ server });
  isInitialized = true;

  wss.on('connection', (ws) => {
    console.log('🔌 [WebSocket] Новый клиент подключился.');
    try {
      ws.send(JSON.stringify({ type: 'GLOBAL_EVENTS_HISTORY', data: getRecentEvents(100) }));
    } catch (err) {
      console.error('❌ [WebSocket] Сбой стартового пакета:', err);
    }
    ws.on('close', () => console.log('🔌 [WebSocket] Клиент отключился.'));
  });

  // Подписка на event-bus — рассылаем каждое событие всем клиентам
  eventBus.on('event', (evt) => {
  console.log('🎯 [eventBus] получено событие:', evt.source, evt.message);
  if (!wss) {
    console.log('⚠️ [eventBus] wss === null, событие никуда не уходит');
    return;
  }
  const message = JSON.stringify({ type: 'GLOBAL_EVENT', data: evt });
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent++;
    }
  });
  console.log(`🎯 [eventBus] разослано ${sent} клиентам`);
});

  console.log('🌐 [WebSocket] Сервер запущен.');
}

export function broadcast(type: string, data: any) {
  if (!wss) return;
  try {
    const message = JSON.stringify({ type, data });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  } catch (err) {
    console.error('❌ [WebSocket] Сбой broadcast:', type, err);
  }
}