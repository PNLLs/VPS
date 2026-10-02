import http from 'node:http';
import 'dotenv/config'; 
import app from './app.js'; 
import { getSystemStats } from './system/systemInfo.js';
import { initializeDiscordBots } from './discord/botManager.js';
import { initializeMinecraftBots } from './minecraft/mcManager.js'; // ← Добавили импорт

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Express-сервер успешно взлетел на порту ${PORT}!`);
  console.log(`🔗 Проверь здесь: http://localhost:${PORT}`);
  console.log('📊 Текущие метрики системы:', getSystemStats());
  
  initializeDiscordBots();
  initializeMinecraftBots(); // ← Запускаем игровых ботов
});
