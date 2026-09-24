// Portal-isolated authentication system
// Each portal has its own session — logging out of one does not affect others

export type Portal = 'admin' | 'hmis' | 'volunteer';

const SESSION_KEYS: Record<Portal, string> = {
  admin: 'saathi_admin_session',
  hmis: 'saathi_hmis_session',
  volunteer: 'saathi_volunteer_session',
};

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  role: string;
  portal: Portal;
  expiry: number;
}

// Which roles can access which portal
const PORTAL_ACCESS: Record<Portal, string[]> = {
  admin: ['admin', 'super_admin'],
  hmis: ['hmis_staff', 'supervisor', 'doctor'],
  volunteer: ['volunteer'],
};

export function canAccessPortal(role: string, portal: Portal): boolean {
  // super_admin can access everything
  if (role === 'super_admin') return true;
  return PORTAL_ACCESS[portal].includes(role);
}

export function login(email: string, password: string, portal: Portal): AuthSession | null {
  // Get users from storage
  const users = JSON.parse(localStorage.getItem('saathi_users') || '[]');
  const user = users.find((u: any) => u.email === email && u.isActive);

  if (!user) return null;
  // Simple password check (in production, this would be server-side hashed)
  if (user.password !== password) return null;

  // Check portal access
  if (!canAccessPortal(user.role, portal)) return null;

  const session: AuthSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    portal,
    expiry: Date.now() + SESSION_DURATION,
  };

  localStorage.setItem(SESSION_KEYS[portal], JSON.stringify(session));
  return session;
}

export function getSession(portal: Portal): AuthSession | null {
  try {
    const data = localStorage.getItem(SESSION_KEYS[portal]);
    if (!data) return null;
    const session: AuthSession = JSON.parse(data);
    if (Date.now() > session.expiry) {
      localStorage.removeItem(SESSION_KEYS[portal]);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function isAuthenticated(portal: Portal): boolean {
  return getSession(portal) !== null;
}

export function logout(portal: Portal): void {
  localStorage.removeItem(SESSION_KEYS[portal]);
}

export function getCurrentUser(portal: Portal): AuthSession | null {
  return getSession(portal);
}
