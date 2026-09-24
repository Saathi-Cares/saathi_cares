// Donation & Financial Processing System
// Tracks donations, campaigns, and financial reports

export type DonationStatus = 'initiated' | 'pending' | 'completed' | 'failed' | 'refunded';
export type DonationMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'bank_transfer';

export interface DonationRecord {
  id: string;
  orderId: string; // simulated Razorpay order ID
  donorName: string;
  donorEmail: string;
  donorPhone: string;
  amount: number;
  currency: string;
  method: DonationMethod;
  status: DonationStatus;
  campaignId?: string;
  isRecurring: boolean;
  isAnonymous: boolean;
  message?: string;
  receiptNumber?: string;
  initiatedAt: string;
  completedAt?: string;
  // Immutable after completion — no updates/deletes on completed records
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  goalAmount: number;
  raisedAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

const DONATIONS_KEY = 'saathi_donation_records';
const CAMPAIGNS_KEY = 'saathi_campaigns';
const RECEIPT_COUNTER_KEY = 'saathi_receipt_counter';

function getStore<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function setStore<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Donation operations
export function getDonations(): DonationRecord[] { return getStore<DonationRecord>(DONATIONS_KEY); }

export function getDonation(id: string): DonationRecord | undefined {
  return getDonations().find(d => d.id === id);
}

function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateReceiptNumber(): string {
  const counter = parseInt(localStorage.getItem(RECEIPT_COUNTER_KEY) || '0') + 1;
  localStorage.setItem(RECEIPT_COUNTER_KEY, counter.toString());
  return `SC-REC-${new Date().getFullYear()}-${counter.toString().padStart(5, '0')}`;
}

export function initiateDonation(data: {
  donorName: string;
  donorEmail: string;
  donorPhone: string;
  amount: number;
  method: DonationMethod;
  campaignId?: string;
  isRecurring: boolean;
  isAnonymous: boolean;
  message?: string;
}): DonationRecord {
  const donation: DonationRecord = {
    ...data,
    id: crypto.randomUUID(),
    orderId: generateOrderId(),
    currency: 'INR',
    status: 'initiated',
    initiatedAt: new Date().toISOString(),
  };
  setStore(DONATIONS_KEY, [donation, ...getDonations()]);
  return donation;
}

// Simulates webhook confirmation
export function confirmDonation(id: string): DonationRecord {
  const donations = getDonations();
  const index = donations.findIndex(d => d.id === id);
  if (index === -1) throw new Error('Donation not found');
  if (donations[index].status === 'completed') return donations[index]; // idempotent
  
  donations[index] = {
    ...donations[index],
    status: 'completed',
    completedAt: new Date().toISOString(),
    receiptNumber: generateReceiptNumber(),
  };
  setStore(DONATIONS_KEY, donations);
  
  // Update campaign raised amount
  if (donations[index].campaignId) {
    const campaigns = getCampaigns();
    const ci = campaigns.findIndex(c => c.id === donations[index].campaignId);
    if (ci !== -1) {
      campaigns[ci].raisedAmount += donations[index].amount;
      setStore(CAMPAIGNS_KEY, campaigns);
    }
  }
  
  return donations[index];
}

export function failDonation(id: string): void {
  const donations = getDonations();
  const index = donations.findIndex(d => d.id === id);
  if (index !== -1 && donations[index].status !== 'completed') {
    donations[index].status = 'failed';
    setStore(DONATIONS_KEY, donations);
  }
}

// Campaign operations
export function getCampaigns(): Campaign[] { return getStore<Campaign>(CAMPAIGNS_KEY); }

export function createCampaign(data: Omit<Campaign, 'id' | 'raisedAmount' | 'createdAt'>): Campaign {
  const campaign: Campaign = { ...data, id: crypto.randomUUID(), raisedAmount: 0, createdAt: new Date().toISOString() };
  setStore(CAMPAIGNS_KEY, [campaign, ...getCampaigns()]);
  return campaign;
}

export function updateCampaign(id: string, updates: Partial<Campaign>): void {
  const campaigns = getCampaigns();
  const i = campaigns.findIndex(c => c.id === id);
  if (i !== -1) { campaigns[i] = { ...campaigns[i], ...updates }; setStore(CAMPAIGNS_KEY, campaigns); }
}

// Financial reports
export function getDonationStats() {
  const donations = getDonations();
  const completed = donations.filter(d => d.status === 'completed');
  const totalRaised = completed.reduce((sum, d) => sum + d.amount, 0);
  const totalDonors = new Set(completed.map(d => d.donorEmail)).size;
  const avgDonation = completed.length > 0 ? totalRaised / completed.length : 0;
  
  const byMethod: Record<string, number> = {};
  completed.forEach(d => { byMethod[d.method] = (byMethod[d.method] || 0) + d.amount; });

  const last30Days = completed.filter(d => new Date(d.completedAt!).getTime() > Date.now() - 30 * 86400000);
  const last30Total = last30Days.reduce((sum, d) => sum + d.amount, 0);

  return { totalRaised, totalDonors, totalDonations: completed.length, avgDonation, byMethod, last30Total, last30Days: last30Days.length };
}

// Seed demo data
export function seedDonationData(): void {
  if (getDonations().length > 0) return;

  const campaigns: Campaign[] = [
    { id: 'camp-gen', title: 'General Fund', description: 'Support our ongoing programs and operations', goalAmount: 500000, raisedAmount: 175000, currency: 'INR', startDate: '2025-01-01', endDate: '2025-12-31', isActive: true, createdAt: '2025-01-01T00:00:00Z' },
    { id: 'camp-dental', title: 'Dental Camp 2025', description: 'Fund dental camps across 5 states', goalAmount: 200000, raisedAmount: 85000, currency: 'INR', startDate: '2025-03-01', endDate: '2025-06-30', isActive: true, createdAt: '2025-02-15T00:00:00Z' },
  ];
  setStore(CAMPAIGNS_KEY, campaigns);

  localStorage.setItem(RECEIPT_COUNTER_KEY, '5');
  const donations: DonationRecord[] = [
    { id: 'd-1', orderId: 'order_1710000001_abc', donorName: 'Amit Kumar', donorEmail: 'amit@example.com', donorPhone: '+91 98765 11111', amount: 5000, currency: 'INR', method: 'upi', status: 'completed', campaignId: 'camp-gen', isRecurring: false, isAnonymous: false, message: 'Keep up the great work!', receiptNumber: 'SC-REC-2025-00001', initiatedAt: new Date(Date.now() - 10 * 86400000).toISOString(), completedAt: new Date(Date.now() - 10 * 86400000).toISOString() },
    { id: 'd-2', orderId: 'order_1710000002_def', donorName: 'Priya Sharma', donorEmail: 'priya@example.com', donorPhone: '+91 98765 22222', amount: 10000, currency: 'INR', method: 'card', status: 'completed', campaignId: 'camp-dental', isRecurring: true, isAnonymous: false, receiptNumber: 'SC-REC-2025-00002', initiatedAt: new Date(Date.now() - 5 * 86400000).toISOString(), completedAt: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: 'd-3', orderId: 'order_1710000003_ghi', donorName: 'Anonymous', donorEmail: 'anon@example.com', donorPhone: '+91 98765 33333', amount: 25000, currency: 'INR', method: 'netbanking', status: 'completed', campaignId: 'camp-gen', isRecurring: false, isAnonymous: true, receiptNumber: 'SC-REC-2025-00003', initiatedAt: new Date(Date.now() - 2 * 86400000).toISOString(), completedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: 'd-4', orderId: 'order_1710000004_jkl', donorName: 'Rajesh Gupta', donorEmail: 'rajesh@example.com', donorPhone: '+91 98765 44444', amount: 2000, currency: 'INR', method: 'upi', status: 'pending', isRecurring: false, isAnonymous: false, initiatedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    { id: 'd-5', orderId: 'order_1710000005_mno', donorName: 'Sunita Devi', donorEmail: 'sunita@example.com', donorPhone: '+91 98765 55555', amount: 50000, currency: 'INR', method: 'bank_transfer', status: 'completed', campaignId: 'camp-gen', isRecurring: false, isAnonymous: false, message: 'For the children', receiptNumber: 'SC-REC-2025-00004', initiatedAt: new Date(Date.now() - 15 * 86400000).toISOString(), completedAt: new Date(Date.now() - 15 * 86400000).toISOString() },
  ];
  setStore(DONATIONS_KEY, donations);
}
