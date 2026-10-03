import mineflayer from 'mineflayer';
import 'dotenv/config';

interface MinecraftBotStatus {
  id: string;
  username: string;       
  targetServer: string;   
  status: 'connecting' | 'online' | 'disconnected' | 'kicked';
  health: number;         
  food: number;           
  blocksMined: number;    
  attempts: number; // Счётчик последовательных неудачных попыток
}

const serverAddress = `${process.env.MC_SERVER_HOST || 'localhost'}:${process.env.MC_SERVER_PORT || '25565'}`;

const minecraftBots: MinecraftBotStatus[] = [
  { id: 'mc_bot_1', username: process.env.MC_BOT_1_USERNAME || 'pnalls', targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0 },
  { id: 'mc_bot_2', username: process.env.MC_BOT_2_USERNAME || 'pnalls_twinone', targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0 },
  { id: 'mc_bot_3', username: process.env.MC_BOT_3_USERNAME || 'pnalls_twintwo', targetServer: serverAddress, status: 'disconnected', health: 20, food: 20, blocksMined: 0, attempts: 0 },
];

const liveBots: any[] = [null, null, null];

// Функция подключения одного бота по индексу
function connectBot(index: number) {
  const bot = minecraftBots[index];
  console.log(`🤖 Запуск подключения для бота №${index + 1}: ${bot.username}...`);

  if (liveBots[index]) {
    try { liveBots[index].end(); } catch (e) {}
  }

  liveBots[index] = mineflayer.createBot({
    host: process.env.MC_SERVER_HOST || 'localhost',
    port: parseInt(process.env.MC_SERVER_PORT || '25565'),
    username: bot.username,
    version: false,
    auth: 'offline'
  });

  // 1. Успешный спавн (Бот вошел в игру)
  liveBots[index].on('spawn', () => {
    console.log(`📡 [${bot.username}] Успешно появился в мире!`);
    bot.status = 'online';
    bot.attempts = 0; // Успешный вход сбрасывает счётчик в 0
    
    if (liveBots[index].health) {
      bot.health = Math.round(liveBots[index].health);
      bot.food = Math.round(liveBots[index].food);
    }
  });

  // 2. Обновление здоровья
  liveBots[index].on('health', () => {
    bot.health = Math.round(liveBots[index].health);
    bot.food = Math.round(liveBots[index].food);
  });

  // 3. Бот кикнут
  liveBots[index].on('kicked', (reason: string) => {
    console.log(`❌ [${bot.username}] КИКНУТ с сервера! Причина:`, reason);
    bot.status = 'kicked';
    bot.health = 0;
    attemptReconnect(bot, index);
  });

  // 4. Ошибка сети (ECONNREFUSED)
  liveBots[index].on('error', (err: any) => {
    console.log(`⚠️ [${bot.username}] Ошибка сети:`, err.message);
  });

  // 5. Соединение полностью закрылось
  liveBots[index].on('end', () => {
    console.log(`🔌 [${bot.username}] Соединение разорвано.`);
    if (bot.status !== 'kicked' && bot.status !== 'online') {
      bot.status = 'disconnected';
    }
    attemptReconnect(bot, index);
  });
}

// Логика автопереподключения с лимитом в 10 попыток
function attemptReconnect(bot: MinecraftBotStatus, index: number) {
  if (bot.status === 'online') return;

  if (bot.attempts < 10) {
    bot.attempts++;
    bot.status = 'connecting';
    console.log(`⏳ [${bot.username}] Ждем 5 сек. Попытка реконнекта №${bot.attempts}/10...`);
    
    setTimeout(() => {
      connectBot(index);
    }, 5000);
  } else {
    bot.status = 'disconnected';
    console.log(`❌ [${bot.username}] Превышен лимит переподключений (10/10). Бот остановлен.`);
  }
}

export function initializeMinecraftBots() {
  console.log('🎮 [Этап 3] Запуск трёх Mineflayer ботов с менеджером реконнекта...!!!');
  minecraftBots.forEach((_, index) => {
    connectBot(index);
  });
}

export function getMinecraftBotsStatus() {
  return minecraftBots;
} 
