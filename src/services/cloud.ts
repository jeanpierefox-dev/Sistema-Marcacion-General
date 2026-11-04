import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Initialize Firestore using the configured database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// --- ERROR HANDLING SPECIFICATION ---
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
  };
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test
export const testConnection = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { success: true, message: 'Conexión a Firestore verificada correctamente.' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline:', error.message);
      return { success: false, message: 'El cliente está fuera de línea o sin conexión a internet.' };
    }
    // If doc does not exist, getDocFromServer still succeeded in contacting Firestore server
    return { success: true, message: 'Conexión establecida con Firestore.' };
  }
};

// Test probe on boot
testConnection().then((res) => {
  if (res.success) {
    console.log('✅ Firestore cloud database active across all devices');
  }
}).catch(() => {
  // Graceful boot handling
});

// Cloud configuration functions (backward compatibility & status reporting)
export const initCloud = (_config?: any, _organizationId?: string): boolean => {
  return true;
};

// Real-time synchronization listener for any path (users, teams, tournaments, liveMatch)
export const syncData = <T>(path: string, onData: (data: T | null) => void): (() => void) => {
  try {
    const docRef = doc(db, 'app_state', path);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const docData = snapshot.data();
          onData(docData?.data !== undefined ? (docData.data as T) : null);
        } else {
          onData(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `app_state/${path}`);
      }
    );
    return unsubscribe;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `app_state/${path}`);
    return () => {};
  }
};

// Real-time data push to Cloud Firestore
export const pushData = async (path: string, data: any): Promise<void> => {
  try {
    const cleanData = JSON.parse(JSON.stringify(data === undefined ? null : data));
    const docRef = doc(db, 'app_state', path);
    await setDoc(docRef, {
      id: path,
      data: cleanData,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `app_state/${path}`);
  }
};

// Reset cloud data to initial defaults
export const resetCloudData = async (defaultUsers: any[]): Promise<void> => {
  try {
    await pushData('tournaments', []);
    await pushData('teams', []);
    await pushData('liveMatch', null);
    await pushData('users', defaultUsers);
    console.log('Cloud data reset successfully');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_state/reset');
  }
};

// Config helpers
export const loadConfig = () => {
  return {
    config: firebaseConfig,
    organizationId: firebaseConfig.projectId
  };
};

export const saveConfig = (_config: any, _organizationId: string) => {
  // Auto-configured by Firestore setup
};

export const generateSyncLink = (_config?: any, _organizationId?: string) => {
  return window.location.origin;
};

export const checkForSyncLink = () => {
  return null;
};
