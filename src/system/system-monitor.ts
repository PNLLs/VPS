import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

let lastCpuInfo = os.cpus().map(c => c.times);
let lastCpuSample = Date.now();

function sampleCpuPercent(): number {
  const cpus = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  cpus.forEach((cpu, i) => {
    const prev = lastCpuInfo[i];
    const curr = cpu.times;

    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    totalDiff += currTotal - prevTotal;
    idleDiff += curr.idle - prev.idle;
  });

  lastCpuInfo = cpus.map(c => c.times);
  lastCpuSample = Date.now();

  if (totalDiff === 0) return 0;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

function bytesToGb(b: number): number {
  return Math.round((b / 1024 / 1024 / 1024) * 10) / 10;
}

function diskStats(p: string): { total: number; free: number; used: number } | null {
  try {
    const stat = fs.statfsSync(p);
    const total = stat.blocks * stat.bsize;
    const free = stat.bfree * stat.bsize;
    return {
      total: bytesToGb(total),
      free: bytesToGb(free),
      used: bytesToGb(total - free),
    };
  } catch {
    return null;
  }
}

let cachedExternalIp: string | null = null;
let lastIpFetch = 0;

function fetchExternalIp(): Promise<string | null> {
  const now = Date.now();
  if (cachedExternalIp && now - lastIpFetch < 60_000) {
    return Promise.resolve(cachedExternalIp);
  }
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          cachedExternalIp = parsed.ip || null;
          lastIpFetch = now;
          resolve(cachedExternalIp);
        } catch {
          resolve(cachedExternalIp);
        }
      });
    });
    req.on('error', () => resolve(cachedExternalIp));
    req.on('timeout', () => { req.destroy(); resolve(cachedExternalIp); });
  });
}

function getLocalIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

export interface SystemStats {
  platform: string;
  arch: string;
  hostname: string;
  uptimeSeconds: number;
  uptimeHuman: string;
  cpu: { percent: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; percent: string };
  disk: { total: number; free: number; used: number; percent: string } | null;
  loadAvg: [number, number, number];
  ip: { local: string | null; external: string | null };
}

function humanUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

export async function collectSystemStats(): Promise<SystemStats> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const externalIp = await fetchExternalIp();
  const disk = diskStats(path.resolve());

  const cpuPercent = sampleCpuPercent();
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || 'unknown';

  return {
    platform: os.platform() === 'darwin' ? 'macOS' : os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    uptimeHuman: humanUptime(os.uptime()),
    cpu: {
      percent: cpuPercent,
      cores: cpus.length,
      model: cpuModel,
    },
    memory: {
      total: bytesToGb(totalMem),
      used: bytesToGb(usedMem),
      free: bytesToGb(freeMem),
      percent: Math.round((usedMem / totalMem) * 100) + '%',
    },
    disk: disk
      ? { ...disk, percent: Math.round((disk.used / disk.total) * 100) + '%' }
      : null,
    loadAvg: os.loadavg() as [number, number, number],
    ip: {
      local: getLocalIp(),
      external: externalIp,
    },
  };
}