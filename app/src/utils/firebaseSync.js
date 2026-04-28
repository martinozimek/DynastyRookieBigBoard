import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const BOARD_DOC = doc(db, 'boards', 'main');

export async function loadCloudState() {
  try {
    const snap = await getDoc(BOARD_DOC);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('Cloud load failed (offline?):', e);
    return null;
  }
}

let _saveTimer = null;
export function saveCloudState(state) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await setDoc(BOARD_DOC, state);
    } catch (e) {
      console.warn('Cloud save failed:', e);
    }
  }, 2000); // 2s debounce — avoids hammering Firestore on rapid drags
}
