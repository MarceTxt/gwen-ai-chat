import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDRABQ0dJ4Jowrqqgd-EAVZKzDY7JRxMtQ",
  authDomain: "gwen-ia-0.firebaseapp.com",
  projectId: "gwen-ia-0",
  storageBucket: "gwen-ia-0.firebasestorage.app",
  messagingSenderId: "940169581576",
  appId: "1:940169581576:web:6fee22532881c16d206dbd"
};

console.log("🔥 Firebase inicializando para projeto:", firebaseConfig.projectId); // 👈 LOG AQUI

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("✅ Firebase configurado com sucesso!"); // 👈 LOG AQUI