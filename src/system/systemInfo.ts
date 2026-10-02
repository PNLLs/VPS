import os from 'node:os';

// Функция, которая собирает данные о системе
export function getSystemStats() {
  const totalMemory = os.totalmem(); // Всего памяти в байтах
  const freeMemory = os.freemem();   // Свободно памяти в байтах
  const uptime = os.uptime();         // Время работы системы в секундах

  // Переводим байты в мегабайты (МБ), чтобы цифры были понятными человеку
  const totalMemMB = Math.round(totalMemory / 1024 / 1024);
  const freeMemMB = Math.round(freeMemory / 1024 / 1024);
  const usedMemMB = totalMemMB - freeMemMB;

  // Считаем процент занятой памяти
  const memoryUsagePercent = Math.round((usedMemMB / totalMemMB) * 100);

  // Возвращаем красивый объект с данными
  return {
    platform: os.platform(), // Какая ОС стоит (darwin = Mac, linux = Ubuntu)
    uptimeSeconds: uptime,
    memory: {
      total: `${totalMemMB} MB`,
      free: `${freeMemMB} MB`,
      used: `${usedMemMB} MB`,
      percent: `${memoryUsagePercent}%`
    }
  };
}
