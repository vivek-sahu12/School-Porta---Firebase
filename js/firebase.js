import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  browserLocalPersistence,
  setPersistence
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment
} from "firebase/firestore";

// Firebase web app configuration
const firebaseConfig = {
  apiKey: "AIzaSyAQHZaufTvr0M4KdIX1D8RFT4DKDTbl60k",
  authDomain: "school-data-portal-firebase.firebaseapp.com",
  projectId: "school-data-portal-firebase",
  storageBucket: "school-data-portal-firebase.firebasestorage.app",
  messagingSenderId: "996757871332",
  appId: "1:996757871332:web:372f87136d39e2b8e2eaf1",
  measurementId: "G-NR75D6CDF7"
};

// Initialize Firebase App strictly once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Explicitly set browserLocalPersistence to guarantee session persistence across page reloads
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Could not set persistence to browserLocalPersistence:", err);
});

export {
  app,
  auth,
  db,
  // Auth
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  browserLocalPersistence,
  setPersistence,
  // Firestore
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment
};
