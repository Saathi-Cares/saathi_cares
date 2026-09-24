// Simple localStorage-based storage for form submissions

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: string;
  status: 'new' | 'read' | 'responded';
}

export interface Donation {
  id: string;
  name: string;
  email: string;
  amount: number;
  currency: string;
  donatedAt: string;
  status: 'completed' | 'pending' | 'failed';
}

const SUBMISSIONS_KEY = 'saathi_contact_submissions';
const DONATIONS_KEY = 'saathi_donations';

export function getSubmissions(): ContactSubmission[] {
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSubmission(submission: Omit<ContactSubmission, 'id' | 'submittedAt' | 'status'>): ContactSubmission {
  const newSubmission: ContactSubmission = {
    ...submission,
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status: 'new',
  };
  
  const submissions = getSubmissions();
  submissions.unshift(newSubmission);
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(submissions));
  
  return newSubmission;
}

export function updateSubmissionStatus(id: string, status: ContactSubmission['status']): void {
  const submissions = getSubmissions();
  const index = submissions.findIndex(s => s.id === id);
  if (index !== -1) {
    submissions[index].status = status;
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(submissions));
  }
}

export function deleteSubmission(id: string): void {
  const submissions = getSubmissions().filter(s => s.id !== id);
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(submissions));
}

export function getDonations(): Donation[] {
  try {
    const data = localStorage.getItem(DONATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Demo data for testing
export function seedDemoData(): void {
  if (getSubmissions().length === 0) {
    const demoSubmissions: ContactSubmission[] = [
      {
        id: '1',
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '+91 98765 43210',
        subject: 'Partnership Inquiry',
        message: 'We would like to partner with Saathi Cares for our CSR initiative.',
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
        status: 'new',
      },
      {
        id: '2',
        name: 'Priya Patel',
        email: 'priya@example.com',
        phone: '+91 87654 32109',
        subject: 'Volunteer Opportunity',
        message: 'I am a dental student and would love to volunteer for your camps.',
        submittedAt: new Date(Date.now() - 172800000).toISOString(),
        status: 'read',
      },
    ];
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(demoSubmissions));
  }
  
  if (getDonations().length === 0) {
    const demoDonations: Donation[] = [
      {
        id: '1',
        name: 'Amit Kumar',
        email: 'amit@example.com',
        amount: 5000,
        currency: 'INR',
        donatedAt: new Date(Date.now() - 43200000).toISOString(),
        status: 'completed',
      },
      {
        id: '2',
        name: 'Sunita Devi',
        email: 'sunita@example.com',
        amount: 10000,
        currency: 'INR',
        donatedAt: new Date(Date.now() - 259200000).toISOString(),
        status: 'completed',
      },
    ];
    localStorage.setItem(DONATIONS_KEY, JSON.stringify(demoDonations));
  }
}
