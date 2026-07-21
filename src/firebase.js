import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBpGYtjhQYM-yvQZ7-0qq-48Olp6ICtpDc",
  authDomain: "lembrete-f9484.firebaseapp.com",
  databaseURL: "https://lembrete-f9484-default-rtdb.firebaseio.com",
  projectId: "lembrete-f9484",
  storageBucket: "lembrete-f9484.firebasestorage.app",
  messagingSenderId: "256819423168",
  appId: "1:256819423168:web:3c56f67649d064afd78a25",
  measurementId: "G-HL3R5DC0KZ"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
