import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export {
  app,
  auth,
  db,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
};
