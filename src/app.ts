import express from 'express';
import { getSystemStats } from './system/systemInfo.js';
import { getDiscordBotsStatus } from './discord/botManager.js';
import { getMinecraftBotsStatus } from './minecraft/mcManager.js'; // ← Добавили импорт

const app = express();

app.use(express.json());

// API Маршруты
app.get('/api/system', (req, res) => {
  res.json(getSystemStats());
});

app.get('/api/discord', (req, res) => {
  res.json(getDiscordBotsStatus());
});

// Новый роут для Mineflayer ботов
app.get('/api/minecraft', (req, res) => {
  res.json(getMinecraftBotsStatus());
});

app.use(express.static('public'));

export default app;
