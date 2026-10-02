// Описываем, как должен выглядеть статус каждого бота
interface BotStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  ping: number;
}

// Создаем массив с нашими тремя ботами (пока с фейковыми стартовыми данными)
const discordBots: BotStatus[] = [
  { id: 'bot_1', name: 'Основной Модератор', status: 'offline', ping: 0 },
  { id: 'bot_2', name: 'Игровой Статистик', status: 'offline', ping: 0 },
  { id: 'bot_3', name: 'Автоответчик HotMC', status: 'offline', ping: 0 },
];

// Функция, которая имитирует «запуск» ботов для нашей панели
export function initializeDiscordBots() {
  console.log('🤖 Инициализация Discord ботов...');
  
  // «Включаем» ботов через 2 секунды после старта сервера, как будто они подключились к Discord
  setTimeout(() => {
    discordBots[0].status = 'online';
    discordBots[0].ping = 42;
    
    discordBots[1].status = 'online';
    discordBots[1].ping = 15;
    
    discordBots[2].status = 'error'; // Допустим, третий бот упал с ошибкой для теста
    
    console.log('✅ Статусы Discord ботов обновлены!');
  }, 2000);
}

// Функция, которая просто отдает текущие статусы ботов наружу
export function getDiscordBotsStatus() {
  return discordBots;
}
