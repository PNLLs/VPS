interface MinecraftBotStatus {
  id: string;
  username: string;       
  targetServer: string;   
  status: 'connecting' | 'online' | 'disconnected' | 'kicked';
  health: number;         
  food: number;           
  blocksMined: number;    
}

const minecraftBots: MinecraftBotStatus[] = [
  { id: 'mc_bot_1', username: 'MinerPro_1', targetServer: 'play.hypixel.net', status: 'disconnected', health: 20, food: 20, blocksMined: 0 },
  { id: 'mc_bot_2', username: 'WoodCutter_2', targetServer: 'play.hypixel.net', status: 'disconnected', health: 20, food: 20, blocksMined: 0 },
  { id: 'mc_bot_3', username: 'AfkFarm_3', targetServer: 'anarchy.server.ru', status: 'disconnected', health: 20, food: 20, blocksMined: 0 },
];

export function initializeMinecraftBots() {
  console.log('🎮 Подключение Mineflayer ботов к серверам...');
  
  setTimeout(() => {
    minecraftBots[0].status = 'online';
    minecraftBots[0].health = 20;
    minecraftBots[0].blocksMined = 148;

    minecraftBots[1].status = 'online';
    minecraftBots[1].health = 14; 
    minecraftBots[1].food = 18;
    minecraftBots[1].blocksMined = 89;

    minecraftBots[2].status = 'kicked';
    minecraftBots[2].health = 0;
    
    console.log('✅ Статусы игровых Mineflayer ботов обновлены!');
  }, 2500);
}

export function getMinecraftBotsStatus() {
  return minecraftBots;
}
