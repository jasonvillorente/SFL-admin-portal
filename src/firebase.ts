import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Dynamically check if the administrator has applied a custom Database Link in local storage
const PORTAL_DEFAULT_CONFIG = {
  projectId: "saferouteapp-admin",
  appId: "1:595516297133:web:3c906b89bd27dfa88b5b24",
  apiKey: "AIzaSyBD-81VMnB-ba8EIi8PPBVG7r6exXUIbF0",
  authDomain: "saferouteapp-admin.firebaseapp.com",
  firestoreDatabaseId: "",
  storageBucket: "saferouteapp-admin.firebasestorage.app",
  messagingSenderId: "595516297133",
  measurementId: ""
};

let activeConfig = firebaseConfig;
const forceDefault = typeof window !== 'undefined' ? localStorage.getItem('force_default_sandbox') === 'true' : false;
const savedOverride = typeof window !== 'undefined' ? localStorage.getItem('custom_firebase_config') : null;

if (forceDefault) {
  activeConfig = PORTAL_DEFAULT_CONFIG;
} else if (savedOverride) {
  try {
    const parsed = JSON.parse(savedOverride);
    if (parsed && typeof parsed === 'object' && parsed.projectId) {
      activeConfig = { ...firebaseConfig, ...parsed };
    }
  } catch (err) {
    console.warn("Failed to apply the custom firestore override, resorting to system blueprint config", err);
  }
}

const app = initializeApp(activeConfig);
export const db = getFirestore(app, activeConfig.firestoreDatabaseId || undefined); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

export async function promoteOperatorToAdmin(profile: {
  uid: string;
  name: string;
  email: string;
  createdAt?: string;
}): Promise<void> {
  const payload = {
    uid: profile.uid,
    name: (profile.name || 'Authorized Administrator').slice(0, 120),
    email: (profile.email || '').slice(0, 150),
    role: 'admin',
    active: true,
    createdAt: profile.createdAt || new Date().toLocaleDateString()
  };

  await setDoc(doc(db, 'users', profile.uid), payload, { merge: true });
}

const DELETED_IDS_STORAGE_KEY = 'saferoute_deleted_ids_v1';

export function getLocallyDeletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function markLocallyDeleted(ids: string | string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocallyDeletedIds();
    const list = Array.isArray(ids) ? ids : [ids];
    list.forEach(id => {
      if (id) current.add(id);
    });
    localStorage.setItem(DELETED_IDS_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // Ignore storage quota errors
  }
}

export function isRecordDeleted(id: string, data?: any): boolean {
  if (!id) return false;
  if (data && (data.deleted === true || data.isDeleted === true || data.status === 'deleted')) {
    return true;
  }
  return getLocallyDeletedIds().has(id);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}
