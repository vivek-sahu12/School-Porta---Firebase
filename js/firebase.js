import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
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
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export {
  app,
  auth,
  db,
  storage,
  // Auth
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
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
  increment,
  // Storage
  ref,
  uploadBytes,
  getDownloadURL
};
