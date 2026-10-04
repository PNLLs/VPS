import { getHotMCStats } from './hotmc/hotmcManager.js';
import http from 'node:http';
import 'dotenv/config';
import app from './app.js';
import { discordManager } from './discord/dsManager.js';
import { initializeMinecraftBots, getMinecraftBotsStatus } from './minecraft/mcManager.js';
import { initializeWebSocket, broadcast } from './websocket/wsServer.js';
import { collectSystemStats } from './system/system-monitor.js';
import { collectServiceHealth } from './system/service-health.js';
import { loadModulesState, isModuleEnabled } from './modules/module-state.js';
import { emitEvent } from './events/event-bus.js';

const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Сброс старых интервалов при перезапуске nodemon (защита от задвоения)
if ((global as any).mainStatsInterval) {
  clearInterval((global as any).mainStatsInterval);
}

server.listen(PORT, '127.0.0.1', async () => {
  console.log('🚀 Express-сервер успешно взлетел на порту ' + PORT + '!');
  console.log('🔗 Проверь здесь: http://127.0.0.1:' + PORT);

  // Загружаем состояние отключённых модулей ДО автозапуска
  loadModulesState();

  initializeWebSocket(server);

  // Minecraft — только если не отключён пользователем
  if (isModuleEnabled('minecraft')) {
  initializeMinecraftBots();
  emitEvent('SYSTEM', 'info', 'Minecraft-модуль: автозапуск');
} else {
  emitEvent('SYSTEM', 'warning', 'Minecraft-модуль отключён пользователем');
}

if (isModuleEnabled('discord')) {
  void discordManager.startAccount('pnalls');
  void discordManager.startAccount('pnalls_twinone');
  void discordManager.startAccount('pnalls_twintwo');
  emitEvent('SYSTEM', 'info', 'Discord-модуль: автозапуск');
} else {
  emitEvent('SYSTEM', 'warning', 'Discord-модуль отключён пользователем');
}

  // Основной цикл трансляции
  (global as any).mainStatsInterval = setInterval(async () => {
    try {
      const systemStats = await collectSystemStats();
      broadcast('SYSTEM_STATUS_UPDATE', systemStats);

      broadcast('MODULE_HEALTH_UPDATE', collectServiceHealth());

      broadcast('DISCORD_STATUS_UPDATE', discordManager.getLiveDiscordStats());
      broadcast('MINECRAFT_STATUS_UPDATE', getMinecraftBotsStatus());
      broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());
    } catch (err) {
      console.error('⚠️ [Error] Сбой циклического обновления статусов:', err);
    }
  }, 2000);
});