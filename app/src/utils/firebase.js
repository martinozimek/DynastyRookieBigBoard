import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAdn7vakAEK0wITMsakUZbf8my0ljRevTU",
  authDomain: "dynasty-big-board.firebaseapp.com",
  projectId: "dynasty-big-board",
  storageBucket: "dynasty-big-board.firebasestorage.app",
  messagingSenderId: "916933275044",
  appId: "1:916933275044:web:83c75943ed0b71c31de531",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithRedirect(auth, provider);
}

export async function handleRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.warn('Auth redirect error:', e.code, e.message);
  }
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
