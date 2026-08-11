import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Same Firebase Realtime Database used by all three apps
// (Operator Terminal, Manager Dashboard, Admin Portal)
const firebaseConfig = {
  apiKey: "AIzaSyBUKx8KLmsgXyekDSPyga-DCupOr2e_bSg",
  authDomain: "hourly-users-57fe1.firebaseapp.com",
  databaseURL: "https://hourly-users-57fe1-default-rtdb.firebaseio.com",
  projectId: "hourly-users-57fe1",
  storageBucket: "hourly-users-57fe1.firebasestorage.app",
  messagingSenderId: "538548762721",
  appId: "1:538548762721:web:303256450853d0d7bbd220"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
