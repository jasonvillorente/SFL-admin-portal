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
  orderBy
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserAccount, DangerZone, IncidentReport, CommunityAlert, ActivityLog } from './types';
import { seedDemoData } from './seedHelper';

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
          
          let operatorProfile: any = null;
          
          if (userSnap && userSnap.exists()) {
            operatorProfile = userSnap.data();
          } else {
            // New user registration - check developer bootstrap
            const isDeveloper = firebaseUser.email === 'jasonnnnn001@gmail.com';
            const isAdminEmail = firebaseUser.email === 'admin@palanan.gov.ph';
            operatorProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || (isDeveloper ? 'Primary Developer (Jason)' : isAdminEmail ? 'Hon. Maria Santos (Barangay Captain)' : 'Authorized Admin Representative'),
              email: firebaseUser.email || '',
              role: (isDeveloper || isAdminEmail) ? 'admin' : 'resident',
              active: true,
              createdAt: new Date().toLocaleDateString()
            };
            
            // Save newly registered user document if online
            if (!isOffline) {
              try {
                await setDoc(userDocRef, operatorProfile);
              } catch (setErr) {
                console.warn("Could not write newly registered user document while offline", setErr);
              }
            }
          }
          
          // Verify active status
          if (!operatorProfile.active) {
            setLoginError('This administrator profile has been flagged and suspended. Contact Makati Civil Systems.');
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
          // If we had an authenticating error, try to still proceed with fallback
          const isDeveloper = firebaseUser.email === 'jasonnnnn001@gmail.com';
          const isAdminEmail = firebaseUser.email === 'admin@palanan.gov.ph';
          setOperatorSession({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || (isDeveloper ? 'Primary Developer (Jason)' : isAdminEmail ? 'Hon. Maria Santos (Barangay Captain)' : 'Authorized Admin Representative'),
            email: firebaseUser.email || '',
            role: (isDeveloper || isAdminEmail) ? 'admin' : 'resident',
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

  // 2. Local fallback credentials authentication
  const handleLocalLogin = async (email: string, pass: string) => {
    setLoading(true);
    setLoginError(null);
    
    // Low-level bypass check to allow quick offline testing or direct assessor logins
    if (email === 'admin@palanan.gov.ph' && pass === 'admin1234') {
      try {
        // Authenticate locally in Firebase Auth to establish request.auth context
        try {
          await signInWithEmailAndPassword(auth, email, pass);
        } catch (authErr: any) {
          if (authErr && (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/user-disabled')) {
            try {
              await createUserWithEmailAndPassword(auth, email, pass);
            } catch (createErr) {
              console.warn("Could not auto-create fallback administrator in Firebase Auth:", createErr);
            }
          } else {
            console.warn("Firebase email auth warning during bypass login", authErr);
          }
        }

        const adminProfile = {
          uid: auth.currentUser?.uid || 'demo_admin_palanan',
          name: 'Hon. Maria Santos (Barangay Captain)',
          email: 'admin@palanan.gov.ph',
          role: 'admin' as const,
          active: true
        };

        // Seed the administrator profile to users collection under this newly established uid if online
        if (auth.currentUser) {
          const uRef = doc(db, 'users', auth.currentUser.uid);
          try {
            await setDoc(uRef, {
              uid: auth.currentUser.uid,
              name: 'Hon. Maria Santos (Barangay Captain)',
              email: 'admin@palanan.gov.ph',
              role: 'admin',
              active: true,
              createdAt: new Date().toLocaleDateString()
            }, { merge: true });
          } catch (writeErr) {
            console.warn("Could not synchronize admin user payload to users store:", writeErr);
          }
        }

        setOperatorSession(adminProfile);
        
        // Log local operator bypass activity
        await logActivity(
          adminProfile.name,
          adminProfile.email,
          'Local Operator Session login',
          'Authenticated using official Barangay Captain fallback credentials.'
        );
      } catch (err: any) {
        setLoginError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Try standard dynamic email login if user set up auth in Firebase Console
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
      setLoginError(err.message);
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

    // A. Sync Danger Zones
    const unsubZones = onSnapshot(collection(db, 'danger_zones'), (snapshot) => {
      const zonesList: DangerZone[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        zonesList.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt ? safeFormatDate(data.createdAt) : undefined
        } as DangerZone);
      });
      setDangerZones(zonesList);
      setDbSyncStatus(prev => ({
        ...prev,
        danger_zones: { success: true, count: zonesList.length }
      }));
    }, (error) => {
      handleSnapshotError(error, 'danger_zones');
    });

    // B. Sync Incident Reports
    const unsubReports = onSnapshot(collection(db, 'incident_reports'), (snapshot) => {
      const reportsList: IncidentReport[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        reportsList.push({ 
          id: doc.id, 
          ...data,
          dateSubmitted: data.dateSubmitted ? safeFormatDate(data.dateSubmitted) : 'N/A'
        } as IncidentReport);
      });
      setIncidentReports(reportsList);
      setDbSyncStatus(prev => ({
        ...prev,
        incident_reports: { success: true, count: reportsList.length }
      }));
    }, (error) => {
      handleSnapshotError(error, 'incident_reports');
    });

    // C. Sync Community Alerts
    const unsubAlerts = onSnapshot(collection(db, 'community_alerts'), (snapshot) => {
      const alertsList: CommunityAlert[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        alertsList.push({ id: doc.id, ...data } as CommunityAlert);
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
          collectionUsers.push({
            uid: doc.id,
            name: data.name || data.fullName || 'Anonymous Resident',
            email: data.email || '',
            role: data.role || 'resident',
            active: data.active !== undefined ? data.active : true,
            createdAt: safeFormatDate(data.createdAt || data.registrationDate, new Date().toLocaleDateString()),
            lastLogin: safeFormatDate(data.lastLogin || data.lastLoginDate, 'N/A')
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
            const key = usr.uid || usr.email?.toLowerCase();
            if (key) {
              const existingUser = mergedMap.get(key);
              if (!existingUser || (usr.role === 'admin' && existingUser.role !== 'admin')) {
                mergedMap.set(key, usr);
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
        logsList.push({ id: doc.id, ...doc.data() } as ActivityLog);
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
      unsubZones();
      unsubReports();
      unsubAlerts();
      unsubUsers();
      unsubLogs();
    };
  }, [operatorSession]);

  // 4. Auxiliary functions tracking logs
  const logActivity = async (adminName: string, adminEmail: string, action: string, details: string) => {
    try {
      const ref = collection(db, 'activity_logs');
      await addDoc(ref, {
        adminName,
        adminEmail,
        action,
        timestamp: new Date().toISOString(),
        details
      });
    } catch (err) {
      console.error("Failed to append audit history: ", err);
    }
  };

  // 5. Database CRUD write executions wrapped in logs
  const handleAddDangerZone = async (payload: Omit<DangerZone, 'id'>) => {
    if (!operatorSession) return;
    try {
      const ref = doc(collection(db, 'danger_zones'));
      const completePayload = {
        ...payload,
        id: ref.id,
        zoneId: ref.id,
        createdBy: operatorSession.email,
        createdAt: new Date().toISOString()
      };
      await setDoc(ref, completePayload);
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Danger Zone Added',
        `Registered new danger zone circle marker "${payload.locationName}" (${payload.riskLevel} risk).`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'danger_zones');
    }
  };

  const handleUpdateDangerZone = async (id: string, payload: Partial<DangerZone>) => {
    if (!operatorSession) return;
    try {
      const ref = doc(db, 'danger_zones', id);
      await updateDoc(ref, {
        ...payload,
        id,
        zoneId: id,
      });
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Danger Zone Updated',
        `Modified properties of danger zone ID ${id} (${payload.locationName || 'no-name'}).`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `danger_zones/${id}`);
    }
  };

  const handleDeleteDangerZone = async (id: string) => {
    if (!operatorSession) return;
    try {
      const ref = doc(db, 'danger_zones', id);
      await deleteDoc(ref);
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Danger Zone Deleted',
        `Permanently removed hazard zone ID ${id} from Palanan records.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `danger_zones/${id}`);
    }
  };

  const handleApproveReport = async (id: string) => {
    if (!operatorSession) return;
    try {
      const ref = doc(db, 'incident_reports', id);
      await updateDoc(ref, { status: 'approved' });
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Incident Report Approved',
        `Officially verified citizen safety warning report ID ${id}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incident_reports/${id}`);
    }
  };

  const handleRejectReport = async (id: string) => {
    if (!operatorSession) return;
    try {
      const ref = doc(db, 'incident_reports', id);
      await updateDoc(ref, { status: 'rejected' });
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Incident Report Rejected',
        `Marked citizen reporting card ID ${id} as unverified/rejected.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incident_reports/${id}`);
    }
  };

  const handleConvertToDangerZone = (report: IncidentReport) => {
    // Navigate straight to Danger Zones panel with prefilled items
    setCurrentView('danger');
    alert(`Report values copied successfully. Drop a pinning marker on step 1 to finalize.`);
  };

  const handleSendAlert = async (payload: Omit<CommunityAlert, 'id'>) => {
    if (!operatorSession) return;
    try {
      const ref = collection(db, 'community_alerts');
      await addDoc(ref, payload);
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Emergency Alert Broadcasted',
        `Dispatched public safety bulletin warning "${payload.title}" to residents.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'community_alerts');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!operatorSession) return;
    try {
      const ref = doc(db, 'community_alerts', id);
      await deleteDoc(ref);
      
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Emergency Alert Retracted',
        `Withdrew public safety announcement bulletin ID ${id} from communities.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `community_alerts/${id}`);
    }
  };

  const handleToggleUserStatus = async (uid: string, currentStatus: boolean) => {
    if (!operatorSession) return;
    const collectionsToUpdate = ['users', 'residents', 'accounts', 'registeredUsers'];
    let updatedAny = false;
    let lastError: any = null;

    for (const colName of collectionsToUpdate) {
      try {
        const ref = doc(db, colName, uid);
        const docSnap = await getDoc(ref);
        if (docSnap.exists()) {
          await updateDoc(ref, { active: !currentStatus });
          updatedAny = true;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Failed to update status in collection ${colName}:`, err);
      }
    }

    if (updatedAny) {
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'User Status Modified',
        `Toggled accessibility active status flag of user profile ID ${uid}.`
      );
      alert('User status updated successfully across the system.');
    } else if (lastError) {
      handleFirestoreError(lastError, OperationType.UPDATE, `users/${uid}`);
    } else {
      alert("Error: User record not found in database to modify.");
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.warn("Recoverable password reset email exception: ", error);
    }
  };

  const handleSeedDatabase = async () => {
    if (!operatorSession) return;
    try {
      await seedDemoData();
      await logActivity(
        operatorSession.name,
        operatorSession.email,
        'Database Demo Seed Completed',
        'Populated local Firestore with realistic Barangay Palanan coordinates, hazard types, and mock alerts.'
      );
    } catch (error) {
      console.error("Seeding operation failed: ", error);
      throw error;
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
            selectedMarker={selectedMarker}
            onSelectMarker={setSelectedMarker}
          />
        );
      case 'danger':
        return (
          <DangerZoneView
            dangerZones={dangerZones}
            onAddDangerZone={handleAddDangerZone}
            onUpdateDangerZone={handleUpdateDangerZone}
            onDeleteDangerZone={handleDeleteDangerZone}
          />
        );
      case 'reports':
        return (
          <IncidentReportsView
            incidentReports={incidentReports}
            onApproveReport={handleApproveReport}
            onRejectReport={handleRejectReport}
            onConvertToDangerZone={handleConvertToDangerZone}
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
          />
        );
      case 'logs':
        return <ActivityLogsView logs={activityLogs} />;
      case 'settings':
        return (
          <SettingsView
            onSeedDatabase={handleSeedDatabase}
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
