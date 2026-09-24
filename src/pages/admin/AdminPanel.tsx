import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Tent, IndianRupee, Mail, Shield, Settings,
  LogOut, Heart, ChevronRight, Plus, RefreshCw, UserPlus, Search,
  BarChart3, Eye, Trash2, CheckCircle, Clock, AlertCircle, Download,
  UserCog, MapPin, Calendar, ArrowLeft, Lock as LockIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { getSession, logout as authLogout } from '@/lib/auth';
import { getUsers, createUser, updateUser, deactivateUser, resetUserPassword, getRoleLabel, getRoleColor, type UserRole, type AppUser, seedUsers } from '@/lib/rbac';
import { getManagedCamps, createManagedCamp, updateManagedCamp, getCampTypeLabel, seedManagedCamps, type ManagedCamp, type CampType } from '@/lib/camps';
import { getDonations, getDonationStats, seedDonationData, type DonationRecord } from '@/lib/donations';
import { getSubmissions, updateSubmissionStatus, deleteSubmission, seedDemoData, type ContactSubmission } from '@/lib/storage';
import { getAuditLog, getAuditStats, logAudit, type AuditEntry } from '@/lib/audit';
import { getIntakeStats } from '@/lib/intake';

const sidebarItems = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
  { title: 'Users & RBAC', url: '/admin/users', icon: UserCog },
  { title: 'Volunteers', url: '/admin/volunteers', icon: Users },
  { title: 'Camps', url: '/admin/camps', icon: Tent },
  { title: 'Donations', url: '/admin/donations', icon: IndianRupee },
  { title: 'Enquiries', url: '/admin/enquiries', icon: Mail },
  { title: 'Audit Log', url: '/admin/audit', icon: Shield },
  { title: 'Settings', url: '/admin/settings', icon: Settings },
];

function AdminSidebarContent() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logAudit({ action: 'auth.logout', domain: 'auth', actor: 'Admin', actorRole: 'admin', entityType: 'session', entityId: '', details: 'Admin logout' });
    authLogout('admin');
    navigate('/admin/login');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary" />
              {!collapsed && <span className="font-serif font-semibold">Admin Panel</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/admin'} className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} className="hover:bg-destructive/10 text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {!collapsed && <span>Logout</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

// ===== DASHBOARD =====
function DashboardPage() {
  const users = getUsers();
  const camps = getManagedCamps();
  const donationStats = getDonationStats();
  const submissions = getSubmissions();
  const intakeStats = getIntakeStats();
  const auditLog = getAuditLog({ limit: 10 });
  const newEnquiries = submissions.filter(s => s.status === 'new').length;
  const activeVolunteers = users.filter(u => u.role === 'volunteer' && u.isActive).length;
  const activeCamps = camps.filter(c => c.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex gap-2">
          <Link to="/admin/users"><Button size="sm"><UserPlus className="w-4 h-4 mr-1" />Add User</Button></Link>
          <Link to="/admin/camps"><Button size="sm" variant="outline"><Tent className="w-4 h-4 mr-1" />New Camp</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{activeVolunteers}</div><p className="text-sm text-muted-foreground">Active Volunteers</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{activeCamps}</div><p className="text-sm text-muted-foreground">Active Camps</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">₹{donationStats.last30Total.toLocaleString()}</div><p className="text-sm text-muted-foreground">Donations This Month</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{newEnquiries}</div><p className="text-sm text-muted-foreground">Open Enquiries</p></CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Patient Stage Funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(intakeStats.byStage).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-muted-foreground">{stage.replace(/_/g, ' ')}</span>
                  <Badge variant="secondary">{count as number}</Badge>
                </div>
              ))}
              {Object.keys(intakeStats.byStage).length === 0 && <p className="text-sm text-muted-foreground">No patient records yet</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLog.slice(0, 8).map(entry => (
                <div key={entry.id} className="flex items-start gap-2 text-sm">
                  <Clock className="w-3 h-3 mt-1 text-muted-foreground shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">{entry.actor}</span>
                    <span className="text-muted-foreground"> {entry.details}</span>
                    <p className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))}
              {auditLog.length === 0 && <p className="text-sm text-muted-foreground">No activity logged yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== USER MANAGEMENT =====
function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'volunteer' as UserRole, phone: '' });
  const [search, setSearch] = useState('');

  const loadUsers = () => setUsers(getUsers());
  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    try {
      createUser({ ...newUser, isActive: true, assignedCamps: [], createdBy: 'admin' });
      logAudit({ action: 'config.change', domain: 'admin', actor: 'Admin', actorRole: 'admin', entityType: 'user', entityId: newUser.email, details: `Created user: ${newUser.name} (${newUser.role})` });
      setShowCreate(false);
      setNewUser({ name: '', email: '', password: '', role: 'volunteer', phone: '' });
      loadUsers();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeactivate = (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    deactivateUser(id);
    logAudit({ action: 'config.change', domain: 'admin', actor: 'Admin', actorRole: 'admin', entityType: 'user', entityId: id, details: `Deactivated user: ${name}` });
    loadUsers();
  };

  const handleResetPassword = (id: string, name: string) => {
    const pwd = prompt(`New password for ${name}:`);
    if (!pwd) return;
    resetUserPassword(id, pwd);
    logAudit({ action: 'config.change', domain: 'admin', actor: 'Admin', actorRole: 'admin', entityType: 'user', entityId: id, details: `Reset password for: ${name}` });
    loadUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Users & RBAC Management</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><UserPlus className="w-4 h-4 mr-2" />Create User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div><Label>Name</Label><Input value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
              <div><Label>Email</Label><Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="email@saathicares.org" /></div>
              <div><Label>Password</Label><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Initial password" /></div>
              <div><Label>Phone</Label><Input value={newUser.phone} onChange={e => setNewUser(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
              <div>
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="hmis_staff">HMIS Staff</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="volunteer">Volunteer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">Create User</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="pl-10" /></div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(user => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-sm">{user.email}</TableCell>
                <TableCell><Badge className={getRoleColor(user.role)}>{getRoleLabel(user.role)}</Badge></TableCell>
                <TableCell>{user.isActive ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(user.createdAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => handleResetPassword(user.id, user.name)} title="Reset Password"><LockIcon className="w-4 h-4" /></Button>
                  {user.isActive && <Button variant="ghost" size="sm" onClick={() => handleDeactivate(user.id, user.name)} title="Deactivate"><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== VOLUNTEERS PAGE =====
function VolunteersPage() {
  const users = getUsers().filter(u => u.role === 'volunteer');
  const camps = getManagedCamps();

  const getCampNames = (ids: string[]) => ids.map(id => camps.find(c => c.id === id)?.name || id).join(', ');

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Volunteer Management</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{users.filter(u => u.isActive).length}</div><p className="text-sm text-muted-foreground">Active Volunteers</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{users.length}</div><p className="text-sm text-muted-foreground">Total Volunteers</p></CardContent></Card>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Assigned Camps</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map(vol => (
              <TableRow key={vol.id}>
                <TableCell className="font-medium">{vol.name}</TableCell>
                <TableCell className="text-sm">{vol.email}<br/><span className="text-muted-foreground">{vol.phone}</span></TableCell>
                <TableCell className="text-sm">{getCampNames(vol.assignedCamps) || 'None'}</TableCell>
                <TableCell>{vol.isActive ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== CAMPS PAGE =====
function CampsPage() {
  const [camps, setCamps] = useState<ManagedCamp[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newCamp, setNewCamp] = useState({ name: '', date: '', location: '', district: '', state: '', type: 'dental_camp' as CampType });

  const loadCamps = () => setCamps(getManagedCamps());
  useEffect(() => { loadCamps(); }, []);

  const handleCreate = () => {
    createManagedCamp({ ...newCamp, status: 'upcoming', assignedVolunteers: [], assignedDoctors: [], isActive: true, createdBy: 'admin' });
    setShowCreate(false);
    setNewCamp({ name: '', date: '', location: '', district: '', state: '', type: 'dental_camp' });
    loadCamps();
  };

  const statusColor = (s: string) => s === 'upcoming' ? 'bg-blue-100 text-blue-700' : s === 'ongoing' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Camp Management</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Camp</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Camp</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div><Label>Camp Name</Label><Input value={newCamp.name} onChange={e => setNewCamp(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Date</Label><Input type="date" value={newCamp.date} onChange={e => setNewCamp(p => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>Location</Label><Input value={newCamp.location} onChange={e => setNewCamp(p => ({ ...p, location: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>District</Label><Input value={newCamp.district} onChange={e => setNewCamp(p => ({ ...p, district: e.target.value }))} /></div>
                <div><Label>State</Label><Input value={newCamp.state} onChange={e => setNewCamp(p => ({ ...p, state: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newCamp.type} onValueChange={v => setNewCamp(p => ({ ...p, type: v as CampType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dental_camp">Dental Camp</SelectItem>
                    <SelectItem value="school_program">School Program</SelectItem>
                    <SelectItem value="community_outreach">Community Outreach</SelectItem>
                    <SelectItem value="awareness">Awareness Drive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">Create Camp</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {camps.map(camp => (
          <Card key={camp.id}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{camp.name}</h3>
                <Badge className={statusColor(camp.status)}>{camp.status}</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-1"><MapPin className="w-3 h-3" />{camp.location}</p>
                <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(camp.date).toLocaleDateString('en-IN')}</p>
                <p>{getCampTypeLabel(camp.type)}</p>
                <p>{camp.patientCount} patients registered</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ===== DONATIONS PAGE =====
function DonationsPage() {
  const donations = getDonations();
  const stats = getDonationStats();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Donation Management</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">₹{stats.totalRaised.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Raised</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{stats.totalDonors}</div><p className="text-sm text-muted-foreground">Total Donors</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">{stats.totalDonations}</div><p className="text-sm text-muted-foreground">Total Donations</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-foreground">₹{Math.round(stats.avgDonation).toLocaleString()}</div><p className="text-sm text-muted-foreground">Average Donation</p></CardContent></Card>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Donor</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead className="hidden md:table-cell">Receipt</TableHead></TableRow></TableHeader>
          <TableBody>
            {donations.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.isAnonymous ? 'Anonymous' : d.donorName}</TableCell>
                <TableCell>₹{d.amount.toLocaleString()}</TableCell>
                <TableCell className="uppercase text-xs">{d.method}</TableCell>
                <TableCell><Badge className={d.status === 'completed' ? 'bg-green-100 text-green-700' : d.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-destructive/10 text-destructive'}>{d.status}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(d.initiatedAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{d.receiptNumber || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== ENQUIRIES PAGE =====
function EnquiriesPage() {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [selected, setSelected] = useState<ContactSubmission | null>(null);

  const load = () => { seedDemoData(); setSubmissions(getSubmissions()); };
  useEffect(() => { load(); }, []);

  const handleMarkRead = (id: string) => { updateSubmissionStatus(id, 'read'); load(); };
  const handleMarkResponded = (id: string) => { updateSubmissionStatus(id, 'responded'); load(); };
  const handleDelete = (id: string) => { if (confirm('Delete?')) { deleteSubmission(id); setSelected(null); load(); } };

  const statusBadge = (s: string) => s === 'new' ? <Badge className="bg-primary/10 text-primary">New</Badge> : s === 'read' ? <Badge variant="secondary">Read</Badge> : <Badge className="bg-green-100 text-green-700">Responded</Badge>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Reach Out / Enquiries</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Subject</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {submissions.map(s => (
                <TableRow key={s.id} className={`cursor-pointer ${selected?.id === s.id ? 'bg-muted/50' : ''}`} onClick={() => setSelected(s)}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="hidden sm:table-cell truncate max-w-[200px]">{s.subject}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); handleDelete(s.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Details</h3>{statusBadge(selected.status)}</div>
              <div className="space-y-3 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase">Name</p><p>{selected.name}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Email</p><a href={`mailto:${selected.email}`} className="text-primary hover:underline">{selected.email}</a></div>
                <div><p className="text-xs text-muted-foreground uppercase">Subject</p><p>{selected.subject}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Message</p><p className="leading-relaxed">{selected.message}</p></div>
              </div>
              <div className="flex gap-2 pt-4 border-t">
                {selected.status === 'new' && <Button size="sm" variant="outline" onClick={() => handleMarkRead(selected.id)}><Eye className="w-4 h-4 mr-1" />Read</Button>}
                {selected.status !== 'responded' && <Button size="sm" onClick={() => handleMarkResponded(selected.id)}><CheckCircle className="w-4 h-4 mr-1" />Responded</Button>}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground"><Mail className="w-12 h-12 mx-auto mb-4 opacity-30" /><p>Select an enquiry</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== AUDIT LOG PAGE =====
function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [domainFilter, setDomainFilter] = useState('all');

  useEffect(() => {
    const all = getAuditLog();
    setEntries(domainFilter === 'all' ? all : all.filter(e => e.domain === domainFilter));
  }, [domainFilter]);

  const exportCSV = () => {
    const headers = 'Timestamp,Action,Actor,Role,Domain,Entity,Details\n';
    const rows = entries.map(e => `${e.timestamp},${e.action},${e.actor},${e.actorRole},${e.domain},${e.entityType}:${e.entityId},"${e.details}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Audit Log</h1>
        <div className="flex gap-2">
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="auth">Auth</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="hmis">HMIS</SelectItem>
              <SelectItem value="donation">Donation</SelectItem>
              <SelectItem value="cms">CMS</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />CSV</Button>
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead className="hidden md:table-cell">Role</TableHead><TableHead className="hidden md:table-cell">Domain</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {entries.slice(0, 100).map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(e.timestamp).toLocaleString('en-IN')}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{e.action}</Badge></TableCell>
                <TableCell className="font-medium">{e.actor}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{e.actorRole}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline">{e.domain}</Badge></TableCell>
                <TableCell className="text-sm max-w-[300px] truncate">{e.details}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit entries</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== SETTINGS PAGE =====
function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Settings</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Organization Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Organization Name</Label><Input defaultValue="SHC Foundation (Saathi Cares)" /></div>
            <div><Label>Address</Label><Input defaultValue="Sector 15, Gurugram, Haryana 122001" /></div>
            <div><Label>Contact Email</Label><Input defaultValue="cares@saathiventures.com" /></div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>System Health</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Storage Used</span><span className="text-sm font-medium">{(JSON.stringify(localStorage).length / 1024).toFixed(1)} KB</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Users</span><span className="text-sm font-medium">{getUsers().length}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Audit Entries</span><span className="text-sm font-medium">{getAuditLog().length}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== MAIN ADMIN PANEL =====
export default function AdminPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession('admin');

  useEffect(() => {
    seedUsers();
    seedManagedCamps();
    seedDonationData();
    if (!session) { navigate('/admin/login'); return; }
  }, [navigate, session]);

  if (!session) return null;

  // Determine current page from URL
  const path = location.pathname.replace('/admin', '') || '/';
  const getPage = () => {
    switch (path) {
      case '/': return <DashboardPage />;
      case '/users': return <UsersPage />;
      case '/volunteers': return <VolunteersPage />;
      case '/camps': return <CampsPage />;
      case '/donations': return <DonationsPage />;
      case '/enquiries': return <EnquiriesPage />;
      case '/audit': return <AuditLogPage />;
      case '/settings': return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  // Breadcrumbs
  const crumbs = [{ label: 'Admin', url: '/admin' }];
  if (path !== '/') {
    const item = sidebarItems.find(i => i.url === `/admin${path}`);
    if (item) crumbs.push({ label: item.title, url: item.url });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebarContent />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b border-border bg-card px-4 gap-4 sticky top-0 z-40">
            <SidebarTrigger />
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
              {crumbs.map((c, i) => (
                <span key={c.url} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3" />}
                  <Link to={c.url} className={i === crumbs.length - 1 ? 'text-foreground font-medium' : 'hover:text-foreground'}>{c.label}</Link>
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden md:inline">{session.name}</span>
              <Badge className={getRoleColor(session.role as UserRole)}>{getRoleLabel(session.role as UserRole)}</Badge>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-muted/30">{getPage()}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
