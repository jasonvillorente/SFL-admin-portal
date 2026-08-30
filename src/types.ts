export interface UserAccount {
  uid: string;
  id?: string;
  name?: string;
  displayName?: string;
  fullName?: string;
  reporterName?: string;
  reporter?: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  contactNumber?: string;
  mobile?: string;
  role: 'resident' | 'admin' | string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  photoURL?: string;
  avatar?: string;
  address?: string;
  barangay?: string;
  municipality?: string;
  provider?: string;
  authType?: 'phone' | 'email' | 'google' | string;
}

export interface DangerZone {
  id: string; // Document ID
  zoneId: string;
  locationName: string;
  category: 'Crime' | 'Poor Lighting' | 'Flood Risk' | 'Accident-Prone Area' | 'Construction Area' | 'Suspicious Activity' | 'Crime Area' | 'Theft Area' | 'Robbery Area' | 'Assault Area' | 'Accident Prone Area' | 'Road Hazard' | 'Flood Prone Area' | 'Fire Incident Area' | 'Other' | string;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' | 'LOW' | 'MEDIUM' | 'HIGH' | string;
  description: string;
  latitude: number;
  longitude: number;
  radius: number;
  color: 'Green' | 'Yellow' | 'Orange' | 'Red' | string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'inactive' | string;
  imageUrl?: string;
  photoUrl?: string;
  photoURL?: string;
  image?: string;
  photo?: string;
  photos?: string[];
  images?: string[];
}

export interface IncidentReport {
  id: string;
  reporter?: string;
  reporterName?: string;
  displayName?: string;
  fullName?: string;
  name?: string;
  reporterEmail?: string;
  email?: string;
  reporterPhone?: string;
  phoneNumber?: string;
  phone?: string;
  contactNumber?: string;
  userId?: string;
  userUid?: string;
  reporterUid?: string;
  locationName: string;
  latitude: number;
  longitude: number;
  category: 'Crime' | 'Poor Lighting' | 'Flood Risk' | 'Accident-Prone Area' | 'Construction Area' | 'Suspicious Activity' | string;
  description: string;
  dateSubmitted: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved' | string;
  imageUrl?: string;
  photoUrl?: string;
  photoURL?: string;
  image?: string;
  photo?: string;
  photos?: string[];
  images?: string[];
  attachment?: string;
  attachments?: string[];
  picture?: string;
  pictureUrl?: string;
  fileUrl?: string;
  imageBase64?: string;
  convertedToDangerZoneId?: string;
}

export interface CommunityAlert {
  id: string;
  title: string;
  message: string;
  priorityLevel: 'low' | 'medium' | 'high' | 'critical' | string;
  targetArea: string;
  dateSent: any;
  alertType: 'Safety Advisory' | 'Weather Warning' | 'Road Closure' | 'Emergency Notice' | string;
}

export interface ActivityLog {
  id: string;
  adminName: string;
  adminEmail: string;
  action: string;
  timestamp: any;
  details: string;
}

/**
 * Coerces any value (including coordinate objects {lat, lng}, nested fields) safely into a string
 */
export function safeString(val: any, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed && trimmed.toLowerCase() !== 'undefined' && trimmed.toLowerCase() !== 'null') {
      return trimmed;
    }
    return fallback;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    if (val.lat !== undefined && val.lng !== undefined) {
      const nLat = Number(val.lat);
      const nLng = Number(val.lng);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        return `(${nLat.toFixed(4)}, ${nLng.toFixed(4)})`;
      }
    }
    if (val.latitude !== undefined && val.longitude !== undefined) {
      const nLat = Number(val.latitude);
      const nLng = Number(val.longitude);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        return `(${nLat.toFixed(4)}, ${nLng.toFixed(4)})`;
      }
    }
    if (typeof val.address === 'string' && val.address.trim()) return val.address.trim();
    if (typeof val.locationName === 'string' && val.locationName.trim()) return val.locationName.trim();
    if (typeof val.name === 'string' && val.name.trim()) return val.name.trim();
    if (typeof val.title === 'string' && val.title.trim()) return val.title.trim();
    if (typeof val.placeName === 'string' && val.placeName.trim()) return val.placeName.trim();
    return fallback;
  }
  return fallback;
}

/**
 * Safely extracts a displayable location string from any entity, document or coordinate object
 */
export function resolveLocationName(data: any, fallback: string = 'Barangay Palanan'): string {
  if (!data) return fallback;
  if (typeof data === 'string') {
    const s = safeString(data, fallback);
    return s || fallback;
  }

  // 1. Direct locationName string
  if (typeof data.locationName === 'string' && data.locationName.trim()) {
    const s = safeString(data.locationName, '');
    if (s) return s;
  }

  // 2. Named text fields
  const textKeys = ['address', 'placeName', 'place', 'landmark', 'street', 'road', 'locationAddress', 'name', 'title'];
  for (const k of textKeys) {
    if (typeof data[k] === 'string' && data[k].trim()) {
      const s = safeString(data[k], '');
      if (s) return s;
    }
  }

  // 3. location field (string or object)
  if (typeof data.location === 'string' && data.location.trim()) {
    const s = safeString(data.location, '');
    if (s) return s;
  }

  if (data.location && typeof data.location === 'object') {
    for (const k of textKeys) {
      if (typeof data.location[k] === 'string' && data.location[k].trim()) {
        const s = safeString(data.location[k], '');
        if (s) return s;
      }
    }
    const lat = data.location.lat ?? data.location.latitude;
    const lng = data.location.lng ?? data.location.longitude;
    if (lat !== undefined && lng !== undefined) {
      const nLat = Number(lat);
      const nLng = Number(lng);
      if (!isNaN(nLat) && !isNaN(nLng)) {
        return `Palanan (${nLat.toFixed(4)}, ${nLng.toFixed(4)})`;
      }
    }
  }

  // 4. Direct coordinates fallback
  const directLat = data.latitude ?? data.lat;
  const directLng = data.longitude ?? data.lng;
  if (directLat !== undefined && directLng !== undefined) {
    const nLat = Number(directLat);
    const nLng = Number(directLng);
    if (!isNaN(nLat) && !isNaN(nLng)) {
      return `Palanan (${nLat.toFixed(4)}, ${nLng.toFixed(4)})`;
    }
  }

  return fallback;
}

/**
 * Safely extracts latitude and longitude numbers from any entity or object
 */
export function extractCoordinates(data: any): { latitude: number, longitude: number } {
  if (!data) return { latitude: 14.5585, longitude: 121.0020 };

  let lat = data.latitude ?? data.lat;
  let lng = data.longitude ?? data.lng ?? data.long;

  if ((lat === undefined || lng === undefined) && data.location && typeof data.location === 'object') {
    lat = data.location.latitude ?? data.location.lat ?? lat;
    lng = data.location.longitude ?? data.location.lng ?? data.location.long ?? lng;
  }

  if ((lat === undefined || lng === undefined) && data.coordinates && typeof data.coordinates === 'object') {
    lat = data.coordinates.latitude ?? data.coordinates.lat ?? lat;
    lng = data.coordinates.longitude ?? data.coordinates.lng ?? data.coordinates.long ?? lng;
  }

  if ((lat === undefined || lng === undefined) && data.coords && typeof data.coords === 'object') {
    lat = data.coords.latitude ?? data.coords.lat ?? lat;
    lng = data.coords.longitude ?? data.coords.lng ?? data.coords.long ?? lng;
  }

  if ((lat === undefined || lng === undefined) && data.position && typeof data.position === 'object') {
    lat = data.position.latitude ?? data.position.lat ?? lat;
    lng = data.position.longitude ?? data.position.lng ?? data.position.long ?? lng;
  }

  const numLat = Number(lat);
  const numLng = Number(lng);

  return {
    latitude: !isNaN(numLat) && isFinite(numLat) ? numLat : 14.5585,
    longitude: !isNaN(numLng) && isFinite(numLng) ? numLng : 121.0020
  };
}

/**
 * Clean and format phone numbers for display
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const clean = String(phone).trim();
  if (!clean) return '';

  // Check for Philippine mobile formats: +639XXXXXXXXX or 09XXXXXXXXX
  const digitsOnly = clean.replace(/\D/g, '');
  if (digitsOnly.length === 12 && digitsOnly.startsWith('63')) {
    // +63 9XX XXX XXXX
    return `+63 ${digitsOnly.slice(2, 5)} ${digitsOnly.slice(5, 8)} ${digitsOnly.slice(8)}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('09')) {
    // 09XX XXX XXXX
    return `${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 7)} ${digitsOnly.slice(7)}`;
  }
  if (digitsOnly.length === 10 && digitsOnly.startsWith('9')) {
    // 09XX XXX XXXX
    return `0${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6)}`;
  }

  // Return original clean string if already formatted or different international pattern
  return clean;
}

/**
 * Resident Display Name Resolution Helper (getResidentName):
 * Priority Fallback Hierarchy according to specification:
 * 1. userOrReport.displayName
 * 2. userOrReport.name
 * 3. userOrReport.reporterName
 * 4. userOrReport.reporter
 * 5. userOrReport.fullName
 * 6. userOrReport.phoneNumber ? `Resident (${userOrReport.phoneNumber})` : 'Resident'
 */
export function getResidentName(userOrReport: any, fallback: string = 'Resident'): string {
  if (!userOrReport) return fallback;

  if (typeof userOrReport === 'string') {
    const trimmed = userOrReport.trim();
    if (trimmed && trimmed.toLowerCase() !== 'undefined' && trimmed.toLowerCase() !== 'null') {
      return trimmed;
    }
    return fallback;
  }

  // 1. displayName
  if (userOrReport.displayName && typeof userOrReport.displayName === 'string') {
    const val = userOrReport.displayName.trim();
    if (val && val.toLowerCase() !== 'undefined' && val.toLowerCase() !== 'null') return val;
  }

  // 2. name
  if (userOrReport.name && typeof userOrReport.name === 'string') {
    const val = userOrReport.name.trim();
    if (val && val.toLowerCase() !== 'undefined' && val.toLowerCase() !== 'null') return val;
  }

  // 3. reporterName
  if (userOrReport.reporterName && typeof userOrReport.reporterName === 'string') {
    const val = userOrReport.reporterName.trim();
    if (val && val.toLowerCase() !== 'undefined' && val.toLowerCase() !== 'null') return val;
  }

  // 4. reporter
  if (userOrReport.reporter && typeof userOrReport.reporter === 'string') {
    const val = userOrReport.reporter.trim();
    if (val && val.toLowerCase() !== 'undefined' && val.toLowerCase() !== 'null') return val;
  }

  // 5. fullName
  if (userOrReport.fullName && typeof userOrReport.fullName === 'string') {
    const val = userOrReport.fullName.trim();
    if (val && val.toLowerCase() !== 'undefined' && val.toLowerCase() !== 'null') return val;
  }

  // 6. Phone number fallback
  const phone = userOrReport.phoneNumber || userOrReport.phone || userOrReport.reporterPhone || userOrReport.contactNumber || userOrReport.mobile;
  if (phone && String(phone).trim()) {
    const formatted = formatPhoneNumber(String(phone).trim()) || String(phone).trim();
    return `Resident (${formatted})`;
  }

  return fallback;
}

/**
 * Extracts and formats contact info (email or phone)
 */
export function getPhoneDisplayOrEmail(user: any): { type: 'phone' | 'email' | 'none'; value: string } {
  if (!user) return { type: 'none', value: '' };
  
  const phone = user.phoneNumber || user.phone || user.reporterPhone || user.contactNumber || user.mobile;
  if (phone && String(phone).trim()) {
    return { type: 'phone', value: formatPhoneNumber(String(phone).trim()) };
  }

  const email = user.email || user.reporterEmail;
  if (email && String(email).trim()) {
    return { type: 'email', value: String(email).trim() };
  }

  return { type: 'none', value: '' };
}

/**
 * Helper to safely extract attached photo from IncidentReport or DangerZone
 */
export function getReportImage(report: any): string | null {
  if (!report) return null;
  const directFields = [
    'imageUrl', 'photoUrl', 'photoURL', 'image', 'photo', 
    'picture', 'pictureUrl', 'attachment', 'attachmentsUrl', 
    'fileUrl', 'imageBase64', 'img', 'mediaUrl'
  ];
  for (const field of directFields) {
    if (typeof report[field] === 'string' && report[field].trim().length > 0) {
      return report[field].trim();
    }
  }
  if (Array.isArray(report.photos) && report.photos.length > 0 && typeof report.photos[0] === 'string' && report.photos[0].trim().length > 0) {
    return report.photos[0].trim();
  }
  if (Array.isArray(report.images) && report.images.length > 0 && typeof report.images[0] === 'string' && report.images[0].trim().length > 0) {
    return report.images[0].trim();
  }
  if (Array.isArray(report.attachments) && report.attachments.length > 0 && typeof report.attachments[0] === 'string' && report.attachments[0].trim().length > 0) {
    return report.attachments[0].trim();
  }
  return null;
}

/**
 * Helper to safely extract all attached photos from IncidentReport or DangerZone
 */
export function getAllReportImages(report: any): string[] {
  if (!report) return [];
  const results: string[] = [];
  const addIfValid = (val: any) => {
    if (typeof val === 'string' && val.trim().length > 0 && !results.includes(val.trim())) {
      results.push(val.trim());
    }
  };

  const directFields = [
    'imageUrl', 'photoUrl', 'photoURL', 'image', 'photo', 
    'picture', 'pictureUrl', 'attachment', 'attachmentsUrl', 
    'fileUrl', 'imageBase64', 'img', 'mediaUrl'
  ];
  for (const field of directFields) {
    addIfValid(report[field]);
  }
  if (Array.isArray(report.photos)) {
    report.photos.forEach(addIfValid);
  }
  if (Array.isArray(report.images)) {
    report.images.forEach(addIfValid);
  }
  if (Array.isArray(report.attachments)) {
    report.attachments.forEach(addIfValid);
  }
  return results;
}
