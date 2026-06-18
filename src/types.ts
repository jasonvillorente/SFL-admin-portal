export interface UserAccount {
  uid: string;
  name: string;
  email: string;
  role: 'resident' | 'admin';
  active: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface DangerZone {
  id: string; // Document ID
  zoneId: string;
  locationName: string;
  category: 'Crime' | 'Poor Lighting' | 'Flood Risk' | 'Accident-Prone Area' | 'Construction Area' | 'Suspicious Activity' | 'Crime Area' | 'Theft Area' | 'Robbery Area' | 'Assault Area' | 'Accident Prone Area' | 'Road Hazard' | 'Construction Area' | 'Flood Prone Area' | 'Fire Incident Area' | 'Other';
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' | 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  latitude: number;
  longitude: number;
  radius: number;
  color: 'Green' | 'Yellow' | 'Orange' | 'Red' | string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'inactive';
}

export interface IncidentReport {
  id: string;
  reporter: string;
  reporterEmail: string;
  locationName: string;
  latitude: number;
  longitude: number;
  category: 'Crime' | 'Poor Lighting' | 'Flood Risk' | 'Accident-Prone Area' | 'Construction Area' | 'Suspicious Activity';
  description: string;
  dateSubmitted: string;
  status: 'pending' | 'approved' | 'rejected';
  convertedToDangerZoneId?: string;
}

export interface CommunityAlert {
  id: string;
  title: string;
  message: string;
  priorityLevel: 'low' | 'medium' | 'high' | 'critical';
  targetArea: string;
  dateSent: any;
  alertType: 'Safety Advisory' | 'Weather Warning' | 'Road Closure' | 'Emergency Notice';
}

export interface ActivityLog {
  id: string;
  adminName: string;
  adminEmail: string;
  action: string;
  timestamp: any;
  details: string;
}
