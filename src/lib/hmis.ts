// HMIS - Healthcare Management Information System
// Patient registration, encounters, referrals with camp-to-clinic lifecycle

export type PatientStatus = 'active' | 'referred' | 'treated' | 'archived';
export type EncounterType = 'camp_screening' | 'camp_treatment' | 'clinic_intake' | 'clinic_treatment' | 'follow_up';
export type ReferralStatus = 'pending' | 'accepted' | 'in_treatment' | 'completed' | 'cancelled';

export interface Patient {
  id: string;
  uniqueId: string; // SAT-XXXX format
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  phone: string;
  address: string;
  village: string;
  district: string;
  state: string;
  status: PatientStatus;
  registeredAt: string;
  registeredBy: string;
  isActive: boolean;
  version: number; // optimistic concurrency
}

export interface Encounter {
  id: string;
  patientId: string;
  type: EncounterType;
  campId?: string;
  clinicId?: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  doctorName: string;
  date: string;
  createdAt: string;
  createdBy: string;
}

export interface Referral {
  id: string;
  patientId: string;
  fromEncounterId: string;
  fromCampId?: string;
  toClinicId?: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: ReferralStatus;
  notes: string;
  referredBy: string;
  referredAt: string;
  acceptedAt?: string;
  completedAt?: string;
  version: number;
}

export interface Camp {
  id: string;
  name: string;
  location: string;
  district: string;
  state: string;
  date: string;
  status: 'planned' | 'active' | 'completed';
  organizer: string;
  patientsRegistered: number;
  createdAt: string;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}

const PATIENTS_KEY = 'saathi_patients';
const ENCOUNTERS_KEY = 'saathi_encounters';
const REFERRALS_KEY = 'saathi_referrals';
const CAMPS_KEY = 'saathi_camps';
const CLINICS_KEY = 'saathi_clinics';
const PATIENT_COUNTER_KEY = 'saathi_patient_counter';

function getStore<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function setStore<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Patient operations
export function getPatients(): Patient[] { return getStore<Patient>(PATIENTS_KEY); }

export function getPatient(id: string): Patient | undefined {
  return getPatients().find(p => p.id === id);
}

function generatePatientId(): string {
  const counter = parseInt(localStorage.getItem(PATIENT_COUNTER_KEY) || '0') + 1;
  localStorage.setItem(PATIENT_COUNTER_KEY, counter.toString());
  return `SAT-${counter.toString().padStart(4, '0')}`;
}

export function createPatient(data: Omit<Patient, 'id' | 'uniqueId' | 'registeredAt' | 'status' | 'isActive' | 'version'>): Patient {
  // Deduplication check
  const existing = getPatients();
  const duplicate = existing.find(p => p.phone === data.phone && p.name.toLowerCase() === data.name.toLowerCase());
  if (duplicate) throw new Error(`Patient already exists: ${duplicate.uniqueId}`);

  const patient: Patient = {
    ...data,
    id: crypto.randomUUID(),
    uniqueId: generatePatientId(),
    registeredAt: new Date().toISOString(),
    status: 'active',
    isActive: true,
    version: 1,
  };
  setStore(PATIENTS_KEY, [patient, ...existing]);
  return patient;
}

export function updatePatient(id: string, updates: Partial<Patient>, expectedVersion: number): Patient {
  const patients = getPatients();
  const index = patients.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Patient not found');
  if (patients[index].version !== expectedVersion) throw new Error('Concurrency conflict: patient was modified');
  
  patients[index] = { ...patients[index], ...updates, version: expectedVersion + 1 };
  setStore(PATIENTS_KEY, patients);
  return patients[index];
}

export function archivePatient(id: string): void {
  const patients = getPatients();
  const index = patients.findIndex(p => p.id === id);
  if (index !== -1) {
    patients[index].isActive = false;
    patients[index].status = 'archived';
    setStore(PATIENTS_KEY, patients);
  }
}

// Encounter operations
export function getEncounters(patientId?: string): Encounter[] {
  const all = getStore<Encounter>(ENCOUNTERS_KEY);
  return patientId ? all.filter(e => e.patientId === patientId) : all;
}

export function createEncounter(data: Omit<Encounter, 'id' | 'createdAt'>): Encounter {
  const encounter: Encounter = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const encounters = getEncounters();
  setStore(ENCOUNTERS_KEY, [encounter, ...encounters]);
  return encounter;
}

// Referral operations
export function getReferrals(patientId?: string): Referral[] {
  const all = getStore<Referral>(REFERRALS_KEY);
  return patientId ? all.filter(r => r.patientId === patientId) : all;
}

export function createReferral(data: Omit<Referral, 'id' | 'referredAt' | 'status' | 'version'>): Referral {
  const referral: Referral = {
    ...data,
    id: crypto.randomUUID(),
    referredAt: new Date().toISOString(),
    status: 'pending',
    version: 1,
  };
  const referrals = getReferrals();
  setStore(REFERRALS_KEY, [referral, ...referrals]);
  
  // Update patient status
  const patients = getPatients();
  const pi = patients.findIndex(p => p.id === data.patientId);
  if (pi !== -1) { patients[pi].status = 'referred'; setStore(PATIENTS_KEY, patients); }
  
  return referral;
}

export function updateReferralStatus(id: string, status: ReferralStatus, expectedVersion: number): Referral {
  const referrals = getReferrals();
  const index = referrals.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Referral not found');
  if (referrals[index].version !== expectedVersion) throw new Error('Concurrency conflict');
  
  referrals[index] = {
    ...referrals[index],
    status,
    version: expectedVersion + 1,
    ...(status === 'accepted' ? { acceptedAt: new Date().toISOString() } : {}),
    ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
  };
  setStore(REFERRALS_KEY, referrals);
  
  // Update patient status if completed
  if (status === 'completed') {
    const patients = getPatients();
    const pi = patients.findIndex(p => p.id === referrals[index].patientId);
    if (pi !== -1) { patients[pi].status = 'treated'; setStore(PATIENTS_KEY, patients); }
  }
  
  return referrals[index];
}

// Camp operations
export function getCamps(): Camp[] { return getStore<Camp>(CAMPS_KEY); }

export function createCamp(data: Omit<Camp, 'id' | 'createdAt' | 'patientsRegistered'>): Camp {
  const camp: Camp = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), patientsRegistered: 0 };
  setStore(CAMPS_KEY, [camp, ...getCamps()]);
  return camp;
}

export function updateCamp(id: string, updates: Partial<Camp>): void {
  const camps = getCamps();
  const i = camps.findIndex(c => c.id === id);
  if (i !== -1) { camps[i] = { ...camps[i], ...updates }; setStore(CAMPS_KEY, camps); }
}

// Clinic operations
export function getClinics(): Clinic[] { return getStore<Clinic>(CLINICS_KEY); }

export function createClinic(data: Omit<Clinic, 'id' | 'createdAt'>): Clinic {
  const clinic: Clinic = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  setStore(CLINICS_KEY, [clinic, ...getClinics()]);
  return clinic;
}

// Seed demo data
export function seedHMISData(): void {
  if (getPatients().length > 0) return;

  const camps: Camp[] = [
    { id: 'camp-1', name: 'Gurugram Rural Camp', location: 'Village Panchayat Hall, Sohna', district: 'Gurugram', state: 'Haryana', date: new Date(Date.now() - 7 * 86400000).toISOString(), status: 'completed', organizer: 'Dr. Aishwarya Rohatgi', patientsRegistered: 45, createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
    { id: 'camp-2', name: 'Delhi NCR School Camp', location: 'Government School, Dwarka', district: 'South West Delhi', state: 'Delhi', date: new Date(Date.now() + 3 * 86400000).toISOString(), status: 'planned', organizer: 'Dr. Vishal Garg', patientsRegistered: 0, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  ];
  setStore(CAMPS_KEY, camps);

  const clinics: Clinic[] = [
    { id: 'clinic-1', name: 'Saathi Dental Clinic Gurugram', address: 'Sector 15, Gurugram', district: 'Gurugram', state: 'Haryana', contactPerson: 'Dr. Vishal Garg', phone: '+91 98765 43210', isActive: true, createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  ];
  setStore(CLINICS_KEY, clinics);

  localStorage.setItem(PATIENT_COUNTER_KEY, '3');
  const patients: Patient[] = [
    { id: 'pat-1', uniqueId: 'SAT-0001', name: 'Ramesh Kumar', age: 45, gender: 'male', phone: '+91 98111 22233', address: 'Village Rithoj', village: 'Rithoj', district: 'Gurugram', state: 'Haryana', status: 'referred', registeredAt: new Date(Date.now() - 7 * 86400000).toISOString(), registeredBy: 'Dr. Aishwarya Rohatgi', isActive: true, version: 1 },
    { id: 'pat-2', uniqueId: 'SAT-0002', name: 'Sunita Devi', age: 32, gender: 'female', phone: '+91 98222 33344', address: 'Village Badshahpur', village: 'Badshahpur', district: 'Gurugram', state: 'Haryana', status: 'treated', registeredAt: new Date(Date.now() - 7 * 86400000).toISOString(), registeredBy: 'Dr. Aishwarya Rohatgi', isActive: true, version: 1 },
    { id: 'pat-3', uniqueId: 'SAT-0003', name: 'Mohan Singh', age: 58, gender: 'male', phone: '+91 98333 44455', address: 'Village Sohna', village: 'Sohna', district: 'Gurugram', state: 'Haryana', status: 'active', registeredAt: new Date(Date.now() - 5 * 86400000).toISOString(), registeredBy: 'Dr. Vishal Garg', isActive: true, version: 1 },
  ];
  setStore(PATIENTS_KEY, patients);

  const encounters: Encounter[] = [
    { id: 'enc-1', patientId: 'pat-1', type: 'camp_screening', campId: 'camp-1', diagnosis: 'Severe dental caries (multiple teeth)', treatment: 'Temporary filling, pain management', notes: 'Needs root canal treatment at clinic', doctorName: 'Dr. Aishwarya Rohatgi', date: new Date(Date.now() - 7 * 86400000).toISOString(), createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), createdBy: 'Dr. Aishwarya Rohatgi' },
    { id: 'enc-2', patientId: 'pat-2', type: 'camp_treatment', campId: 'camp-1', diagnosis: 'Gingivitis, mild calculus', treatment: 'Scaling, oral hygiene instructions', notes: 'Follow-up in 3 months', doctorName: 'Dr. Vishal Garg', date: new Date(Date.now() - 7 * 86400000).toISOString(), createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), createdBy: 'Dr. Vishal Garg' },
    { id: 'enc-3', patientId: 'pat-2', type: 'clinic_treatment', clinicId: 'clinic-1', diagnosis: 'Gingivitis resolved', treatment: 'Deep cleaning completed', notes: 'Good improvement', doctorName: 'Dr. Vishal Garg', date: new Date(Date.now() - 2 * 86400000).toISOString(), createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), createdBy: 'Dr. Vishal Garg' },
    { id: 'enc-4', patientId: 'pat-3', type: 'camp_screening', campId: 'camp-1', diagnosis: 'Suspicious oral lesion', treatment: 'Biopsy recommended', notes: 'Tobacco user - counselling provided', doctorName: 'Dr. Aishwarya Rohatgi', date: new Date(Date.now() - 5 * 86400000).toISOString(), createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), createdBy: 'Dr. Aishwarya Rohatgi' },
  ];
  setStore(ENCOUNTERS_KEY, encounters);

  const referrals: Referral[] = [
    { id: 'ref-1', patientId: 'pat-1', fromEncounterId: 'enc-1', fromCampId: 'camp-1', toClinicId: 'clinic-1', reason: 'Root canal treatment required for multiple teeth', priority: 'high', status: 'pending', notes: 'Patient has been experiencing severe pain', referredBy: 'Dr. Aishwarya Rohatgi', referredAt: new Date(Date.now() - 7 * 86400000).toISOString(), version: 1 },
    { id: 'ref-2', patientId: 'pat-2', fromEncounterId: 'enc-2', fromCampId: 'camp-1', toClinicId: 'clinic-1', reason: 'Deep cleaning and follow-up', priority: 'medium', status: 'completed', notes: 'Treatment completed successfully', referredBy: 'Dr. Vishal Garg', referredAt: new Date(Date.now() - 7 * 86400000).toISOString(), acceptedAt: new Date(Date.now() - 5 * 86400000).toISOString(), completedAt: new Date(Date.now() - 2 * 86400000).toISOString(), version: 3 },
  ];
  setStore(REFERRALS_KEY, referrals);
}
