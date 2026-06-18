import { collection, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function seedDemoData() {
  const batch = writeBatch(db);

  // 1. Mock Users Seeding
  const users = [
    {
      uid: 'jason_boostrapper_uid',
      name: 'Jason Operative Developer',
      email: 'jasonnnnn001@gmail.com',
      role: 'admin',
      active: true,
      createdAt: new Date().toLocaleDateString()
    },
    {
      uid: 'demo_admin_palanan',
      name: 'Hon. Maria Santos',
      email: 'admin@palanan.gov.ph',
      role: 'admin',
      active: true,
      createdAt: new Date().toLocaleDateString()
    },
    {
      uid: 'resident_maria_cruz',
      name: 'Maria Cruz (Resident)',
      email: 'maria.cruz@yahoo.com',
      role: 'resident',
      active: true,
      createdAt: new Date().toLocaleDateString()
    },
    {
      uid: 'resident_juan_dela_cruz',
      name: 'Juan Dela Cruz',
      email: 'juan.delacruz@gmail.com',
      role: 'resident',
      active: true,
      createdAt: new Date().toLocaleDateString()
    }
  ];

  users.forEach((u) => {
    const ref = doc(db, 'users', u.uid);
    batch.set(ref, u);
  });

  // 2. Mock Danger Zones Seeding
  const zones = [
    {
      id: 'palanan_danger_1',
      zoneId: 'palanan_danger_1',
      locationName: 'SLEX Highway Exit ramp near Cash & Carry',
      latitude: 14.5620,
      longitude: 121.0062,
      category: 'Accident-Prone Area',
      riskLevel: 'High',
      description: 'Frequent vehicular collisions reported due to sudden merging. Watch speed limit rules closely during wet weather.',
      radius: 150,
      color: 'Orange',
      createdAt: new Date().toISOString(),
      createdBy: 'system@makati.gov',
      status: 'active'
    },
    {
      id: 'palanan_danger_2',
      zoneId: 'palanan_danger_2',
      locationName: 'Passage passage of Medina Street',
      latitude: 14.5590,
      longitude: 121.0050,
      category: 'Poor Lighting',
      riskLevel: 'Moderate',
      description: 'Streetlamps are currently defective. High municipal night watch activity reported. Maintenance team notified.',
      radius: 100,
      color: 'Yellow',
      createdAt: new Date().toISOString(),
      createdBy: 'system@makati.gov',
      status: 'active'
    },
    {
      id: 'palanan_danger_3',
      zoneId: 'palanan_danger_3',
      locationName: 'Dian Street corner Casino Street intersection',
      latitude: 14.5579,
      longitude: 121.0001,
      category: 'Construction Area',
      riskLevel: 'Low',
      description: 'Continuous road drainage rehabilitation and pipeline upgrade. Single-lane bottleneck warning.',
      radius: 50,
      color: 'Green',
      createdAt: new Date().toISOString(),
      createdBy: 'system@makati.gov',
      status: 'active'
    },
    {
      id: 'palanan_danger_4',
      zoneId: 'palanan_danger_4',
      locationName: 'Bautista Street lower drainage segment',
      latitude: 14.5562,
      longitude: 121.0005,
      category: 'Flood Risk',
      riskLevel: 'Critical',
      description: 'Prone to flash floods during storms. High-risk of engine stalling. Residents advised to detour.',
      radius: 200,
      color: 'Red',
      createdAt: new Date().toISOString(),
      createdBy: 'system@makati.gov',
      status: 'active'
    },
    {
      id: 'palanan_danger_5',
      zoneId: 'palanan_danger_5',
      locationName: 'Arellano Avenue dark alleys',
      latitude: 14.5582,
      longitude: 120.9980,
      category: 'Crime',
      riskLevel: 'High',
      description: 'Increased snatching occurrences at late night hours. Avoid passing unescorted; safety patrols intensified.',
      radius: 150,
      color: 'Orange',
      createdAt: new Date().toISOString(),
      createdBy: 'system@makati.gov',
      status: 'active'
    }
  ];

  zones.forEach((z) => {
    const ref = doc(db, 'danger_zones', z.id);
    batch.set(ref, z);
  });

  // 3. Mock Incident Reports Seeding
  const reports = [
    {
      id: 'report_incident_p01',
      reporter: 'Pedro Penduko',
      reporterEmail: 'pedro@gmail.com',
      locationName: 'Casino Street dark corridor near Taft',
      latitude: 14.5575,
      longitude: 120.9968,
      category: 'Suspicious Activity',
      description: 'Several individuals loitering near unlit compounds past curfew hours. Reported for safety patrol checking.',
      dateSubmitted: new Date().toLocaleDateString(),
      status: 'pending'
    },
    {
      id: 'report_incident_p02',
      reporter: 'Alma Moreno',
      reporterEmail: 'alma@gmail.com',
      locationName: 'Bautista Street corner Palanan Street',
      latitude: 14.5601,
      longitude: 121.0018,
      category: 'Poor Lighting',
      riskLevel: 'Low',
      description: 'Two consecutive lamp posts on the corner exploded after a rainstorm. Pitch black darkness.',
      dateSubmitted: new Date().toLocaleDateString(),
      status: 'pending'
    },
    {
      id: 'report_incident_p03',
      reporter: 'Cardo Dalisay',
      reporterEmail: 'cardo@gmail.com',
      locationName: 'Zobel Roxas Street border intersection',
      latitude: 14.5629,
      longitude: 121.0035,
      category: 'Crime',
      description: 'Theft incident and physical altercation reported outside local convenience store. Police called.',
      dateSubmitted: new Date().toLocaleDateString(),
      status: 'approved',
      convertedToDangerZoneId: 'palanan_danger_5'
    }
  ];

  reports.forEach((r) => {
    const ref = doc(db, 'incident_reports', r.id);
    batch.set(ref, r);
  });

  // 4. Mock Community Alerts Seeding
  const alerts = [
    {
      id: 'broadcast_bulletin_1',
      title: 'Monsoon Heavy Rain & Rising Water Warning',
      message: 'Makati DRRMC warns of heavy monsoon downpour over Manila NCR tonight. Flooding warning raised for Bautista passage in Palanan. Keep storm emergency plans ready, and avoid low-lying roads.',
      priorityLevel: 'high',
      targetArea: 'Dian & Bautista low-lying corridors',
      dateSent: new Date().toLocaleDateString(),
      alertType: 'Weather Warning'
    },
    {
      id: 'broadcast_bulletin_2',
      title: 'Ocampo Street Road Excavations & Pipeline Work',
      message: 'Pablo Ocampo Sr. Street (Vito Cruz segment near Taft Ave) will undergo lane reduction starting tomorrow for waterworks. Expect substantial peak hour congestion.',
      priorityLevel: 'medium',
      targetArea: 'Vito Cruz Boundary / Taft Junction',
      dateSent: new Date().toLocaleDateString(),
      alertType: 'Road Closure'
    }
  ];

  alerts.forEach((a) => {
    const ref = doc(db, 'community_alerts', a.id);
    batch.set(ref, a);
  });

  // 5. Mock Activity Logs Seeding
  const logs = [
    {
      id: 'audit_event_1',
      adminName: 'Maria Santos (Admin)',
      adminEmail: 'admin@palanan.gov.ph',
      action: 'Danger Zone Added',
      timestamp: new Date().toISOString(),
      details: 'Registered brand new hazard geofence "Arellano Avenue dark alleys" for Crime prevention.'
    },
    {
      id: 'audit_event_2',
      adminName: 'Maria Santos (Admin)',
      adminEmail: 'admin@palanan.gov.ph',
      action: 'Incident Report Approved',
      timestamp: new Date().toISOString(),
      details: 'Evaluated Cardo Dalisay submitted incident crime report and validated coordinates.'
    },
    {
      id: 'audit_event_3',
      adminName: 'System Bootstrap Engine',
      adminEmail: 'support@palanan.gov.ph',
      action: 'Emergency Broadcast Sent',
      timestamp: new Date().toISOString(),
      details: 'Dispatched monsoon flooding cautionary advisory alert weather warning to entire neighborhood.'
    }
  ];

  logs.forEach((log) => {
    const ref = doc(db, 'activity_logs', log.id);
    batch.set(ref, log);
  });

  await batch.commit();
}
