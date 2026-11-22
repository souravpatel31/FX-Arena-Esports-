import { getApps, initializeApp, getApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// Embedded default fallback config for serverless environments
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "secret-scanner-g7cvm",
  appId: "1:56083497535:web:8f269f69aaacd941976e8a",
  apiKey: "AIzaSyD6gSWcan_uY6uTmVT4Zia3Nreo8wSnGLs",
  authDomain: "secret-scanner-g7cvm.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-khelgalli-32175121-bdc0-421f-a9a5-1fef78b2a2cb",
  storageBucket: "secret-scanner-g7cvm.firebasestorage.app",
  messagingSenderId: "56083497535"
};

export function getFirebaseAdmin() {
  let firebaseConfig: any = { ...DEFAULT_FIREBASE_CONFIG };

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const fileData = JSON.parse(fs.readFileSync(configPath, "utf8"));
      firebaseConfig = { ...firebaseConfig, ...fileData };
    }
  } catch (e) {
    // Ignore file read error in serverless environments
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = 
    process.env.GOOGLE_CLOUD_PROJECT || 
    process.env.FIREBASE_PROJECT_ID || 
    firebaseConfig.projectId || 
    "secret-scanner-g7cvm";

  const databaseId = 
    process.env.FIRESTORE_DATABASE_ID || 
    firebaseConfig.firestoreDatabaseId || 
    "ai-studio-khelgalli-32175121-bdc0-421f-a9a5-1fef78b2a2cb";

  // Initialize App
  let app: any;
  if (getApps().length === 0) {
    try {
      if (serviceAccountKey) {
        console.log("[Firebase Admin] Initializing with Service Account Key");
        let parsedKey = serviceAccountKey;
        if (typeof serviceAccountKey === "string" && (serviceAccountKey.startsWith("{") || serviceAccountKey.startsWith("["))) {
          parsedKey = JSON.parse(serviceAccountKey);
        }
        app = initializeApp({
          credential: cert(parsedKey),
          projectId: projectId
        });
      } else {
        console.log(`[Firebase Admin] Initializing with Project ID: ${projectId}`);
        app = initializeApp({
          projectId: projectId
        });
      }
    } catch (error: any) {
      console.warn("[Firebase Admin] Init warning, falling back to Project ID only:", error.message);
      try {
        app = initializeApp({ projectId: projectId });
      } catch (e2: any) {
        app = getApps()[0] || null;
      }
    }
  } else {
    app = getApp();
  }

  // Initialize Firestore
  let db: any;
  try {
    db = getFirestore(app, databaseId);
  } catch (err) {
    try {
      db = getFirestore(app);
    } catch (e3) {
      console.error("[Firebase Admin] Firestore init failed:", e3);
    }
  }
  
  return { app, db, databaseId, FieldValue };
}

export default getFirebaseAdmin;
