import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const OWNER_EMAIL = 'mtozimek@gmail.com';

let _currentUid = null;
let _currentEmail = null;

export function setCurrentUser(uid, email) {
  _currentUid = uid;
  _currentEmail = email;
}

function boardDoc(uid) {
  return doc(db, 'boards', uid);
}

export async function loadCloudState() {
  if (!_currentUid) return null;
  try {
    const snap = await getDoc(boardDoc(_currentUid));
    if (snap.exists()) return snap.data();

    // Migration: only for the owner — copy boards/main to their personal doc
    if (_currentEmail === OWNER_EMAIL) {
      const oldSnap = await getDoc(doc(db, 'boards', 'main'));
      if (oldSnap.exists()) {
        const data = oldSnap.data();
        await setDoc(boardDoc(_currentUid), data);
        return data;
      }
    }

    return null; // all other users start with default board
  } catch (e) {
    console.warn('Cloud load failed (offline?):', e);
    return null;
  }
}

let _saveTimer = null;
export function saveCloudState(state) {
  if (!_currentUid) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await setDoc(boardDoc(_currentUid), state);
    } catch (e) {
      console.warn('Cloud save failed:', e);
    }
  }, 2000);
}
