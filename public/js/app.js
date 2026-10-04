// ============================================================
//  VPS BOT CONTROL CENTER — клиентская логика
// ============================================================

// ---------- Утилиты ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Команды ----------

async function sendBotCommand(botId, action) {
  await fetch(`/api/minecraft/${botId}/${action}`, { method: 'POST' });
}

async function controlDiscord(nickname, action) {
  try {
    await fetch(`/api/discord/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
  } catch (err) { console.error('Discord:', err); }
}

async function sendVoteCommand(botId) {
  try {
    const res = await fetch(`/api/hotmc/${botId}/vote`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data.error || 'Не удалось запустить голосование');
  } catch (err) { console.error('HotMC vote:', err); }
}

async function resumeHotMC() {
  try {
    const res = await fetch('/api/hotmc/resume', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось продолжить');
    if (data.warning) alert(data.warning);
  } catch (err) { console.error('HotMC resume:', err); }
}

async function sendGlobalChat() {
  const botId = document.getElementById('chat-bot-select').value;
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  const res = await fetch(`/api/minecraft/${botId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  if (res.ok) {
    input.value = '';
  } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Не удалось отправить сообщение');
  }
}

async function sendRespect() {
  const target = document.getElementById('respect-target').value.trim();
  if (!target) return alert('Введите никнейм цели');

  const res = await fetch(`/api/minecraft/mc_bot_1/respect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    document.getElementById('respect-target').value = '';
  } else {
    alert(data.error || 'Ошибка');
  }
}

async function openInventory(botId) {
  const res = await fetch(`/api/minecraft/${botId}/inventory`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || 'Не удалось получить инвентарь');

  const modal = document.getElementById('inventory-modal');
  const content = document.getElementById('inventory-content');
  const title = document.getElementById('inventory-title');

  const botName = { mc_bot_1: 'pnalls', mc_bot_2: 'pnalls_twinone', mc_bot_3: 'pnalls_twintwo' }[botId] || botId;
  title.innerText = `Инвентарь: ${botName}`;

  if (!data.items.length) {
    content.innerHTML = '<div class="placeholder">Инвентарь пуст</div>';
  } else {
    content.innerHTML = data.items.map(it => `
      <div class="inventory-slot">
        <img src="https://minecraftitemids.com/item/64/${it.name}.png" alt=""
             style="width:32px;height:32px;image-rendering:pixelated;"
             onerror="this.style.display='none'">
        <div class="inventory-slot__name">${escapeHtml(it.displayName)}</div>
        <div class="inventory-slot__count">×${it.count}</div>
        <div class="inventory-slot__id">slot ${it.slot}</div>
      </div>
    `).join('');
  }
  modal.hidden = false;
}

function closeInventory() {
  document.getElementById('inventory-modal').hidden = true;
}

async function saveServerConfig() {
  const host = document.getElementById('srv-host').value.trim();
  const port = parseInt(document.getElementById('srv-port').value, 10);
  if (!host || isNaN(port)) return alert('Укажите хост и порт');

  const res = await fetch('/api/server', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, port })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) alert(data.error || 'Ошибка сохранения');
  else alert('Адрес сохранён. Перезапустите ботов вручную.');
}

async function onToggleModule(name, enabled) {
  try {
    await fetch(`/api/modules/${name}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: enabled })
    });
  } catch (err) { console.error('toggle module:', err); }
}

// ---------- Рендер: VPS PROPERTIES ----------

function displaySystemStats(d) {
  if (!d) return;

  const cpuVal = document.getElementById('vps-cpu-value');
  const cpuSub = document.getElementById('vps-cpu-sub');
  const ramVal = document.getElementById('vps-ram-value');
  const ramSub = document.getElementById('vps-ram-sub');
  const diskVal = document.getElementById('vps-disk-value');
  const diskSub = document.getElementById('vps-disk-sub');
  const upVal   = document.getElementById('vps-uptime-value');
  const upSub   = document.getElementById('vps-uptime-sub');
  const loadVal = document.getElementById('vps-load-value');
  const ipExt   = document.getElementById('vps-ip-external');
  const ipLoc   = document.getElementById('vps-ip-local');

  if (cpuVal) cpuVal.innerText = (d.cpu?.percent ?? 0) + '%';
  if (cpuSub) cpuSub.innerText = `${d.cpu?.cores ?? '?'} ядер · ${d.arch || ''}`;

  if (ramVal) ramVal.innerText = `${d.memory?.used ?? 0} / ${d.memory?.total ?? 0} GB`;
  if (ramSub) ramSub.innerText = `${d.memory?.percent ?? '0%'}`;

  if (d.disk) {
    if (diskVal) diskVal.innerText = `${d.disk.used} / ${d.disk.total} GB`;
    if (diskSub) diskSub.innerText = `${d.disk.percent}`;
  }

  if (upVal) upVal.innerText = d.uptimeHuman || '—';
  if (upSub) upSub.innerText = d.hostname || '';

  if (loadVal && Array.isArray(d.loadAvg)) {
    loadVal.innerText = d.loadAvg.map(n => n.toFixed(2)).join(' / ');
  }

  if (ipExt) ipExt.innerText = d.ip?.external || '—';
  if (ipLoc) ipLoc.innerText = 'local: ' + (d.ip?.local || '—');
}

function displayModuleHealth(list) {
  const container = document.getElementById('vps-health-list');
  if (!container || !Array.isArray(list)) return;

  container.innerHTML = list.map(m => `
    <span class="health-dot" data-state="${m.state}" title="${escapeHtml(m.summary)}">
      ${escapeHtml(m.name)}
    </span>
  `).join('');
}

// ---------- Рендер: MINECRAFT ----------

function displayMinecraftStats(bots) {
  if (!Array.isArray(bots)) return;
  const list = document.getElementById('minecraft-bot-list');
  if (!list) return;

  list.innerHTML = bots.map(bot => {
    let state = 'offline', label = 'Оффлайн';
    if (bot.status === 'online')     { state = 'online';  label = 'В игре'; }
    if (bot.status === 'connecting') { state = 'error';   label = 'Вход...'; }
    if (bot.status === 'kicked')     { state = 'kicked';  label = 'Кикнут'; }

    const pos = bot.position
      ? `X:${bot.position.x} Y:${bot.position.y} Z:${bot.position.z}`
      : '—';

    const viewerBtn = bot.viewerPort
      ? `<button class="btn-icon" title="3D-вид"
                 onclick="window.open('http://${location.hostname}:${bot.viewerPort}','_blank')">&#9673;</button>`
      : '';

    return `
      <div class="bot-item">
        <div class="bot-item__info">
          <span class="bot-item__name">${escapeHtml(bot.username)}</span>
          <span class="bot-item__meta">&#x2665 ${bot.health} · ⚱ ${bot.food} · ⚑ ${pos}</span>
        </div>
        <div class="bot-item__actions">
          <span class="badge" data-state="${state}">${label}</span>
          <button class="btn-icon" title="Старт"    onclick="sendBotCommand('${bot.id}','start')">&#9654;</button>
          <button class="btn-icon" title="Стоп"     onclick="sendBotCommand('${bot.id}','stop')">&#9632;</button>
          <button class="btn-icon" title="Рестарт"  onclick="sendBotCommand('${bot.id}','restart')">&#8635;</button>
          <button class="btn-icon" title="Инвентарь" onclick="openInventory('${bot.id}')">&#9776;</button>
          ${viewerBtn}
        </div>
      </div>
    `;
  }).join('');
}

// ---------- Рендер: DISCORD ----------

function displayDiscordStats(bots) {
  if (!Array.isArray(bots)) return;
  const list = document.getElementById('discord-bot-list');
  if (!list) return;

  list.innerHTML = bots.map(bot => {
    let state = 'offline', label = 'Оффлайн';
    if (bot.status === 'connecting') { state = 'error';   label = 'Вход...'; }
    if (bot.status === 'online')     { state = 'online';  label = 'В сети'; }
    if (bot.status === 'in_voice')   { state = 'online';  label = `В войсе · ${bot.voiceTime}s`; }

    const nick = { ds_bot_1: 'pnalls', ds_bot_2: 'pnalls_twinone', ds_bot_3: 'pnalls_twintwo' }[bot.id] || 'pnalls';

    return `
      <div class="bot-item">
        <div class="bot-item__info">
          <span class="bot-item__name">${escapeHtml(bot.name)}</span>
          <span class="bot-item__meta">${escapeHtml(bot.channelName || '—')}</span>
        </div>
        <div class="bot-item__actions">
          <span class="badge" data-state="${state}">${label}</span>
          <button class="btn-icon" onclick="controlDiscord('${nick}','start')">&#9654;</button>
          <button class="btn-icon" onclick="controlDiscord('${nick}','stop')">&#8856;</button>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- Рендер: HOT.MC ----------

function displayHotMCStats(payload) {
  const accounts = Array.isArray(payload) ? payload : payload?.accounts;
  const waiting = payload?.waitingForVpnSwitch ?? false;
  const locked  = payload?.votingLocked ?? false;

  if (!Array.isArray(accounts)) return;
  const list = document.getElementById('hotmc-bot-list');
  if (!list) return;

  const resumePanel = document.getElementById('hotmc-resume-panel');
  if (resumePanel) resumePanel.hidden = !waiting;

  list.innerHTML = accounts.map(acc => {
    let state = 'offline', label = 'Оффлайн';
    if (acc.status === 'voting')            { state = 'error';   label = 'Голосует...'; }
    if (acc.status === 'success')           { state = 'online';  label = 'Успех'; }
    if (acc.status === 'failed')            { state = 'kicked';  label = 'Ошибка'; }
    if (acc.status === 'waiting_vpn')       { state = 'kicked';  label = 'Ждёт VPN'; }
    if (acc.status === 'idle')              { state = 'online';  label = 'Готов'; }

    const ip = acc.currentIp ? acc.currentIp : '—';
    const disabled = locked || waiting || acc.status === 'voting';

    return `
      <div class="bot-item">
        <div class="bot-item__info">
          <span class="bot-item__name">${escapeHtml(acc.nickname)}</span>
          <span class="bot-item__meta">IP: ${ip} · Голосов: ${acc.totalVotes}</span>
          <span class="bot-item__meta">${escapeHtml(acc.lastResult || '')}</span>
        </div>
        <div class="bot-item__actions">
          <span class="bot-item__meta">${escapeHtml(acc.countdown || '')}</span>
          <span class="badge" data-state="${state}">${label}</span>
          <button class="btn-icon" ${disabled ? 'disabled' : ''}
                  onclick="sendVoteCommand('${acc.id}')">&#8623;</button>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- Рендер: чат ----------

function appendChatMessage(p) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  if (log.querySelector('.placeholder')) log.innerHTML = '';

  const line = document.createElement('div');
  line.className = 'chat-log__line' + (p.semanticType === 'mention' ? ' chat-log__line--mention' : '');
  line.innerHTML = `
    <span class="chat-log__time">[${escapeHtml(p.timestamp)}]</span>
    <span class="chat-log__sender">${escapeHtml(p.username)}:</span>
    <span class="chat-log__text"> ${escapeHtml(p.text)}</span>
  `;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// ---------- WebSocket ----------

const socket = new WebSocket(`ws://${location.host}`);

socket.onopen = () => {
  console.log('WS connected');
};

socket.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'SYSTEM_STATUS_UPDATE':     displaySystemStats(msg.data); break;
      case 'MODULE_HEALTH_UPDATE':     displayModuleHealth(msg.data); break;
      case 'MINECRAFT_STATUS_UPDATE':  displayMinecraftStats(msg.data); break;
      case 'DISCORD_STATUS_UPDATE':    displayDiscordStats(msg.data); break;
      case 'HOTMC_STATUS_UPDATE':      displayHotMCStats(msg.data); break;
      case 'MINECRAFT_CHAT_MESSAGE':   appendChatMessage(msg.data); break;
      case 'GLOBAL_EVENT':           renderEventLine(msg.data, true); break;
    case 'GLOBAL_EVENTS_HISTORY':  renderEventsHistory(msg.data); break;
    }
  } catch (err) { console.error('WS parse:', err); }
};

socket.onclose = () => console.warn('WS closed');

// ---------- Инициализация ----------

document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendGlobalChat();
    });
  }

  const modal = document.getElementById('inventory-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeInventory();
    });
  }

  fetch('/api/server').then(r => r.json()).then(cfg => {
    if (cfg.host) document.getElementById('srv-host').value = cfg.host;
    if (cfg.port) document.getElementById('srv-port').value = cfg.port;
  }).catch(() => {});

  fetch('/api/modules').then(r => r.json()).then(state => {
    const map = {
      'toggle-minecraft': 'minecraft',
      'toggle-discord':   'discord',
      'toggle-hotmc':     'hotmc'
    };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el && typeof state[key] === 'boolean') {
        el.checked = state[key];
        el.addEventListener('change', () => onToggleModule(key, el.checked));
      }
    });
  }).catch(() => {});
});

// ---------- Рендер: GLOBAL EVENTS ----------

function renderEventLine(evt, prepend = false) {
  const log = document.getElementById('events-log');
  if (!log) return;
  if (log.querySelector('.placeholder')) log.innerHTML = '';

  const line = document.createElement('div');
  line.className = 'events-log__line';
  line.dataset.source = evt.source;
  line.dataset.level = evt.level;
  line.innerHTML = `
    <span class="events-log__time">[${escapeHtml(evt.timestamp)}]</span>
    <span class="events-log__source">${escapeHtml(evt.source)}</span>
    <span class="events-log__msg">${escapeHtml(evt.message)}</span>
  `;

  if (prepend && log.firstChild) {
    log.insertBefore(line, log.firstChild);
  } else {
    log.appendChild(line);
  }
}

function renderEventsHistory(list) {
  const log = document.getElementById('events-log');
  if (!log || !Array.isArray(list)) return;
  log.innerHTML = '';
  list.forEach(evt => renderEventLine(evt, false));
  log.scrollTop = log.scrollHeight;
}

window.sendBotCommand   = sendBotCommand;
window.controlDiscord   = controlDiscord;
window.sendVoteCommand  = sendVoteCommand;
window.resumeHotMC      = resumeHotMC;
window.sendGlobalChat   = sendGlobalChat;
window.sendRespect      = sendRespect;
window.openInventory    = openInventory;
window.closeInventory   = closeInventory;
window.saveServerConfig = saveServerConfig;