import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDydDv5KTYv06wREBwnsHN7xWG0tt7N8ro",
  authDomain: "check-in-out-system.firebaseapp.com",
  projectId: "check-in-out-system",
  storageBucket: "check-in-out-system.firebasestorage.app",
  messagingSenderId: "1021183325085",
  appId: "1:1021183325085:web:1f876d58a496f879407574"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);