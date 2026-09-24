// Camp Management — extended for admin portal

export type CampStatus = 'upcoming' | 'ongoing' | 'completed';
export type CampType = 'dental_camp' | 'school_program' | 'community_outreach' | 'awareness';

export interface ManagedCamp {
  id: string;
  name: string;
  date: string;
  location: string;
  district: string;
  state: string;
  type: CampType;
  status: CampStatus;
  assignedVolunteers: string[];
  assignedDoctors: string[];
  patientCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const CAMPS_KEY = 'saathi_managed_camps';

function getStore(): ManagedCamp[] {
  try { return JSON.parse(localStorage.getItem(CAMPS_KEY) || '[]'); } catch { return []; }
}
function setStore(data: ManagedCamp[]): void {
  localStorage.setItem(CAMPS_KEY, JSON.stringify(data));
}

export function getManagedCamps(): ManagedCamp[] { return getStore(); }
export function getActiveCamps(): ManagedCamp[] { return getStore().filter(c => c.isActive); }
export function getCamp(id: string): ManagedCamp | undefined { return getStore().find(c => c.id === id); }

export function createManagedCamp(data: Omit<ManagedCamp, 'id' | 'createdAt' | 'updatedAt' | 'patientCount'>): ManagedCamp {
  const now = new Date().toISOString();
  const camp: ManagedCamp = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now, patientCount: 0 };
  setStore([camp, ...getStore()]);
  return camp;
}

export function updateManagedCamp(id: string, updates: Partial<ManagedCamp>): ManagedCamp {
  const camps = getStore();
  const idx = camps.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Camp not found');
  camps[idx] = { ...camps[idx], ...updates, updatedAt: new Date().toISOString() };
  setStore(camps);
  return camps[idx];
}

export function getCampTypeLabel(type: CampType): string {
  const labels: Record<CampType, string> = {
    dental_camp: 'Dental Camp',
    school_program: 'School Program',
    community_outreach: 'Community Outreach',
    awareness: 'Awareness Drive',
  };
  return labels[type];
}

export function seedManagedCamps(): void {
  if (getStore().length > 0) return;
  const now = new Date().toISOString();
  const camps: ManagedCamp[] = [
    { id: 'camp-1', name: 'Gurugram Rural Camp', date: new Date(Date.now() - 7 * 86400000).toISOString(), location: 'Village Panchayat Hall, Sohna', district: 'Gurugram', state: 'Haryana', type: 'dental_camp', status: 'ongoing', assignedVolunteers: ['user-vol1', 'user-vol2'], assignedDoctors: ['user-doc'], patientCount: 3, isActive: true, createdAt: now, updatedAt: now, createdBy: 'user-admin' },
    { id: 'camp-2', name: 'Delhi NCR School Camp', date: new Date(Date.now() + 7 * 86400000).toISOString(), location: 'Government School, Dwarka', district: 'South West Delhi', state: 'Delhi', type: 'school_program', status: 'upcoming', assignedVolunteers: ['user-vol2'], assignedDoctors: ['user-doc'], patientCount: 0, isActive: true, createdAt: now, updatedAt: now, createdBy: 'user-admin' },
    { id: 'camp-3', name: 'Rajasthan Awareness Drive', date: new Date(Date.now() - 30 * 86400000).toISOString(), location: 'Community Center, Jaipur', district: 'Jaipur', state: 'Rajasthan', type: 'awareness', status: 'completed', assignedVolunteers: [], assignedDoctors: [], patientCount: 50, isActive: false, createdAt: now, updatedAt: now, createdBy: 'user-admin' },
  ];
  setStore(camps);
}
