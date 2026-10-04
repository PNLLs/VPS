import { getMinecraftBotsStatus } from '../minecraft/mcManager.js';
import { discordManager } from '../discord/dsManager.js';
import { getHotMCStats } from '../hotmc/hotmcManager.js';
import { isModuleEnabled } from '../modules/module-state.js';

export type HealthState = 'healthy' | 'degraded' | 'offline' | 'disabled';

export interface ModuleHealth {
  name: string;
  state: HealthState;
  summary: string;
}

export function collectServiceHealth(): ModuleHealth[] {
  const result: ModuleHealth[] = [];

  // Web API — всегда healthy, раз отвечает
  result.push({
    name: 'Web API',
    state: 'healthy',
    summary: 'OK',
  });

  // PM2 — заглушка до переноса
  result.push({
    name: 'PM2',
    state: 'disabled',
    summary: 'Нет на этой платформе',
  });

  // Minecraft
  {
    const enabled = isModuleEnabled('minecraft');
    if (!enabled) {
      result.push({ name: 'Minecraft', state: 'disabled', summary: 'Отключён' });
    } else {
      const bots = getMinecraftBotsStatus();
      const online = bots.filter(b => b.status === 'online').length;
      result.push({
        name: 'Minecraft',
        state: online === 0 ? 'offline' : online < bots.length ? 'degraded' : 'healthy',
        summary: `${online}/${bots.length} онлайн`,
      });
    }
  }

  // Discord
  {
    const enabled = isModuleEnabled('discord');
    if (!enabled) {
      result.push({ name: 'Discord', state: 'disabled', summary: 'Отключён' });
    } else {
      const bots = discordManager.getLiveDiscordStats();
      const inVoice = bots.filter(b => b.status === 'in_voice').length;
      result.push({
        name: 'Discord',
        state: inVoice === 0 ? 'offline' : inVoice < bots.length ? 'degraded' : 'healthy',
        summary: `${inVoice}/${bots.length} в войсе`,
      });
    }
  }

  // HotMC
  {
    const enabled = isModuleEnabled('hotmc');
    if (!enabled) {
      result.push({ name: 'HotMC', state: 'disabled', summary: 'Отключён' });
    } else {
      const stats = getHotMCStats();
      const voting = stats.accounts.filter(a => a.status === 'voting').length;
      const failed = stats.accounts.filter(a => a.status === 'failed').length;
      result.push({
        name: 'HotMC',
        state: failed > 0 ? 'degraded' : 'healthy',
        summary: voting > 0 ? `Голосует: ${voting}` : 'OK',
      });
    }
  }

  return result;
}