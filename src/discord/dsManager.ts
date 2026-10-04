import { Client } from 'discord.js-selfbot-v13';
import { broadcast } from '../websocket/wsServer.js';

interface DiscordBotState {
  id: string;
  name: string;
  status: 'offline' | 'connecting' | 'online' | 'in_voice';
  voiceTime: number;
  channelName: string;
  muted: boolean;
  deafened: boolean;
}

// Тайминги (мс) — вынесены в константы, чтобы не было магии
const GHOST_RESET_DELAY   = 1000; // пауза после сброса «призрачного» статуса
const JOIN_TO_MUTE_DELAY  = 1200; // пауза между входом и первым апдейтом мьюта
const MUTE_RETRY_DELAY    = 1200; // пауза между повторными попытками мьюта
const MUTE_MAX_ATTEMPTS   = 4;    // сколько раз пытаться подтвердить мьют

export class DiscordManager {
  private clients: Map<string, Client> = new Map();
  private states: Map<string, DiscordBotState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.states.set('pnalls',          this.freshState('ds_bot_1', 'pnalls'));
    this.states.set('pnalls_twinone',  this.freshState('ds_bot_2', 'pnalls_twinone'));
    this.states.set('pnalls_twintwo',  this.freshState('ds_bot_3', 'pnalls_twintwo'));
  }

  private freshState(id: string, name: string): DiscordBotState {
    return { id, name, status: 'offline', voiceTime: 0, channelName: '', muted: false, deafened: false };
  }

  private resolveToken(nickname: string): string | undefined {
    switch (nickname) {
      case 'pnalls_twinone': return process.env.DISCORD_TOKEN_2;
      case 'pnalls_twintwo':  return process.env.DISCORD_TOKEN_3;
      default:                return process.env.DISCORD_TOKEN_1;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Единая точка отправки VOICE_STATE_UPDATE. */
  private sendVoiceState(client: Client, d: Record<string, unknown>): void {
    try {
      (client as any).ws?.broadcast({ op: 4, d });
    } catch (e) {
      console.error('⚠️ [Discord] Ошибка отправки VOICE_STATE_UPDATE:', (e as Error).message);
    }
  }

  public async startAccount(rawNickname: string): Promise<void> {
    const nickname = rawNickname.split(' ')[0].trim();

    if (this.clients.has(nickname)) { this.notify(); return; }

    const token = this.resolveToken(nickname);
    const channelId = process.env.DISCORD_VOICE_CHANNEL_ID;
    if (!token || !channelId) {
      console.warn(`⚠️ [Discord] Нет токена или channelId для ${nickname}`);
      return;
    }

    const state = this.states.get(nickname)!;
    state.status = 'connecting';
    this.notify();

    const client = new Client({} as any);

    // ── Слушаем сырые пакеты, чтобы знать РЕАЛЬНЫЙ статус mute/deafen ──
    client.on('raw', (packet: any) => {
      if (packet?.t !== 'VOICE_STATE_UPDATE') return;
      if (packet?.d?.user_id !== client.user?.id) return;

      const selfMute = !!packet.d.self_mute;
      const selfDeaf = !!packet.d.self_deaf;

      if (selfMute !== state.muted || selfDeaf !== state.deafened) {
        state.muted = selfMute;
        state.deafened = selfDeaf;
        this.notify();
      }
    });

    client.on('ready', async () => {
      console.log(`📡 [Discord] Авторизован: ${client.user?.username}`);
      state.status = 'online';
      this.notify();

      try {
        const channel: any = await client.channels.fetch(channelId);
        if (!channel || (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE')) {
          console.warn(`⚠️ [Discord] ${nickname}: канал не голосовой`);
          return;
        }

        const guildId = channel.guild.id;

        // 1) Сброс «призрачного» войса (если висел с прошлой сессии)
        this.sendVoiceState(client, {
          guild_id: guildId, channel_id: null, self_mute: false, self_deaf: false,
        });
        await this.sleep(GHOST_RESET_DELAY);

        // 2) Вход в канал БЕЗ mute (мьют отдельным пакетом — так надёжнее)
        this.sendVoiceState(client, {
          guild_id: guildId, channel_id: channel.id, self_mute: false, self_deaf: false,
        });
        await this.sleep(JOIN_TO_MUTE_DELAY);

        state.status = 'in_voice';
        state.channelName = channel.name || 'Голосовой';
        this.startVoiceTimer(nickname);
        this.notify();

        console.log(`🔊 [Discord] ${nickname} вошёл в «${state.channelName}»`);

        // 3) Гарантированный mute/deaf — ретраим, пока Discord не подтвердит
        void this.confirmMute(nickname, client, guildId, channel.id, state);
      } catch (err: any) {
        console.error(`❌ [Discord] Сбой шлюза для ${nickname}:`, err.message);
        state.status = 'offline';
        this.notify();
      }
    });

    client.on('error', (err) => {
      console.error(`⚠️ [Discord Error ${nickname}]:`, err.message);
    });

    try {
      await client.login(token);
      this.clients.set(nickname, client);
    } catch {
      state.status = 'offline';
      this.notify();
    }
  }

  /**
   * Отдельная фаза: подтверждаем mute/deafen.
   * Discord пришлёт VOICE_STATE_UPDATE сам — состояние обновится в raw-хендлере выше.
   * Если не подтвердил за N попыток — пишем варнинг.
   */
  private async confirmMute(
    nickname: string,
    client: Client,
    guildId: string,
    channelId: string,
    state: DiscordBotState,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MUTE_MAX_ATTEMPTS; attempt++) {
      if (!this.clients.has(nickname)) return;           // аккаунт выключили
      if (state.muted && state.deafened) {
        console.log(`🔒 [Discord] ${nickname}: mute/deafen подтверждён (попытка ${attempt})`);
        return;
      }

      this.sendVoiceState(client, {
        guild_id: guildId, channel_id: channelId, self_mute: true, self_deaf: true,
      });

      await this.sleep(MUTE_RETRY_DELAY);
    }

    if (!state.muted || !state.deafened) {
      console.warn(`⚠️ [Discord] ${nickname}: Discord так и не подтвердил mute после ${MUTE_MAX_ATTEMPTS} попыток`);
    }
  }

  public stopAccount(rawNickname: string): void {
    const nickname = rawNickname.split(' ')[0].trim();
    const client = this.clients.get(nickname);
    if (!client) return;

    this.stopVoiceTimer(nickname);

    try {
      const channelId = process.env.DISCORD_VOICE_CHANNEL_ID;
      const channel: any = client.channels.cache.get(channelId || '');
      if (channel?.guild) {
        this.sendVoiceState(client, {
          guild_id: channel.guild.id, channel_id: null, self_mute: false, self_deaf: false,
        });
      }
    } catch { /* ignore */ }

    client.destroy();
    this.clients.delete(nickname);

    const state = this.states.get(nickname)!;
    state.status = 'offline';
    state.channelName = '';
    state.muted = false;
    state.deafened = false;
    this.notify();

    console.log(`🔌 [Discord] Сессия ${nickname} закрыта.`);
  }

  private startVoiceTimer(nickname: string): void {
    if (this.timers.has(nickname)) return;
    this.timers.set(nickname, setInterval(() => {
      const state = this.states.get(nickname);
      if (state && state.status === 'in_voice') {
        state.voiceTime++;
        this.notify();
      }
    }, 1000));
  }

  private stopVoiceTimer(nickname: string): void {
    const timer = this.timers.get(nickname);
    if (timer) { clearInterval(timer); this.timers.delete(nickname); }
  }

  private notify(): void {
    broadcast('DISCORD_STATUS_UPDATE', this.getLiveDiscordStats());
  }

  public getLiveDiscordStats(): DiscordBotState[] {
    return Array.from(this.states.values());
  }
}

export const discordManager = new DiscordManager();