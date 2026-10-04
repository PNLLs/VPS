import { getHotMCStats, voteAccount, resumeAfterVpnSwitch } from './hotmc/hotmcManager.js';
import { collectSystemStats } from './system/system-monitor.js';
import { collectServiceHealth } from './system/service-health.js';
import { getModulesState, toggleModule } from './modules/module-state.js';
import express from 'express';
// Импортируем менеджер Дискорда
import { discordManager } from './discord/dsManager.js';
// Объединяем все импорты Майнкрафта в один чистый блок
import {
  getMinecraftBotsStatus,
  startBot,
  stopBot,
  restartBot,
  getGlobalServerConfig,
  updateGlobalServer,
  sendBotMessage,
  getBotInventory,
  sendRespect,
} from './minecraft/mcManager.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

//          API ДЛЯ DISCORD (СЕЛФБОТЫ)

// Роут получения живых статусов Дискорда
app.get('/api/discord', (req, res) => { 
  res.json(discordManager.getLiveDiscordStats()); 
});

// Заставить Дискорд аккаунт зайти в войс
app.post('/api/discord/start', async (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'Укажите никнейм бота' });
  
  await discordManager.startAccount(nickname);
  res.json({ success: true });
});

// Заставить Дискорд аккаунт ЛИВНУТЬ из войса
app.post('/api/discord/stop', (req, res) => {
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: 'Укажите никнейм бота' });
  
  discordManager.stopAccount(nickname);
  res.json({ success: true });
});


// ==========================================
//               API ДЛЯ MINECRAFT
// ==========================================

// Получить статусы всех Майнкрафт ботов
app.get('/api/minecraft', (req, res) => { 
  res.json(getMinecraftBotsStatus()); 
});

// Получить текущие host/port Майнкрафт сервера
app.get('/api/server', (req, res) => {
  res.json(getGlobalServerConfig());
});

// Изменить настройки глобального Майнкрафт сервера
app.post('/api/server', (req, res) => {
  const { host, port } = req.body;
  const success = updateGlobalServer(host, parseInt(port));
  
  if (success) {
    res.json({ success: true, message: 'Настройки сервера изменены' });
  } else {
    res.status(400).json({ success: false, error: 'Неверные параметры хоста или порта' });
  }
});

// Отправка сообщений в чат Minecraft от лица конкретного бота
app.post('/api/minecraft/:botId/chat', (req, res) => {
  const { botId } = req.params;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, error: 'Сообщение не может быть пустым' });
  }

  const bots = getMinecraftBotsStatus();
  const index = bots.findIndex(b => b.id === botId);

  if (index === -1) {
    return res.status(404).json({ success: false, error: `Бот с ID ${botId} не найден` });
  }

  const success = sendBotMessage(index, message);

  if (success) {
    res.json({ success: true, message: 'Сообщение успешно отправлено в чат' });
  } else {
    res.status(400).json({ success: false, error: 'Бот не может отправить сообщение (оффлайн)' });
  }
});

// Снимок инвентаря конкретного бота
app.get('/api/minecraft/:botId/inventory', (req, res) => {
  const { botId } = req.params;
  const bots = getMinecraftBotsStatus();
  const index = bots.findIndex(b => b.id === botId);
  if (index === -1) return res.status(404).json({ success: false, error: 'Бот не найден' });

  const items = getBotInventory(index);
  if (items === null) {
    return res.status(400).json({ success: false, error: 'Бот не в сети' });
  }
  res.json({ success: true, items });
});

// /respect <target> от лица выбранного бота
app.post('/api/minecraft/:botId/respect', (req, res) => {
  const { botId } = req.params;
  const { target } = req.body;

  if (!target || !target.trim()) {
    return res.status(400).json({ success: false, error: 'Укажите никнейм цели' });
  }

  const bots = getMinecraftBotsStatus();
  const index = bots.findIndex(b => b.id === botId);
  if (index === -1) return res.status(404).json({ success: false, error: 'Бот не найден' });

  const ok = sendRespect(index, target);
  if (!ok) return res.status(400).json({ success: false, error: 'Бот не в сети' });
  res.json({ success: true, message: `/respect ${target} отправлен от ${bots[index].username}` });
});

// Управление кнопками Майнкрафт ботов (Старт/Стоп/Рестарт)
app.post('/api/minecraft/:botId/:action', (req, res) => {
  const { botId, action } = req.params;
  const bots = getMinecraftBotsStatus();
  const index = bots.findIndex(b => b.id === botId);

  if (index === -1) {
    return res.status(404).json({ success: false, error: `Бот с ID ${botId} не найден` });
  }

  let success = false;
  if (action === 'start') success = startBot(index);
  else if (action === 'stop') success = stopBot(index);
  else if (action === 'restart') success = restartBot(index);
  else {
    return res.status(400).json({ success: false, error: 'Неверное действие' });
  }

  if (success) {
    res.json({ success: true, message: `Команда ${action} выполнена для ${bots[index].username}` });
  } else {
    res.status(500).json({ success: false, error: 'Не удалось выполнить команду' });
  }
});
// ==========================================
//               API ДЛЯ HotMC
// ==========================================

// Роут получения живых статусов голосования
app.get('/api/hotmc', (req, res) => {
  res.json(getHotMCStats());
});

// Ручной принудительный пинок голосования для конкретного аккаунта
app.post('/api/hotmc/:botId/vote', async (req, res) => {
  const { botId } = req.params;
  const stats = getHotMCStats();
  const index = stats.accounts.findIndex(acc => acc.id === botId);

  if (index === -1) {
    return res.status(404).json({ success: false, error: `Аккаунт с ID ${botId} не найден` });
  }

  const result = await voteAccount(index);

  if (result.ok) {
    res.json({ success: true, message: `Голосование запущено для ${stats.accounts[index].nickname}` });
  } else {
    res.status(409).json({ success: false, error: result.error || 'Не удалось запустить голосование' });
  }
});

// Продолжить после ручного переключения региона в Sota VPN
app.post('/api/hotmc/resume', async (req, res) => {
  const result = await resumeAfterVpnSwitch();
  if (!result.ok) {
    return res.status(400).json({ success: false, error: 'Панель не ждёт переключения VPN' });
  }
  res.json({
    success: true,
    ipChanged: result.ipChanged,
    newIp: result.newIp,
    warning: result.ipChanged ? null : 'IP не изменился — HotMC может отклонить голос',
  });
});

// ==========================================
//               API ДЛЯ SYSTEM
// ==========================================

app.get('/api/system/status', async (req, res) => {
  try {
    const stats = await collectSystemStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/system/health', (req, res) => {
  res.json(collectServiceHealth());
});

app.get('/api/modules', (req, res) => {
  res.json(getModulesState());
});

app.post('/api/modules/:name/toggle', (req, res) => {
  const { name } = req.params;
  const { value } = req.body;
  if (name !== 'minecraft' && name !== 'discord' && name !== 'hotmc') {
    return res.status(400).json({ error: 'Неверное имя модуля' });
  }
  const newValue = toggleModule(name, typeof value === 'boolean' ? value : undefined);
  res.json({ success: true, name, enabled: newValue });
});

app.use(express.static('public'));

export default app;