// Persist board state in localStorage
// State shape: { items: [{type,id,num?}], tierLabels, targets, playerEdits }

const KEY = 'dynasty_big_board_2026';

export function loadBoardState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Migrate old format {order,tiers} to new {items} format
export function migrateState(old, prospects) {
  if (old.items) return old; // already new format
  if (!old.order) return null;

  // Old format: order is player IDs, tiers is {id: tierNum}
  const items = [];
  let lastTier = null;
  let divCounter = 1;

  for (const id of old.order) {
    const tierNum = (old.tiers || {})[id] ?? 1;
    if (tierNum !== lastTier) {
      if (lastTier !== null) {
        items.push({ type: 'tier', id: `div-${divCounter++}`, num: tierNum });
      }
      lastTier = tierNum;
    }
    items.push({ type: 'player', id });
  }

  return {
    items,
    tierLabels: old.tierLabels || {},
    targets: old.targets || [],
    playerEdits: old.playerEdits || {},
  };
}

export function saveBoardState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save board state:', e);
  }
}

export function exportBoardState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `big_board_2026_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBoardState(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(JSON.parse(e.target.result)); }
      catch { reject(new Error('Invalid JSON file')); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
