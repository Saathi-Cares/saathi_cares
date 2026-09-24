// Role-Based Access Control — Extended for multi-portal system
// Roles: super_admin, admin, hmis_staff, supervisor, doctor, volunteer

export type UserRole = 'super_admin' | 'admin' | 'hmis_staff' | 'supervisor' | 'doctor' | 'volunteer';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  assignedCamps: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastLogin?: string;
  phone?: string;
}

const USERS_KEY = 'saathi_users';

// Permission matrix
const permissions: Record<UserRole, string[]> = {
  super_admin: ['*'],
  admin: [
    'admin.dashboard', 'admin.users', 'admin.camps', 'admin.donations',
    'admin.enquiries', 'admin.audit', 'admin.settings', 'admin.volunteers',
    'admin.reports',
  ],
  hmis_staff: [
    'hmis.dashboard', 'hmis.patients', 'hmis.forms', 'hmis.workflow',
    'hmis.prescriptions', 'hmis.referrals', 'hmis.conversion',
    'hmis.coverage', 'hmis.reports',
  ],
  supervisor: [
    'hmis.dashboard', 'hmis.patients', 'hmis.forms', 'hmis.workflow',
    'hmis.prescriptions', 'hmis.referrals', 'hmis.coverage', 'hmis.reports',
    'hmis.workflow.review', 'hmis.workflow.forward', 'hmis.workflow.return',
  ],
  doctor: [
    'hmis.dashboard', 'hmis.patients.assigned', 'hmis.workflow.assess',
    'hmis.prescriptions.create', 'hmis.referrals.create', 'hmis.reports.own',
  ],
  volunteer: [
    'volunteer.home', 'volunteer.intake.create', 'volunteer.submissions.own',
    'volunteer.reports.own',
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  const rolePerms = permissions[role];
  if (rolePerms.includes('*')) return true;
  return rolePerms.includes(permission);
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    hmis_staff: 'HMIS Staff',
    supervisor: 'Supervisor',
    doctor: 'Doctor',
    volunteer: 'Volunteer',
  };
  return labels[role];
}

export function getRoleColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    super_admin: 'bg-destructive/10 text-destructive',
    admin: 'bg-primary/10 text-primary',
    hmis_staff: 'bg-teal-100 text-teal-700',
    supervisor: 'bg-amber-100 text-amber-700',
    doctor: 'bg-blue-100 text-blue-700',
    volunteer: 'bg-green-100 text-green-700',
  };
  return colors[role];
}

export function getUsers(): AppUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
}

export function getUser(id: string): AppUser | undefined {
  return getUsers().find(u => u.id === id);
}

export function getUserByEmail(email: string): AppUser | undefined {
  return getUsers().find(u => u.email === email);
}

export function createUser(data: Omit<AppUser, 'id' | 'createdAt' | 'updatedAt'>): AppUser {
  const existing = getUsers();
  if (existing.find(u => u.email === data.email)) {
    throw new Error('User with this email already exists');
  }
  const user: AppUser = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(USERS_KEY, JSON.stringify([user, ...existing]));
  return user;
}

export function updateUser(id: string, updates: Partial<AppUser>): AppUser {
  const users = getUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) throw new Error('User not found');
  users[index] = { ...users[index], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return users[index];
}

export function deactivateUser(id: string): void {
  updateUser(id, { isActive: false });
}

export function resetUserPassword(id: string, newPassword: string): void {
  updateUser(id, { password: newPassword });
}

// Seed default users for all portals
export function seedUsers(): void {
  if (getUsers().length > 0) return;
  const now = new Date().toISOString();
  const users: AppUser[] = [
    { id: 'user-sa', name: 'Super Admin', email: 'superadmin@saathicares.org', password: 'admin123', role: 'super_admin', isActive: true, assignedCamps: [], createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-admin', name: 'Admin User', email: 'admin@saathicares.org', password: 'admin123', role: 'admin', isActive: true, assignedCamps: [], createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-hmis', name: 'HMIS Staff', email: 'hmis@saathicares.org', password: 'hmis123', role: 'hmis_staff', isActive: true, assignedCamps: [], createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-sup', name: 'Dr. Vishal Garg', email: 'vishal@saathicares.org', password: 'super123', role: 'supervisor', isActive: true, assignedCamps: ['camp-1', 'camp-2'], createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-doc', name: 'Dr. Aishwarya Rohatgi', email: 'aishwarya@saathicares.org', password: 'doctor123', role: 'doctor', isActive: true, assignedCamps: ['camp-1'], createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-vol1', name: 'Rahul Sharma', email: 'rahul@saathicares.org', password: 'vol123', role: 'volunteer', isActive: true, assignedCamps: ['camp-1'], phone: '+91 98765 11111', createdAt: now, updatedAt: now, createdBy: 'system' },
    { id: 'user-vol2', name: 'Priya Patel', email: 'priya@saathicares.org', password: 'vol123', role: 'volunteer', isActive: true, assignedCamps: ['camp-1', 'camp-2'], phone: '+91 98765 22222', createdAt: now, updatedAt: now, createdBy: 'system' },
  ];
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
