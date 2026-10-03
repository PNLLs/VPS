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
}

const minecraftBots: MinecraftBotStatus[] = [
  { 
    id: 'mc_bot_1', 
    username: process.env.MC_BOT_1_USERNAME || 'pnalls_bot', 
    targetServer: `${process.env.MC_SERVER_HOST || 'localhost'}:${process.env.MC_SERVER_PORT || '25565'}`, 
    status: 'disconnected', 
    health: 20, 
    food: 20, 
    blocksMined: 0 
  },
  { id: 'mc_bot_2', username: 'WoodCutter_2', targetServer: 'play.hypixel.net', status: 'disconnected', health: 20, food: 20, blocksMined: 0 },
  { id: 'mc_bot_3', username: 'AfkFarm_3', targetServer: 'anarchy.server.ru', status: 'disconnected', health: 20, food: 20, blocksMined: 0 },
];

let liveBot1: any = null;

export function initializeMinecraftBots() {
  console.log('🎮 Подключение первого реального Mineflayer бота к серверу...');

  minecraftBots[0].status = 'connecting';

  liveBot1 = mineflayer.createBot({
    host: process.env.MC_SERVER_HOST || 'localhost',
    port: parseInt(process.env.MC_SERVER_PORT || '25565'),
    username: process.env.MC_BOT_1_USERNAME || 'pnalls_bot',
    version: false, 
    auth: 'offline' 
  });

  // ==========================================
  // РЕАЛЬНЫЕ СОБЫТИЯ MINEFLAYER ДЛЯ БОТА №1
  // ==========================================

  // 1. Бот успешно загрузился в игровой мир
  liveBot1.on('spawn', () => {
    console.log(`📡 [${minecraftBots[0].username}] Успешно появился в мире!`);
    minecraftBots[0].status = 'online';
    
    // Считываем стартовые показатели здоровья и голода напрямую из игры
    if (liveBot1.health) {
      minecraftBots[0].health = Math.round(liveBot1.health);
      minecraftBots[0].food = Math.round(liveBot1.food);
    }
  });

  // 2. Бот получил урон, полечился или проголодался
  liveBot1.on('health', () => {
    console.log(`❤️ [${minecraftBots[0].username}] Обновление здоровья: ${liveBot1.health}/20`);
    minecraftBots[0].health = Math.round(liveBot1.health);
    minecraftBots[0].food = Math.round(liveBot1.food);
  });

  // 3. Бота выкинул античит или администратор
  liveBot1.on('kicked', (reason: string) => {
    console.log(`❌ [${minecraftBots[0].username}] КИКНУТ с сервера! Причина:`, reason);
    minecraftBots[0].status = 'kicked';
    minecraftBots[0].health = 0;
  });

  // 4. Произошла критическая ошибка сети (сервер упал или недоступен)
  liveBot1.on('error', (err: any) => {
    console.log(`⚠️ [${minecraftBots[0].username}] Ошибка сети:`, err.message);
    minecraftBots[0].status = 'disconnected';
  });

  // 5. Соединение полностью закрылось
  liveBot1.on('end', () => {
    console.log(`🔌 [${minecraftBots[0].username}] Соединение разорвано.`);
    // Если статус не был изменен событием 'kicked', ставим просто оффлайн
    if (minecraftBots[0].status !== 'kicked') {
      minecraftBots[0].status = 'disconnected';
    }
  });
}

export function getMinecraftBotsStatus() {
  return minecraftBots;
}
