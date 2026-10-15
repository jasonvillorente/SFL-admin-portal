import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType, 
  promoteOperatorToAdmin, 
  isRecordDeleted, 
  markLocallyDeleted 
} from './firebase';
import { 
  UserAccount, 
  DangerZone, 
  IncidentReport, 
  CommunityAlert, 
  ActivityLog, 
  formatPhoneNumber,
  getResidentName,
  getReportImage,
  getAllReportImages,
  safeString,
  resolveLocationName,
  extractCoordinates,
  isReportConvertedToZone
} from './types';
import { sanitizeFirestorePayload, deduplicateDangerZones } from './utils/zoneUtils';

// Views
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import MapMonitoringView from './components/MapMonitoringView';
import DangerZoneView from './components/DangerZoneView';
import IncidentReportsView from './components/IncidentReportsView';
import CommunityAlertsView from './components/CommunityAlertsView';
import UsersView from './components/UsersView';
import ActivityLogsView from './components/ActivityLogsView';
import SettingsView from './components/SettingsView';
import { Shield, Building, Menu, ServerCrash } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  
  // Auth states
  const [operatorSession, setOperatorSession] = useState<{
    uid: string;
    name: string;
    email: string;
    role: 'admin' | 'resident';
    active: boolean;
  } | null>(null);
  
  const [loginError, setLoginError] = useState<string | null>(null);

  // Firestore collections state
  const [dangerZones, setDangerZones] = useState<DangerZone[]>([]);
  const [incidentReports, setIncidentReports] = useState<IncidentReport[]>([]);
  const [communityAlerts, setCommunityAlerts] = useState<CommunityAlert[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // Firestore sync track logs for direct portal diagnosis
  const [dbSyncStatus, setDbSyncStatus] = useState<Record<string, { success: boolean; count?: number; error?: string }>>({});

  // Selection coordination state across map & lists
  const [selectedMarker, setSelectedMarker] = useState<{ type: 'zone' | 'report'; id: string } | null>(null);

  // Responsive mobile warning drawer or toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefillZone, setPrefillZone] = useState<Partial<DangerZone> | null>(null);

  // 1. Listen for auth changes and synchronize active operator profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        try {
          // Check if uid already has a registered custom profile in /users with offline resilience
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userSnap = null;
          let isOffline = false;
          
          try {
            userSnap = await getDoc(userDocRef);
          } catch (docErr: any) {
            console.warn("Firestore profile fetch failed, checking offline state", docErr);
            if (docErr.message?.includes('offline') || docErr.code === 'unavailable' || !navigator.onLine) {
              isOffline = true;
            } else {
              throw docErr;
            }
          }
          
          const isDeveloper = firebaseUser.email === 'jasonnnnn001@gmail.com';
          let operatorProfile: any = null;
          
          if (userSnap && userSnap.exists()) {
            const snapData = userSnap.data();
            operatorProfile = {
              ...snapData,
              uid: firebaseUser.uid,
              name: snapData.name || firebaseUser.displayName || (isDeveloper ? 'Primary Developer (Jason)' : 'Authorized Admin Representative'),
              email: snapData.email || firebaseUser.email || '',
              role: (isDeveloper || snapData.role === 'admin') ? 'admin' : snapData.role || 'resident',
              active: snapData.active !== undefined ? Boolean(snapData.active) : true
            };
          } else {
            // New user registration
            operatorProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || (isDeveloper ? 'Primary Developer (Jason)' : 'Authorized Admin Representative'),
              email: firebaseUser.email || '',
              role: isDeveloper ? 'admin' : 'resident',
              active: true,
              createdAt: new Date().toLocaleDateString()
            };
          }

          if (!isOffline && operatorProfile.role === 'admin') {
            promoteOperatorToAdmin(operatorProfile).catch(() => {});
          } else if (!isOffline && (!userSnap || !userSnap.exists())) {
            try {
              await setDoc(userDocRef, operatorProfile);
            } catch (setErr) {
              console.warn("Could not write newly registered user document while offline", setErr);
            }
          }
          
          // Verify active status and admin role
          if (!operatorProfile.active) {
            setLoginError('This administrator profile has been flagged and suspended. Contact Makati Civil Systems.');
            await signOut(auth);
            setOperatorSession(null);
          } else if (operatorProfile.role !== 'admin') {
            setLoginError('Access restricted: Signed-in account does not possess administrative privileges in Barangay Palanan.');
            await signOut(auth);
            setOperatorSession(null);
          } else {
            setOperatorSession(operatorProfile);
            setLoginError(null);
            
            // Log login event (swallow any offline write errors inside logActivity)
            await logActivity(
              operatorProfile.name,
              operatorProfile.email,
              'Administrator Portal Login',
              isOffline ? 'Authenticated locally due to offline status.' : 'Authenticated via secure Google Oauth.'
            );
          }
        } catch (err: any) {
          console.error("Auth sync error: ", err);
          const isDeveloper = firebaseUser.email === 'jasonnnnn001@gmail.com';
          setOperatorSession({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || (isDeveloper ? 'Primary Developer (Jason)' : 'Authorized Admin Representative'),
            email: firebaseUser.email || '',
            role: isDeveloper ? 'admin' : 'resident',
            active: true
          });
        } finally {
          setLoading(false);
        }
      } else {
        setOperatorSession(null);
      }
      setAuthReady(true);
    });
    
    return () => unsub();
  }, []);

  // 2. Standard credentials authentication
  const handleLocalLogin = async (email: string, pass: string) => {
    setLoading(true);
    setLoginError(null);

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      setLoginError(err.message || 'Invalid administrator password or username.');
    } finally {
      setLoading(false);
    }
  };

  // Google Sign-In popups
  const handleGoogleLogin = async () => {
    setLoading(true);
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain' || (err.message && err.message.includes('auth/unauthorized-domain'))) {
        const currentDomain = window.location.hostname;
        setLoginError(
          `Unauthorized Domain (${currentDomain}): To enable Google Sign-In on this domain, open Firebase Console > Authentication > Settings > Authorized domains, and add "${currentDomain}".`
        );
      } else {
        setLoginError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (operatorSession) {
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Administrator Portal Logout',
        'Signed out from current active operator console session.'
      );
    }
    await signOut(auth);
    setOperatorSession(null);
    setCurrentView('dashboard');
  };

  // 3. Real-time snapshot synchronized listeners
  useEffect(() => {
    if (!operatorSession) return;

    const safeFormatDate = (val: any, fallbackStr: string = 'N/A'): string => {
      if (val === null || val === undefined) return fallbackStr;
      if (typeof val === 'string') return val;
      // Handle Firestore Timestamp object (has toDate method)
      if (val && typeof val.toDate === 'function') {
        try {
          return val.toDate().toLocaleDateString();
        } catch (e) {
          console.warn("Error converting Firestore Timestamp:", e);
        }
      }
      // Handle timestamp objects with custom structure e.g. { seconds, nanoseconds }
      if (val && typeof val.seconds === 'number') {
        try {
          return new Date(val.seconds * 1000).toLocaleDateString();
        } catch (e) {}
      }
      if (val instanceof Date) {
        return val.toLocaleDateString();
      }
      return String(val);
    };

    const handleSnapshotError = (err: any, path: string) => {
      setDbSyncStatus(prev => ({
        ...prev,
        [path]: { success: false, error: err.message || String(err) }
      }));
      if (err && err.code === 'permission-denied') {
        const criticalPaths = ['users', 'danger_zones', 'incident_reports', 'community_alerts'];
        if (criticalPaths.includes(path)) {
          handleFirestoreError(err, OperationType.GET, path);
        } else {
          console.warn(`Optional auxiliary collection subscription '${path}' denied access (skipping gracefully):`, err);
        }
      } else {
        console.warn(`Firestore snapshot subscription notice for '${path}':`, err);
      }
    };

    // A. Sync Danger Zones from all possible collection aliases
    const dangerZoneCollections = ['danger_zones', 'dangerZones', 'hazards'];
    const zoneSnapshotStates: Record<string, DangerZone[]> = {};
    const zoneUnsubs = dangerZoneCollections.map(colName => {
      return onSnapshot(collection(db, colName), (snapshot) => {
        const colZones: DangerZone[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (isRecordDeleted(doc.id, data)) return;
          const locName = resolveLocationName(data, 'Hazard Area');
          const desc = safeString(data.description || data.details, '');
          const cat = safeString(data.category, 'Crime');
          const rLevel = safeString(data.riskLevel || data.severity, 'Moderate');
          const col = safeString(data.color, 'Orange');
          const img = getReportImage(data);
          const allImgs = getAllReportImages(data);

          // Check if coordinates exist and are valid non-zero numbers
          const rawLat = data.latitude ?? data.lat;
          const rawLng = data.longitude ?? data.lng;
          const hasZeroCoords = Number(rawLat) === 0 && Number(rawLng) === 0;
          const isNeedsLoc = data.needsLocation === true ||
            rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined ||
            hasZeroCoords;

          const finalLat = isNeedsLoc ? undefined : Number(rawLat);
          const finalLng = isNeedsLoc ? undefined : Number(rawLng);

          colZones.push({ 
            id: doc.id, 
            ...data,
            needsLocation: isNeedsLoc,
            latitude: finalLat,
            longitude: finalLng,
            imageUrl: img || data.imageUrl || data.photoUrl,
            photoUrl: img || data.imageUrl || data.photoUrl,
            photos: allImgs.length > 0 ? allImgs : (data.photos || (img ? [img] : [])),
            radius: Number(data.radius) || 100,
            riskLevel: rLevel,
            category: cat,
            color: col,
            locationName: locName,
            description: desc,
            createdAt: data.createdAt ? safeFormatDate(data.createdAt) : undefined
          } as DangerZone);
        });
        zoneSnapshotStates[colName] = colZones;
        setDbSyncStatus(prev => ({
          ...prev,
          [colName]: { success: true, count: colZones.length }
        }));

        // Merge danger zones across snapshots - strictly deduplicated by document ID
        const mergedMap = new Map<string, DangerZone>();
        dangerZoneCollections.forEach(name => {
          (zoneSnapshotStates[name] || []).forEach(item => {
            const existing = mergedMap.get(item.id);
            if (!existing) {
              mergedMap.set(item.id, item);
            } else {
              mergedMap.set(item.id, {
                ...existing,
                ...item,
                imageUrl: item.imageUrl || existing.imageUrl,
                photoUrl: item.photoUrl || existing.photoUrl,
                photos: (item.photos && item.photos.length > 0) ? item.photos : existing.photos
              });
            }
          });
        });
        setDangerZones(deduplicateDangerZones(Array.from(mergedMap.values())));
      }, (error) => {
        handleSnapshotError(error, colName);
      });
    });

    // B. Sync Incident Reports from all possible collection aliases
    const reportCollections = ['incident_reports', 'incidentReports', 'reports', 'incidents', 'hazard_reports'];
    const reportSnapshotStates: Record<string, IncidentReport[]> = {};
    const reportUnsubs = reportCollections.map(colName => {
      return onSnapshot(collection(db, colName), (snapshot) => {
        const colReports: IncidentReport[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (isRecordDeleted(doc.id, data)) return;
          const coords = extractCoordinates(data);
          const locName = resolveLocationName(data, 'Report Location');
          const desc = safeString(data.description || data.details || data.remark, '');
          const cat = safeString(data.category || data.type || data.incidentType, 'Incident');
          const stat = safeString(data.status, 'pending');
          const img = getReportImage(data);
          const allImgs = getAllReportImages(data);
          
          colReports.push({ 
            id: doc.id, 
            ...data,
            imageUrl: img || data.imageUrl || data.photoUrl,
            photoUrl: img || data.imageUrl || data.photoUrl,
            photos: allImgs.length > 0 ? allImgs : (data.photos || (img ? [img] : [])),
            latitude: coords.latitude,
            longitude: coords.longitude,
            locationName: locName,
            category: cat,
            description: desc,
            dateSubmitted: data.dateSubmitted || data.createdAt || data.timestamp ? safeFormatDate(data.dateSubmitted || data.createdAt || data.timestamp) : 'N/A',
            status: stat
          } as IncidentReport);
        });
        reportSnapshotStates[colName] = colReports;
        setDbSyncStatus(prev => ({
          ...prev,
          [colName]: { success: true, count: colReports.length }
        }));

        // Merge incident reports across snapshots
        const mergedMap = new Map<string, IncidentReport>();
        reportCollections.forEach(name => {
          (reportSnapshotStates[name] || []).forEach(item => {
            const existing = mergedMap.get(item.id);
            if (!existing) {
              mergedMap.set(item.id, item);
            } else {
              mergedMap.set(item.id, {
                ...existing,
                ...item,
                imageUrl: item.imageUrl || existing.imageUrl,
                photoUrl: item.photoUrl || existing.photoUrl,
                photos: (item.photos && item.photos.length > 0) ? item.photos : existing.photos
              });
            }
          });
        });
        setIncidentReports(Array.from(mergedMap.values()));
      }, (error) => {
        handleSnapshotError(error, colName);
      });
    });

    // C. Sync Community Alerts
    const unsubAlerts = onSnapshot(collection(db, 'community_alerts'), (snapshot) => {
      const alertsList: CommunityAlert[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (isRecordDeleted(doc.id, data)) return;
        alertsList.push({ 
          id: doc.id, 
          ...data,
          title: safeString(data.title, 'Alert'),
          message: safeString(data.message, ''),
          targetArea: resolveLocationName(data.targetArea || data.locationName || data, 'Barangay Palanan'),
          priorityLevel: safeString(data.priorityLevel, 'medium'),
          alertType: safeString(data.alertType, 'Emergency Notice')
        } as CommunityAlert);
      });
      setCommunityAlerts(alertsList);
      setDbSyncStatus(prev => ({
        ...prev,
        community_alerts: { success: true, count: alertsList.length }
      }));
    }, (error) => {
      handleSnapshotError(error, 'community_alerts');
    });

    // D. Sync Users across all potential user collections in the database for complete mobile app transparency
    const collectionsToListen = ['users', 'residents', 'accounts', 'registeredUsers'];
    const snapshotStates: Record<string, UserAccount[]> = {};

    const userUnsubs = collectionsToListen.map(colName => {
      return onSnapshot(collection(db, colName), (snapshot) => {
        const collectionUsers: UserAccount[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (isRecordDeleted(doc.id, data)) return;
          const rawName = safeString(data.name || data.displayName || data.fullName || data.reporterName || data.reporter, '');
          const phone = safeString(data.phoneNumber || data.phone || data.contactNumber || data.mobile, '');
          const email = safeString(data.email || data.reporterEmail, '');
          
          const rawUserObj = {
            uid: doc.id,
            id: doc.id,
            ...data,
            name: rawName || data.name,
            displayName: data.displayName || rawName,
            fullName: data.fullName || rawName,
            phoneNumber: phone || data.phoneNumber,
            phone: phone || data.phone,
            email: email || data.email,
            role: safeString(data.role, 'resident'),
            active: data.active !== undefined ? Boolean(data.active) : (data.isActive !== undefined ? Boolean(data.isActive) : true),
            createdAt: safeFormatDate(data.createdAt || data.registrationDate, new Date().toLocaleDateString()),
            lastLogin: safeFormatDate(data.lastLogin || data.lastLoginDate, 'N/A'),
            provider: safeString(data.provider || data.authType, phone && !email ? 'phone' : 'email')
          };

          // Resolved name using the exact getResidentName priority
          const resolvedName = getResidentName(rawUserObj);
          
          collectionUsers.push({
            ...rawUserObj,
            name: resolvedName
          } as UserAccount);
        });
        snapshotStates[colName] = collectionUsers;
        setDbSyncStatus(prev => ({
          ...prev,
          [colName]: { success: true, count: collectionUsers.length }
        }));

        // Merge and deduplicate across all active snapshots
        const mergedMap = new Map<string, UserAccount>();
        collectionsToListen.forEach(name => {
          const list = snapshotStates[name] || [];
          list.forEach(usr => {
            const key = usr.uid || (usr.phoneNumber ? `phone:${usr.phoneNumber}` : '') || (usr.email ? `email:${usr.email.toLowerCase()}` : '');
            if (key) {
              const existingUser = mergedMap.get(key);
              if (!existingUser) {
                mergedMap.set(key, usr);
              } else {
                const combined = {
                  ...existingUser,
                  ...usr,
                  displayName: usr.displayName || existingUser.displayName,
                  name: (usr.name && !usr.name.startsWith('Resident (')) ? usr.name : existingUser.name,
                  fullName: usr.fullName || existingUser.fullName,
                  phoneNumber: usr.phoneNumber || existingUser.phoneNumber,
                  phone: usr.phone || existingUser.phone,
                  email: usr.email || existingUser.email,
                  role: (usr.role === 'admin' || existingUser.role === 'admin') ? 'admin' : 'resident'
                };
                combined.name = getResidentName(combined);
                mergedMap.set(key, combined);
              }
            }
          });
        });

        const combinedUsers = Array.from(mergedMap.values());
        setUsers(combinedUsers);
      }, (error) => {
        setDbSyncStatus(prev => ({
          ...prev,
          [colName]: { success: false, error: error.message || String(error) }
        }));
        // Handle common sandbox non-deployed collection exceptions gracefully
        if (error && error.code === 'permission-denied') {
          console.warn(`Firestore read denied for collection: ${colName}. Active once security rules/blueprints are updated.`);
        } else {
          console.warn(`Snapshot subscription trace error for collection '${colName}':`, error);
        }
      });
    });

    const unsubUsers = () => {
      userUnsubs.forEach(unsub => unsub());
    };

    // E. Sync Log Activities
    const unsubLogs = onSnapshot(collection(db, 'activity_logs'), (snapshot) => {
      const logsList: ActivityLog[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        logsList.push({ 
          id: doc.id, 
          ...data,
          adminName: safeString(data.adminName, 'System Admin'),
          adminEmail: safeString(data.adminEmail, ''),
          action: safeString(data.action, 'Action'),
          details: safeString(data.details, '')
        } as ActivityLog);
      });
      // Sort newest logs first
      logsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivityLogs(logsList);
      setDbSyncStatus(prev => ({
        ...prev,
        activity_logs: { success: true, count: logsList.length }
      }));
    }, (error) => {
      handleSnapshotError(error, 'activity_logs');
    });

    return () => {
      zoneUnsubs.forEach(u => u());
      reportUnsubs.forEach(u => u());
      unsubAlerts();
      unsubUsers();
      unsubLogs();
    };
  }, [operatorSession]);

  // 4. Auxiliary functions tracking logs
  const logActivity = async (adminName: string, adminEmail: string, action: string, details: string) => {
    const logPayload = {
      adminName: (adminName || 'System Admin').slice(0, 100),
      adminEmail: (adminEmail || operatorSession?.email || '').slice(0, 150),
      action: (action || 'System Action').slice(0, 300),
      timestamp: new Date().toISOString(),
      details
    };
    try {
      const ref = collection(db, 'activity_logs');
      await addDoc(ref, logPayload);
    } catch (err) {
      console.warn("Audit history log skipped:", err);
    }
  };

  // Helper to delete or soft-delete a document across primary DB and soft-update fallback
  const deleteOrSoftDeleteDoc = async (
    colName: string,
    docId: string,
    softDeletePatch: Record<string, any>
  ): Promise<boolean> => {
    // 1. Try primary db deleteDoc
    try {
      const ref = doc(db, colName, docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await deleteDoc(ref);
        return true;
      }
    } catch (err) {
      console.warn(`Direct deleteDoc failed on ${colName}/${docId}:`, err);
    }

    // 2. Try soft-delete updateDoc on primary db
    try {
      const ref = doc(db, colName, docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, softDeletePatch);
        return true;
      }
    } catch (err) {
      console.warn(`Soft-delete updateDoc failed on ${colName}/${docId}:`, err);
    }

    return false;
  };

  // 5. Database CRUD write executions wrapped in logs
  const markReportAsConverted = async (reportId: string, dangerZoneId: string) => {
    const updateData = {
      status: 'resolved',
      resolved: true,
      convertedToDangerZoneId: dangerZoneId,
      geofenced: true,
      isConvertedToDangerZone: true,
      convertedAt: new Date().toISOString()
    };

    const collectionsToCheck = ['incident_reports', 'reports', 'incidentReports', 'incidents', 'hazard_reports'];
    for (const col of collectionsToCheck) {
      try {
        const ref = doc(db, col, reportId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, updateData);
        }
      } catch (err) {
        console.warn(`Could not update report ${reportId} in ${col}:`, err);
      }
    }

    setIncidentReports(prev => prev.map(r => r.id === reportId ? { ...r, ...updateData } : r));
  };

  const handleAddDangerZone = async (payload: Omit<DangerZone, 'id'>) => {
    if (!operatorSession) return;
    const ref = doc(collection(db, 'danger_zones'));
    const completePayload: DangerZone = sanitizeFirestorePayload({
      ...payload,
      id: ref.id,
      zoneId: ref.id,
      createdBy: operatorSession.email,
      addedBy: operatorSession.email,
      active: payload.status ? payload.status === 'active' : true,
      createdAt: new Date().toISOString()
    });
    try {
      await setDoc(ref, completePayload);
      setDangerZones(prev => {
        const filtered = prev.filter(z => z.id !== ref.id);
        return [completePayload, ...filtered];
      });
    } catch (error: any) {
      console.error("Failed to add danger zone:", error);
      handleFirestoreError(error, OperationType.CREATE, 'danger_zones');
      throw error;
    }

    // Automatically resolve/convert any matching citizen incident reports!
    const matchingReports = incidentReports.filter(rep => {
      if (payload.sourceReportId && (rep.id === payload.sourceReportId || rep.userUid === payload.sourceReportId)) return true;
      if (payload.locationName && rep.locationName && payload.locationName.trim().toLowerCase() === rep.locationName.trim().toLowerCase()) return true;
      if (typeof payload.latitude === 'number' && typeof payload.longitude === 'number' &&
          typeof rep.latitude === 'number' && typeof rep.longitude === 'number' &&
          !isNaN(rep.latitude) && !isNaN(rep.longitude)) {
        const dLat = Math.abs(payload.latitude - rep.latitude);
        const dLng = Math.abs(payload.longitude - rep.longitude);
        if (dLat < 0.00095 && dLng < 0.00095) return true;
      }
      return false;
    });

    for (const match of matchingReports) {
      await markReportAsConverted(match.id, ref.id);
    }

    const crimeCountText = payload.crimeCount !== undefined ? `${payload.crimeCount} crimes` : 'aggregated crimes';
    const activeText = payload.activeTime ? `active: ${payload.activeTime}` : 'all day';

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Danger Zone Added',
      `Registered new danger zone circle marker "${payload.locationName}" (${crimeCountText}, ${activeText})${matchingReports.length > 0 ? ` and resolved ${matchingReports.length} citizen incident report(s)` : ''}.`
    );
  };


  const handleUpdateDangerZone = async (id: string, payload: Partial<DangerZone>) => {
    if (!operatorSession) return;
    const updateData = sanitizeFirestorePayload({
      ...payload,
      id,
      zoneId: id,
    });
    const collectionsToCheck = ['danger_zones', 'dangerZones', 'hazards'];
    let updated = false;

    for (const colName of collectionsToCheck) {
      try {
        const ref = doc(db, colName, id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, updateData);
          updated = true;
        }
      } catch (err: any) {
        console.error(`Update failed on ${colName}/${id}:`, err);
        handleFirestoreError(err, OperationType.UPDATE, colName);
      }
    }

    if (!updated) {
      setDangerZones(prev => prev.map(z => z.id === id ? { ...z, ...updateData } as DangerZone : z));
    }

    if (payload.sourceReportId) {
      await markReportAsConverted(payload.sourceReportId, id);
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Danger Zone Updated',
      `Modified properties of danger zone ID ${id} (${payload.locationName || 'no-name'}).`
    );
  };

  const handleDeleteDangerZone = async (id: string) => {
    if (!operatorSession) return;
    markLocallyDeleted(id);
    setDangerZones(prev => prev.filter(z => z.id !== id));

    const collectionsToCheck = ['danger_zones', 'dangerZones', 'hazards'];
    for (const col of collectionsToCheck) {
      await deleteOrSoftDeleteDoc(col, id, {
        status: 'inactive',
        deleted: true,
        isDeleted: true
      });
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Danger Zone Deleted',
      `Permanently removed hazard zone ID ${id} from Palanan records.`
    );
  };

  const handleBatchImportDangerZones = async (
    toAdd: Omit<DangerZone, 'id'>[],
    toUpdate: { id: string; changes: Partial<DangerZone> }[],
    skippedCount: number,
    batchId?: string,
    importedAt?: string
  ) => {
    if (!operatorSession) throw new Error('Operator session required');

    const effectiveBatchId = batchId || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectiveImportedAt = importedAt || new Date().toISOString();

    let addedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let lastBatchError: { code?: string; message: string } | null = null;
    const failedRows: Array<{ rowName: string; reason: string; code?: string }> = [];

    const newlyAddedZones: DangerZone[] = [];
    const updatedZonesMap = new Map<string, Partial<DangerZone>>();

    // Prepare operations and sanitize every payload to completely strip undefined fields
    const operations: Array<
      | { type: 'set'; ref: any; data: DangerZone; name: string }
      | { type: 'update'; ref: any; data: Partial<DangerZone>; name: string; id: string }
    > = [];

    for (const item of toAdd) {
      const docRef = doc(collection(db, 'danger_zones'));
      const completeZone: DangerZone = sanitizeFirestorePayload({
        ...item,
        id: docRef.id,
        zoneId: docRef.id,
        importBatchId: effectiveBatchId,
        importedAt: effectiveImportedAt,
        createdBy: operatorSession.email,
        addedBy: operatorSession.email,
        active: item.status === 'active',
        createdAt: new Date().toISOString()
      });
      operations.push({
        type: 'set',
        ref: docRef,
        data: completeZone,
        name: completeZone.locationName || 'Unknown Zone'
      });
    }

    for (const item of toUpdate) {
      const docRef = doc(db, 'danger_zones', item.id);
      const changesWithImportMeta = sanitizeFirestorePayload({
        ...item.changes,
        importBatchId: effectiveBatchId,
        importedAt: effectiveImportedAt
      });
      operations.push({
        type: 'update',
        ref: docRef,
        data: changesWithImportMeta,
        name: (item.changes as any).locationName || item.id,
        id: item.id
      });
    }

    // Chunk into at most 500 writes per batch as required by Firestore and user requirements
    const CHUNK_SIZE = 500;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      let batchSucceeded = false;

      // Try batch commit first
      try {
        const batch = writeBatch(db);
        for (const op of chunk) {
          if (op.type === 'set') {
            batch.set(op.ref, op.data);
          } else {
            // Never delete riskLevel or unrelated fields, update only the specified changes
            batch.update(op.ref, op.data);
          }
        }

        await batch.commit();
        batchSucceeded = true;
        for (const op of chunk) {
          if (op.type === 'set') {
            addedCount++;
            newlyAddedZones.push(op.data as DangerZone);
          } else {
            updatedCount++;
            updatedZonesMap.set(op.id, op.data);
          }
        }
      } catch (batchErr: any) {
        const bCode = batchErr?.code || (batchErr?.name || 'batch-write-error');
        const bMsg = batchErr?.message || String(batchErr);
        console.warn(`Firestore batch commit failed [${bCode}]: ${bMsg}. Falling back to row-by-row write...`, batchErr);
        lastBatchError = { code: bCode, message: bMsg };

        // Fallback: write row by row so one bad row doesn't fail the whole file
        for (const op of chunk) {
          try {
            if (op.type === 'set') {
              await setDoc(op.ref, op.data);
              addedCount++;
              newlyAddedZones.push(op.data as DangerZone);
            } else {
              await updateDoc(op.ref, op.data);
              updatedCount++;
              updatedZonesMap.set(op.id, op.data);
            }
          } catch (rowErr: any) {
            failedCount++;
            const rCode = rowErr?.code || (rowErr?.name || 'row-write-error');
            const rMsg = rowErr?.message || String(rowErr);
            console.error(`Row write failed for "${op.name}":`, rowErr);
            failedRows.push({
              rowName: op.name,
              reason: rMsg,
              code: rCode
            });
          }
        }
      }
    }

    // Update React local state immediately for any successfully written rows - strictly deduplicated by ID
    if (newlyAddedZones.length > 0 || updatedZonesMap.size > 0) {
      setDangerZones(prev => {
        const newIds = new Set(newlyAddedZones.map(z => z.id));
        const updatedList = prev
          .filter(z => !newIds.has(z.id))
          .map(z => {
            const changes = updatedZonesMap.get(z.id);
            return changes ? ({ ...z, ...changes } as DangerZone) : z;
          });
        return deduplicateDangerZones([...newlyAddedZones, ...updatedList]);
      });
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'CSV Bulk Danger Zones Imported',
      `Bulk CSV import executed [Batch ID: ${effectiveBatchId}]: added ${addedCount}, updated ${updatedCount}, skipped ${skippedCount}, failed ${failedCount}.`
    );

    return {
      added: addedCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      batchId: effectiveBatchId,
      errorCode: lastBatchError?.code,
      errorMessage: lastBatchError?.message,
      failedRows
    };
  };

  /**
   * Undoes a bulk CSV import: deletes ONLY documents matching the provided importBatchId
   */
  const handleUndoBatchImport = async (batchId: string): Promise<{ deletedCount: number }> => {
    if (!operatorSession) throw new Error('Operator session required');
    if (!batchId) throw new Error('Batch ID is required to undo import');

    // Find matching zones in active state
    const zonesToDelete = dangerZones.filter(z => z.importBatchId === batchId);
    let deletedCount = 0;
    const collectionsToCheck = ['danger_zones', 'dangerZones', 'hazards'];

    for (const zone of zonesToDelete) {
      markLocallyDeleted(zone.id);
      for (const col of collectionsToCheck) {
        try {
          await deleteDoc(doc(db, col, zone.id));
        } catch (delErr) {
          console.warn(`Could not delete ${zone.id} from ${col}:`, delErr);
        }
      }
      deletedCount++;
    }

    // Immediately remove from React local state
    setDangerZones(prev => prev.filter(z => z.importBatchId !== batchId));

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Undo CSV Batch Import',
      `Reverted import batch [Batch ID: ${batchId}]: permanently removed ${deletedCount} danger zone documents.`
    );

    return { deletedCount };
  };


  const updateReportStatusAcrossCollections = async (id: string, status: 'approved' | 'rejected') => {
    const collectionsToCheck = ['incident_reports', 'reports', 'incidentReports', 'incidents', 'hazard_reports'];
    let updated = false;

    for (const col of collectionsToCheck) {
      try {
        const ref = doc(db, col, id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, { status });
          updated = true;
        }
      } catch (err) {
        console.warn(`Update status failed on ${col}/${id}:`, err);
      }
    }

    if (!updated) {
      setIncidentReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    }
  };

  const handleApproveReport = async (id: string) => {
    if (!operatorSession) return;
    await updateReportStatusAcrossCollections(id, 'approved');
    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Incident Report Approved',
      `Officially verified citizen safety warning report ID ${id}.`
    );
  };

  const handleRejectReport = async (id: string) => {
    if (!operatorSession) return;
    await updateReportStatusAcrossCollections(id, 'rejected');
    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Incident Report Rejected',
      `Marked citizen reporting card ID ${id} as unverified/rejected.`
    );
  };

  const handleDeleteReport = async (id: string) => {
    if (!operatorSession) return;
    markLocallyDeleted(id);
    setIncidentReports(prev => prev.filter(r => r.id !== id));

    const collectionsToCheck = ['incident_reports', 'reports', 'incidentReports', 'incidents', 'hazard_reports'];
    for (const col of collectionsToCheck) {
      await deleteOrSoftDeleteDoc(col, id, {
        status: 'rejected',
        deleted: true,
        isDeleted: true
      });
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Incident Report Deleted',
      `Permanently removed incident report record ID ${id}.`
    );
  };

  const handlePurgeTestReports = async (reportIds: string[]) => {
    if (!operatorSession || reportIds.length === 0) return;
    markLocallyDeleted(reportIds);
    const idSet = new Set(reportIds);
    setIncidentReports(prev => prev.filter(r => !idSet.has(r.id)));

    const collectionsToCheck = ['incident_reports', 'reports', 'incidentReports', 'incidents', 'hazard_reports'];
    for (const id of reportIds) {
      for (const col of collectionsToCheck) {
        await deleteOrSoftDeleteDoc(col, id, {
          status: 'rejected',
          deleted: true,
          isDeleted: true
        });
      }
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Incident Reports Purged',
      `Permanently purged ${reportIds.length} test/unverified incident reports from database.`
    );
  };

  const handleDeleteUser = async (uid: string) => {
    if (!operatorSession) return;
    markLocallyDeleted(uid);
    setUsers(prev => prev.filter(u => u.uid !== uid));

    const collectionsToCheck = ['users', 'residents', 'accounts', 'registeredUsers'];
    for (const col of collectionsToCheck) {
      await deleteOrSoftDeleteDoc(col, uid, {
        active: false,
        deleted: true,
        isDeleted: true
      });
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Resident Account Deleted',
      `Permanently removed resident account ID ${uid}.`
    );
  };

  const handlePurgeTestUsers = async (uids: string[]) => {
    if (!operatorSession || uids.length === 0) return;
    markLocallyDeleted(uids);
    const uidSet = new Set(uids);
    setUsers(prev => prev.filter(u => !uidSet.has(u.uid)));

    const collectionsToCheck = ['users', 'residents', 'accounts', 'registeredUsers'];
    for (const uid of uids) {
      for (const col of collectionsToCheck) {
        await deleteOrSoftDeleteDoc(col, uid, {
          active: false,
          deleted: true,
          isDeleted: true
        });
      }
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Test Residents Purged',
      `Permanently purged ${uids.length} test/anonymous resident profiles from database.`
    );
  };

  const handleConvertToDangerZone = (report: IncidentReport) => {
    const img = getReportImage(report);
    setPrefillZone({
      sourceReportId: report.id,
      locationName: report.locationName,
      latitude: report.latitude,
      longitude: report.longitude,
      category: report.category,
      description: report.description,
      imageUrl: img || undefined,
      radius: 150,
      source: 'resident_report',
      activeTime: 'all_day',
      startHour: 0,
      endHour: 24,
      nightCrimeCount: 0,
      dayCrimeCount: 0,
      crimeCount: 0,
      crimeTypes: {}
      // No dataPeriod for resident report conversions
    });
    // Navigate straight to Danger Zones panel with prefilled items
    setCurrentView('danger');
  };

  const handleQuickConvertToDangerZone = async (report: IncidentReport, radius: number = 150) => {
    if (!operatorSession) return;
    const ref = doc(collection(db, 'danger_zones'));
    const img = getReportImage(report);
    const completePayload: DangerZone = sanitizeFirestorePayload({
      id: ref.id,
      zoneId: ref.id,
      sourceReportId: report.id,
      reportId: report.id,
      locationName: report.locationName || 'Incident Hazard Area',
      latitude: Number(report.latitude),
      longitude: Number(report.longitude),
      category: report.category || 'Crime',
      description: report.description || 'Converted from citizen incident report.',
      radius: Number(radius) || 150,
      source: 'resident_report',
      activeTime: 'all_day',
      startHour: 0,
      endHour: 24,
      nightCrimeCount: 0,
      dayCrimeCount: 0,
      crimeCount: 0,
      crimeTypes: {},
      imageUrl: img || undefined,
      photoUrl: img || undefined,
      photos: img ? [img] : [],
      createdAt: new Date().toISOString(),
      createdBy: operatorSession.email,
      addedBy: operatorSession.email,
      status: 'active',
      active: true
    });


    try {
      await setDoc(ref, completePayload);
      setDangerZones(prev => {
        const filtered = prev.filter(z => z.id !== ref.id);
        return [completePayload, ...filtered];
      });
      await markReportAsConverted(report.id, ref.id);
    } catch (error: any) {
      console.error("Failed to convert report to danger zone:", error);
      handleFirestoreError(error, OperationType.CREATE, 'danger_zones');
      throw error;
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Incident Converted to Danger Zone',
      `Converted citizen report "${report.locationName}" to active Danger Zone ID ${ref.id}.`
    );
  };

  const handleSendAlert = async (payload: Omit<CommunityAlert, 'id'>) => {
    if (!operatorSession) return;
    try {
      const ref = collection(db, 'community_alerts');
      await addDoc(ref, payload);
    } catch (error: any) {
      console.error("Failed to send alert:", error);
      handleFirestoreError(error, OperationType.CREATE, 'community_alerts');
      throw error;
    }

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Emergency Alert Broadcasted',
      `Dispatched public safety bulletin warning "${payload.title}" to residents.`
    );
  };

  const handleDeleteAlert = async (id: string) => {
    if (!operatorSession) return;
    markLocallyDeleted(id);
    setCommunityAlerts(prev => prev.filter(a => a.id !== id));

    await deleteOrSoftDeleteDoc('community_alerts', id, {
      deleted: true,
      isDeleted: true
    });

    await logActivity(
      operatorSession.name,
      operatorSession.email,
      'Emergency Alert Retracted',
      `Withdrew public safety announcement bulletin ID ${id} from communities.`
    );
  };

  const handleToggleUserStatus = async (uid: string, currentStatus: boolean) => {
    if (!operatorSession) return;
    const collectionsToUpdate = ['users', 'residents', 'accounts', 'registeredUsers'];
    let updatedAny = false;

    for (const colName of collectionsToUpdate) {
      try {
        const ref = doc(db, colName, uid);
        const docSnap = await getDoc(ref);
        if (docSnap.exists()) {
          await updateDoc(ref, { active: !currentStatus });
          updatedAny = true;
        }
      } catch (err: any) {
        console.error(`Toggle status failed on ${colName}/${uid}:`, err);
        handleFirestoreError(err, OperationType.UPDATE, colName);
      }
    }

    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, active: !currentStatus } : u));

    if (updatedAny) {
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'User Status Modified',
        `Toggled accessibility active status flag of user profile ID ${uid}.`
      );
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.warn("Recoverable password reset email exception: ", error);
    }
  };

  // Select marker helper callback
  const handleSelectMarker = (marker: { type: 'zone' | 'report'; id: string } | null) => {
    setSelectedMarker(marker);
    if (marker) {
      // Auto switch to Full GIS Map view to pinpoint exact context
      setCurrentView('map');
    }
  };

  const handleNavigateToView = (view: string) => {
    setCurrentView(view);
  };

  // Calculate user counts securely
  const getCountsObj = () => {
    const residents = users.filter(x => x.role === 'resident').length;
    const admins = users.filter(x => x.role === 'admin').length;
    return { residents: residents, admins: admins };
  };

  // Render proper child views safely
  const renderMainView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardView
            dangerZones={dangerZones}
            incidentReports={incidentReports}
            communityAlerts={communityAlerts}
            usersCount={getCountsObj()}
            recentLogs={activityLogs}
            onNavigateToView={handleNavigateToView}
          />
        );
      case 'map':
        return (
          <MapMonitoringView
            dangerZones={dangerZones}
            incidentReports={incidentReports}
            users={users}
            selectedMarker={selectedMarker}
            onSelectMarker={setSelectedMarker}
          />
        );
      case 'danger':
        return (
          <DangerZoneView
            dangerZones={dangerZones}
            initialPrefill={prefillZone}
            onClearPrefill={() => setPrefillZone(null)}
            onAddDangerZone={handleAddDangerZone}
            onUpdateDangerZone={handleUpdateDangerZone}
            onDeleteDangerZone={handleDeleteDangerZone}
            onBatchImport={handleBatchImportDangerZones}
            onUndoBatchImport={handleUndoBatchImport}
          />
        );
      case 'reports':
        return (
          <IncidentReportsView
            incidentReports={incidentReports}
            dangerZones={dangerZones}
            users={users}
            onApproveReport={handleApproveReport}
            onRejectReport={handleRejectReport}
            onDeleteReport={handleDeleteReport}
            onPurgeTestReports={handlePurgeTestReports}
            onConvertToDangerZone={handleConvertToDangerZone}
            onQuickConvertToDangerZone={handleQuickConvertToDangerZone}
          />
        );
      case 'alerts':
        return (
          <CommunityAlertsView
            alerts={communityAlerts}
            onSendAlert={handleSendAlert}
            onDeleteAlert={handleDeleteAlert}
          />
        );
      case 'users':
        return (
          <UsersView
            users={users}
            onToggleUserStatus={handleToggleUserStatus}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteUser}
            onPurgeTestUsers={handlePurgeTestUsers}
          />
        );
      case 'logs':
        return <ActivityLogsView logs={activityLogs} />;
      case 'settings':
        return (
          <SettingsView
            dbProjectName={db.app.options.projectId || 'rare-wharf-1s7sz'}
            dbSyncStatus={dbSyncStatus}
          />
        );
      default:
        return (
          <div className="p-8 text-center bg-white border rounded">
            <h3 className="font-bold text-slate-800">Module Temporarily Unavailable</h3>
            <p className="text-xs text-gray-400 mt-1">Section development is ongoing in Barangay Civil Services.</p>
          </div>
        );
    }
  };

  // Loading Splash Screen
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#132844] font-mono text-white flex items-center justify-center p-6 flex-col space-y-4">
        <div className="animate-spin text-yellow-500">
          <Building className="w-12 h-12" />
        </div>
        <div className="text-center">
          <h2 className="text-xs font-bold tracking-wider text-slate-350">BARANGAY PALANAN OPERATIONS CENTER</h2>
          <p className="text-[10px] text-yellow-500 font-medium mt-1">Initializing Secure GIS Telemetry link...</p>
        </div>
      </div>
    );
  }

  // Not signed in -> login screen
  if (!operatorSession) {
    return (
      <Login
        onLogin={handleLocalLogin}
        onGoogleLogin={handleGoogleLogin}
        errorMsg={loginError}
        loading={loading}
      />
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden font-sans" id="safe-route-admin-app">
      
      {/* 1. Left Fixed Sidebar (Desktop only) */}
      <div className="hidden md:block h-full shrink-0">
        <Sidebar
          currentView={currentView}
          onViewChange={handleNavigateToView}
          adminName={operatorSession.name}
          adminEmail={operatorSession.email}
          onLogout={handleLogout}
          counts={{
            pendingReports: incidentReports.filter(r => r.status === 'pending' && !isReportConvertedToZone(r, dangerZones)).length,
            totalReports: incidentReports.filter(r => !isReportConvertedToZone(r, dangerZones)).length,
            activeZones: dangerZones.length,
            totalUsers: users.length
          }}
        />
      </div>

      {/* 2. Main Content & Responsive Header Pane wrapper */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Dynamic header row containing mobile menu button */}
        <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1 rounded md:hidden hover:bg-slate-100 text-[#1E3A5F]"
              title="Toggle Navigation Menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            {/* Title indicator */}
            <div className="flex items-center space-x-2">
              <span className="p-1 rounded bg-[#132844] text-white">
                <Shield className="w-4.5 h-4.5" />
              </span>
              <div>
                <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase font-display hidden sm:inline-block">SafeRoute Lite Admin Portal</h2>
                <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase font-display sm:hidden">Brgy. Palanan Admin</h2>
                <span className="text-[9px] font-mono text-emerald-600 block leading-tight font-bold">SECURE OPERATOR MODULE</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3.5 text-xs text-slate-600 font-medium">
            <span className="text-slate-400 hidden xl:inline">Coordinates Coverage: <strong>Makati City Zone I</strong></span>
            
            {/* Operator info label (Header right) */}
            <div className="bg-slate-100 border border-slate-200 px-3 py-1 rounded-full flex items-center space-x-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-700 font-bold max-w-[120px] truncate">{operatorSession.name}</span>
            </div>
          </div>
        </header>

        {/* 3. Primary Section Render Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-12">
          {renderMainView()}
        </main>
      </div>

      {/* 4. Responsive Drawer Side Navigator (Mobile Only) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-900/60 backdrop-blur-sm">
          <div className="w-64 h-full relative" onClick={(e) => e.stopPropagation()}>
            <Sidebar
              currentView={currentView}
              onViewChange={(view) => {
                handleNavigateToView(view);
                setMobileMenuOpen(false);
              }}
              adminName={operatorSession.name}
              adminEmail={operatorSession.email}
              onLogout={handleLogout}
              counts={{
                pendingReports: incidentReports.filter(r => r.status === 'pending' && !isReportConvertedToZone(r, dangerZones)).length,
                totalReports: incidentReports.filter(r => !isReportConvertedToZone(r, dangerZones)).length,
                activeZones: dangerZones.length,
                totalUsers: users.length
              }}
            />
            {/* Click off closer trigger */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute left-64 top-4 ml-3 p-2 rounded bg-[#132844] text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
