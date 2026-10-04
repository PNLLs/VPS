import fs from 'node:fs';
import path from 'node:path';

type ModuleName = 'minecraft' | 'discord' | 'hotmc';

interface ModulesState {
  minecraft: boolean;
  discord: boolean;
  hotmc: boolean;
}

const STATE_FILE = path.resolve('data/modules-state.json');

const defaultState: ModulesState = {
  minecraft: true,
  discord: true,
  hotmc: true,
};

let state: ModulesState = { ...defaultState };

function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadModulesState(): void {
  try {
    ensureDir();
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      state = { ...defaultState, ...parsed };
    } else {
      fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
    }
  } catch (e) {
    console.error('⚠️ [modules] Не удалось загрузить состояние:', e);
    state = { ...defaultState };
  }
}

function persist() {
  try {
    ensureDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('⚠️ [modules] Не удалось сохранить состояние:', e);
  }
}

export function isModuleEnabled(name: ModuleName): boolean {
  return state[name] === true;
}

export function toggleModule(name: ModuleName, value?: boolean): boolean {
  if (!(name in state)) return false;
  const next = value === undefined ? !state[name] : value;
  state[name] = next;
  persist();
  return next;
}

export function getModulesState(): ModulesState {
  return { ...state };
}