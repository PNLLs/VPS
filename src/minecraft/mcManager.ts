import mineflayer from 'mineflayer';
import 'dotenv/config';
import { broadcast } from '../websocket/wsServer.js';
import { emitEvent } from '../events/event-bus.js';

// ============================================================
//  Глушим известный спам protodef (Paper 1.21.x + ArmorTrimMaterial)
// ============================================================
const originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const first = args[0];
  const msg = typeof first === 'string' ? first : (first?.message ?? '');
  if (typeof msg === 'string' && msg.includes('PartialReadError')) return;
  originalConsoleError(...args);
};

interface MinecraftBotStatus {
  id: string;
  username: string;
  targetServer: string;
  status: 'connecting' | 'online' | 'disconnected' | 'kicked';
  health: number;
  food: number;
  blocksMined: number;
  attempts: number;
  position: { x: number; y: number; z: number } | null;
  viewerPort: number | null;
}

interface InventoryItem {
  slot: number;
  name: string;
  displayName: string;
  count: number;
}

const VIEWER_BASE_PORT = 3001;
const ENABLE_VIEWER = String(process.env.ENABLE_VIEWER || 'false').toLowerCase() === 'true';

const serverAddress = `${process.env.MC_SERVER_HOST || '127.0.0.1'}:${process.env.MC_SERVER_PORT || '25565'}`;

const minecraftBots: MinecraftBotStatus[] = [
  { id: 'mc_bot_1', username: process.env.MC_BOT_1_USERNAME || 'pnalls',         targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0, position: null, viewerPort: null },
  { id: 'mc_bot_2', username: process.env.MC_BOT_2_USERNAME || 'pnalls_twinone', targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0, position: null, viewerPort: null },
  { id: 'mc_bot_3', username: process.env.MC_BOT_3_USERNAME || 'pnalls_twintwo', targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0, position: null, viewerPort: null },
];

const liveBots: any[] = [null, null, null];
const viewerStarted: boolean[] = [false, false, false];

// ============================================================
//  ДЕДУП ЧАТА
// ============================================================
const recentChatKeys = new Map<string, number>();
const CHAT_DEDUP_TTL_MS = 3000;

function isDuplicateChat(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentChatKeys) {
    if (now - ts > CHAT_DEDUP_TTL_MS) recentChatKeys.delete(k);
  }
  if (recentChatKeys.has(key)) return true;
  recentChatKeys.set(key, now);
  return false;
}

// ============================================================
//  КЭШ UUID → НИК
// ============================================================
const uuidToName = new Map<string, string>();

function resolveSenderName(bot: any, uuid: string | undefined, fallbackName: string | undefined): string {
  if (uuid) {
    const cached = uuidToName.get(uuid);
    if (cached) return cached;
    const known = bot?.players?.[uuid]?.username;
    if (known) {
      uuidToName.set(uuid, known);
      return known;
    }
  }
  if (fallbackName) {
    return String(fallbackName).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
  }
  return 'Игрок';
}

// ============================================================
//  ХЕЛПЕРЫ
// ============================================================
function updateBotAndBroadcast(index: number, action: (bot: MinecraftBotStatus) => void) {
  action(minecraftBots[index]);
  broadcast('MINECRAFT_STATUS_UPDATE', minecraftBots);
}

function snapshotPosition(bot: any, index: number) {
  const pos = bot?.entity?.position;
  if (!pos) return;
  minecraftBots[index].position = {
    x: +pos.x.toFixed(1),
    y: +pos.y.toFixed(1),
    z: +pos.z.toFixed(1),
  };
}

// ============================================================
//  VIEWER (опциональный)
// ============================================================
async function tryStartViewer(bot: any, index: number): Promise<void> {
  if (!ENABLE_VIEWER) return;
  if (viewerStarted[index]) return;

  try {
    const mod = await import('prismarine-viewer');
    const viewerFn = (mod as any).mineflayer;
    if (typeof viewerFn !== 'function') return;

    const viewerPort = VIEWER_BASE_PORT + index;
    viewerFn(bot, { port: viewerPort, firstPerson: false, viewDistance: 6 });
    minecraftBots[index].viewerPort = viewerPort;
    viewerStarted[index] = true;
    console.log(`🎥 [${minecraftBots[index].username}] Вьювер: http://127.0.0.1:${viewerPort}`);
    broadcast('MINECRAFT_STATUS_UPDATE', minecraftBots);
  } catch {
    // Опционально — молча
  }
}

// ============================================================
//  ПОДКЛЮЧЕНИЕ
// ============================================================
function connectBot(index: number) {
  const botStatus = minecraftBots[index];
  console.log(`🤖 Запуск подключения для бота №${index + 1}: ${botStatus.username}...`);

  if (liveBots[index]) {
    try { liveBots[index].end(); } catch { /* ignore */ }
  }

  const bot = mineflayer.createBot({
    host: process.env.MC_SERVER_HOST || '127.0.0.1',
    port: parseInt(process.env.MC_SERVER_PORT || '25565'),
    username: botStatus.username,
    version: false as any,
    auth: 'offline'
  });

  liveBots[index] = bot;

  // Кэш имён игроков
  bot.on('playerJoined', (player: any) => {
    if (player?.uuid && player?.username) uuidToName.set(player.uuid, player.username);
  });
  bot.on('playerUpdated', (player: any) => {
    if (player?.uuid && player?.username) uuidToName.set(player.uuid, player.username);
  });

  // Один раз — после первого spawn
  bot.once('spawn', () => {
    for (const uuid of Object.keys(bot.players || {})) {
      const p: any = (bot.players as any)[uuid];
      if (p?.uuid && p?.username) uuidToName.set(p.uuid, p.username);
    }

    const client = (bot as any)._client;
    if (client) {
      client.on('packet', (data: any, meta: any) => {
        if (meta.name !== 'player_chat' && meta.name !== 'disguised_chat') return;
        try {
          const text = data.plainMessage || data.message || '';
          if (!text) return;

          const senderUuid: string | undefined = data.senderUuid || data.sender || undefined;
          const fallbackName: string | undefined = data.name || data.senderName || undefined;
          const sender = resolveSenderName(bot, senderUuid, fallbackName);

          const sec = Math.floor(Date.now() / 1000);
          const dedupKey = `${sender}|${text}|${sec}`;
          if (isDuplicateChat(dedupKey)) return;

          const formattedText = `<${sender}> ${text}`;
          let semanticType: 'chat' | 'mention' = 'chat';
          const mentionRegex = new RegExp(`\\b${botStatus.username}\\b`, 'i');
          if (mentionRegex.test(text) && sender !== botStatus.username) semanticType = 'mention';

          broadcast('MINECRAFT_CHAT_MESSAGE', {
            seenBy: botStatus.id,
            username: sender,
            timestamp: new Date().toLocaleTimeString('ru-RU'),
            text: formattedText,
            semanticType
          });
        } catch { /* ignore */ }
      });
    }

    void tryStartViewer(bot, index);
  });

  // Основной spawn — обновляем статус, позицию, вешаем таймер
  bot.on('spawn', () => {
    console.log(`📡 [${botStatus.username}] Успешно появился в мире!`);
    emitEvent('MINECRAFT', 'success', `${botStatus.username} зашёл на сервер`);
    updateBotAndBroadcast(index, (b) => {
      b.status = 'online';
      b.attempts = 0;
      if (bot.health) {
        b.health = Math.round(bot.health);
        b.food = Math.round(bot.food);
      }
    });

    snapshotPosition(bot, index);
    broadcast('MINECRAFT_STATUS_UPDATE', minecraftBots);

    const posTimer = setInterval(() => {
      if (minecraftBots[index].status !== 'online') return;
      snapshotPosition(bot, index);
      broadcast('MINECRAFT_STATUS_UPDATE', minecraftBots);
    }, 2000);

    bot.once('end', () => clearInterval(posTimer));
  });

  bot.on('move', () => snapshotPosition(bot, index));

  bot.on('health', () => {
    updateBotAndBroadcast(index, (b) => {
      b.health = Math.round(bot.health);
      b.food = Math.round(bot.food);
    });
  });

  bot.on('kicked', (reason: string) => {
    console.log(`❌ [${botStatus.username}] КИКНУТ! Причина:`, reason);
    emitEvent('MINECRAFT', 'warning', `${botStatus.username} кикнут`);
    updateBotAndBroadcast(index, (b) => { b.status = 'kicked'; b.health = 0; });
    attemptReconnect(botStatus, index);
  });

  bot.on('error', (err: any) => {
    console.log(`⚠️ [${botStatus.username}] Ошибка сети:`, err.message);
  });

  bot.on('end', () => {
    console.log(`🔌 [${botStatus.username}] Соединение разорвано.`);
    minecraftBots[index].position = null;

    // Если пользователь сам остановил — не пишем событие об отключении и не реконнектим
    if (minecraftBots[index].status === 'disconnected') {
      console.log(`🛑 [${botStatus.username}] Робот остановлен пользователем. Автореконнект отменён.`);
      return;
    }

    emitEvent('MINECRAFT', 'error', `${botStatus.username} отключился`);

    updateBotAndBroadcast(index, (b) => {
      if (b.status !== 'kicked' && b.status !== 'online') b.status = 'disconnected';
    });
    attemptReconnect(botStatus, index);
  });
}

function attemptReconnect(bot: MinecraftBotStatus, index: number) {
  if (minecraftBots[index].status === 'disconnected') return;
  if (bot.status === 'online') return;

  if (bot.attempts < 10) {
    updateBotAndBroadcast(index, (b) => {
      b.attempts++;
      b.status = 'connecting';
    });
    console.log(`⏳ [${bot.username}] Ждём 5 сек. Попытка реконнекта №${minecraftBots[index].attempts}/10...`);
    emitEvent('MINECRAFT', 'info', `${bot.username} реконнект ${minecraftBots[index].attempts}/10`);

    setTimeout(() => {
      if (minecraftBots[index].status !== 'disconnected') connectBot(index);
    }, 5000);
  } else {
    updateBotAndBroadcast(index, (b) => { b.status = 'disconnected'; });
    console.log(`❌ [${bot.username}] Превышен лимит переподключений (10/10). Бот остановлен.`);
    emitEvent('MINECRAFT', 'error', `${bot.username}: превышен лимит переподключений`);
  }
}

// ============================================================
//  ПУБЛИЧНЫЙ API
// ============================================================
export function initializeMinecraftBots() {
  console.log('🎮 Запуск трёх Mineflayer ботов с менеджером реконнекта...');
  minecraftBots.forEach((_, index) => {
    setTimeout(() => connectBot(index), index * 5000);
  });
}

export function getMinecraftBotsStatus() { return minecraftBots; }

export function startBot(index: number): boolean {
  if (index < 0 || index >= minecraftBots.length) return false;
  if (minecraftBots[index].status === 'online') return true;
  updateBotAndBroadcast(index, (b) => { b.attempts = 0; });
  emitEvent('MINECRAFT', 'info', `${minecraftBots[index].username}: команда start`);
  connectBot(index);
  return true;
}

export function stopBot(index: number): boolean {
  if (index < 0 || index >= minecraftBots.length) return false;
  console.log(`■ [${minecraftBots[index].username}] Получена команда на остановку.`);
  updateBotAndBroadcast(index, (b) => {
    b.status = 'disconnected';
    b.health = 0;
    b.food = 0;
    b.position = null;
  });
  if (liveBots[index]) {
    try { liveBots[index].end(); } catch { /* ignore */ }
    liveBots[index] = null;
  }
  emitEvent('MINECRAFT', 'info', `${minecraftBots[index].username}: команда stop`);
  return true;
}

export function restartBot(index: number): boolean {
  if (index < 0 || index >= minecraftBots.length) return false;
  emitEvent('MINECRAFT', 'info', `${minecraftBots[index].username}: команда restart`);
  stopBot(index);
  setTimeout(() => startBot(index), 1500);
  return true;
}

export function getGlobalServerConfig() {
  return {
    host: process.env.MC_SERVER_HOST || '127.0.0.1',
    port: parseInt(process.env.MC_SERVER_PORT || '25565', 10)
  };
}

export function updateGlobalServer(host: string, port: number): boolean {
  if (!host || isNaN(port)) return false;
  process.env.MC_SERVER_HOST = host;
  process.env.MC_SERVER_PORT = port.toString();
  return true;
}

export function sendBotMessage(index: number, message: string): boolean {
  if (index < 0 || index >= liveBots.length) return false;
  const botInstance = liveBots[index];
  if (botInstance && minecraftBots[index].status === 'online') {
    botInstance.chat(message);
    return true;
  }
  return false;
}

export function sendRespect(index: number, target: string): boolean {
  if (!target || !target.trim()) return false;
  return sendBotMessage(index, `/respect ${target.trim()}`);
}

export function getBotInventory(index: number): InventoryItem[] | null {
  if (index < 0 || index >= liveBots.length) return null;
  const bot = liveBots[index];
  if (!bot || minecraftBots[index].status !== 'online') return null;

  try {
    const items = bot.inventory?.items() ?? [];
    return items.map((it: any) => ({
      slot: it.slot,
      name: it.name,
      displayName: it.displayName || it.name,
      count: it.count,
    }));
  } catch (e: any) {
    console.error(`⚠️ [inventory] Ошибка чтения инвентаря:`, e.message);
    return null;
  }
}