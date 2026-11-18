// save.js — localStorage persistence for Coral Bay Heat.
// One save slot: cash, respect, story progress, position and stats.
// The game never blocks on storage: every failure just means "no save".

const SAVE_KEY = 'coral-bay-heat.save.v1';

/** The shape of a fresh save record. */
export function defaultSave() {
  return {
    version: 1,
    cash: 120,
    respect: 0,
    titleIndex: 0,
    missionIndex: 0,
    missionsDone: 0,
    player: { x: 0, y: 0 },
    stats: {
      carsStolen: 0,
      carsSold: 0,
      thugsDown: 0,
      shotsFired: 0,
      timesBusted: 0,
      timesWasted: 0,
      distanceDriven: 0,
    },
  };
}

/** True when a readable save exists. */
export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Read the save, or null when there is none or it is unreadable. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    const base = defaultSave();
    return {
      ...base,
      ...data,
      player: { ...base.player, ...(data.player || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
    };
  } catch {
    return null;
  }
}

/** Write the save; returns true on success. */
export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Erase the save slot. */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable: nothing to erase
  }
}
