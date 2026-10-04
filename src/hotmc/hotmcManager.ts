import puppeteer from 'puppeteer';
import { createWorker } from 'tesseract.js';
import { broadcast } from '../websocket/wsServer.js';
import path from 'node:path';
import https from 'node:https';

interface HotMCStatus {
  id: string;
  nickname: string;
  status: 'idle' | 'voting' | 'success' | 'failed' | 'waiting_vpn';
  lastResult: string;
  countdown: string;
  totalVotes: number;
  vpnStatus: 'ON' | 'OFF' | 'ERROR';
  currentIp: string | null;
}

const hotmcAccounts: HotMCStatus[] = [
  { id: 'hotmc_1', nickname: process.env.MC_BOT_1_USERNAME || 'pnalls',         status: 'idle', lastResult: 'Ожидание', countdown: '00:00:00', totalVotes: 0, vpnStatus: 'OFF', currentIp: null },
  { id: 'hotmc_2', nickname: process.env.MC_BOT_2_USERNAME || 'pnalls_twinone', status: 'idle', lastResult: 'Ожидание', countdown: '00:00:00', totalVotes: 0, vpnStatus: 'OFF', currentIp: null },
  { id: 'hotmc_3', nickname: process.env.MC_BOT_3_USERNAME || 'pnalls_twintwo', status: 'idle', lastResult: 'Ожидание', countdown: '00:00:00', totalVotes: 0, vpnStatus: 'OFF', currentIp: null },
];

const cooldownSeconds = Array(3).fill(0);

// ============================================================
//  ГЛОБАЛЬНЫЙ ЛОК ГОЛОСОВАНИЯ + ОЖИДАНИЕ РУЧНОГО ПЕРЕКЛЮЧЕНИЯ VPN
// ============================================================
let votingLocked = false;           // кто-то сейчас голосует
let waitingForVpnSwitch = false;    // пауза между голосованиями
let lastUsedIp: string | null = null;

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ============================================================
//  ОПРЕДЕЛЕНИЕ ТЕКУЩЕГО IP (через api.ipify.org)
// ============================================================
function fetchCurrentIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.ip || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ============================================================
//  ТИКАЮЩИЙ ТАЙМЕР ОБРАТНОГО ОТСЧЁТА
// ============================================================
setInterval(() => {
  let hasUpdates = false;
  hotmcAccounts.forEach((acc, index) => {
    if (acc.status === 'failed') {
      if (acc.countdown !== '00:00:00') {
        acc.countdown = '00:00:00';
        hasUpdates = true;
      }
      return;
    }
    if (cooldownSeconds[index] > 0) {
      cooldownSeconds[index]--;
      acc.countdown = formatTime(cooldownSeconds[index]);
      hasUpdates = true;
      if (cooldownSeconds[index] === 0) {
        acc.status = 'idle';
        acc.lastResult = 'Готов к голосованию';
      }
    }
  });
  if (hasUpdates) {
    broadcast('HOTMC_STATUS_UPDATE', hotmcAccounts);
  }
}, 1000);

export function getHotMCStats() {
  return {
    accounts: hotmcAccounts,
    votingLocked,
    waitingForVpnSwitch,
    lastUsedIp,
  };
}

/** Разрешить следующее голосование после ручного переключения VPN */
export async function resumeAfterVpnSwitch(): Promise<{ ok: boolean; ipChanged: boolean; newIp: string | null }> {
  if (!waitingForVpnSwitch) {
    return { ok: false, ipChanged: false, newIp: null };
  }

  // Пауза, чтобы туннель гарантированно встал после переключения в GUI Sota
  await new Promise((r) => setTimeout(r, 5000));

  const newIp = await fetchCurrentIp();
  const ipChanged = newIp !== null && newIp !== lastUsedIp;

  waitingForVpnSwitch = false;
  lastUsedIp = newIp;

  hotmcAccounts.forEach((acc) => {
    if (acc.status === 'waiting_vpn') {
      acc.status = 'idle';
      acc.lastResult = 'Готов к голосованию';
      acc.vpnStatus = 'ON';
      acc.currentIp = newIp;
    }
  });

  broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());
  return { ok: true, ipChanged, newIp };
}

export async function voteAccount(index: number): Promise<{ ok: boolean; error?: string }> {
  if (index < 0 || index >= hotmcAccounts.length) {
    return { ok: false, error: 'Неверный индекс аккаунта' };
  }

  const acc = hotmcAccounts[index];

  if (votingLocked) {
    return { ok: false, error: 'Уже идёт голосование другим аккаунтом. Дождись его окончания.' };
  }
  if (waitingForVpnSwitch) {
    return { ok: false, error: 'Панель ждёт переключения VPN. Нажми «Продолжить» после смены региона.' };
  }
  if (acc.status === 'voting') {
    return { ok: false, error: 'Этот аккаунт уже голосует' };
  }

  // Захватываем лок ДО старта
  votingLocked = true;

  // Снимаем IP перед голосованием
  const ipBefore = await fetchCurrentIp();
  lastUsedIp = ipBefore;

  acc.status = 'voting';
  acc.lastResult = 'Запуск браузера...';
  acc.vpnStatus = ipBefore ? 'ON' : 'ERROR';
  acc.currentIp = ipBefore;
  broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

  let browser: any;
  let ocrWorker: any;
  let voteSucceeded = false;

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    acc.lastResult = 'Загрузка страницы...';
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    await page.goto('https://hotmc.ru/vote-240885', { waitUntil: 'networkidle2', timeout: 35000 });

    acc.lastResult = 'Ввод никнейма...';
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    const nickSelector = 'input[name="nick"], input[name="username"], form input[type="text"]';
    await page.waitForSelector(nickSelector, { timeout: 10000 });
    await page.click(nickSelector, { clickCount: 3 });
    await page.type(nickSelector, acc.nickname, { delay: 100 });

    acc.lastResult = 'Захват капчи...';
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    const captchaImgSelector = 'form img[src*="captcha"], .captcha img, img[src*="captcha"], img.captcha';
    await page.waitForSelector(captchaImgSelector, { timeout: 10000 });

    const captchaElement = await page.waitForSelector(captchaImgSelector);
    if (!captchaElement) throw new Error('Картинка капчи не найдена на странице');

    await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'center' });
    }, captchaImgSelector);

    await new Promise((r) => setTimeout(r, 500));
    const captchaBuffer = await captchaElement.screenshot();

    acc.lastResult = 'Локальный OCR...';
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    const projectRoot = path.resolve();
    ocrWorker = await createWorker('eng', 1, {
      langPath: projectRoot,
      cacheMethod: 'readOnly',
      errorHandler: (err) => console.error('⚠️ [Tesseract] Ошибка движка:', err)
    });

    await ocrWorker.setParameters({ tessedit_char_whitelist: '0123456789' });

    const nodeBuffer = Buffer.from(captchaBuffer);
    const ocrResult = await ocrWorker.recognize(nodeBuffer);
    const cleanedCode = ocrResult.data.text.replace(/\s+/g, '').trim();

    if (!cleanedCode || cleanedCode.length < 3) {
      throw new Error('Код не распознан OCR (пустая строка/мусор)');
    }

    console.log(`[HotMC] Для ${acc.nickname} успешно распознан код: ${cleanedCode}`);
    acc.lastResult = `Ввод капчи: ${cleanedCode}...`;
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    const captchaInputSelector = 'input[name="captcha"], input[placeholder*="код"], form input[type="text"]:nth-of-type(2)';
    await page.waitForSelector(captchaInputSelector, { timeout: 5000 });
    await page.type(captchaInputSelector, cleanedCode, { delay: 150 });

    acc.lastResult = 'Отправка формы...';
    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());

    const submitBtnSelector = 'form button[type="submit"], form input[type="submit"], .btn-orange, form button';
    await page.click(submitBtnSelector);

    await new Promise((r) => setTimeout(r, 5000));

    const resultText = await page.evaluate(() => document.body.innerText);

    if (resultText.includes('Неверный проверочный код') || resultText.includes('код введен неверно')) {
      throw new Error('Ошибка: неверно распознан проверочный код');
    }
    if (resultText.includes('уже голосовали') || resultText.includes('ограничение')) {
      throw new Error('Голос заблокирован: с этого IP сегодня уже голосовали');
    }

    acc.status = 'success';
    acc.lastResult = 'Голос успешно засчитан!';
    acc.totalVotes++;
    cooldownSeconds[index] = 86400;
    acc.countdown = formatTime(cooldownSeconds[index]);
    voteSucceeded = true;

  } catch (err: any) {
    console.error('❌ [HotMC] Ошибка у ' + acc.nickname + ':', err.message);
    acc.status = 'failed';
    acc.lastResult = err.message;
    acc.vpnStatus = 'ERROR';
    cooldownSeconds[index] = 0;
    acc.countdown = '00:00:00';

  } finally {
    if (ocrWorker && typeof ocrWorker.terminate === 'function') {
      try { await ocrWorker.terminate(); } catch { /* ignore */ }
    }
    if (browser && typeof browser.close === 'function') {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        await browser.close();
        console.log('🤖 [HotMC] Браузер закрыт.');
      } catch { /* ignore */ }
    }

    // Снимаем лок и переводим всех в режим ожидания ручного переключения VPN
    votingLocked = false;

    if (voteSucceeded) {
      waitingForVpnSwitch = true;
      hotmcAccounts.forEach((a) => {
        if (a.status === 'idle' || a.status === 'success') {
          a.status = 'waiting_vpn';
          a.lastResult = 'Смени регион в Sota и нажми «Продолжить»';
        }
      });
    }

    broadcast('HOTMC_STATUS_UPDATE', getHotMCStats());
  }

  return { ok: true };
}