import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Home, ClipboardPlus, FileText, BarChart3, LogOut, Heart, ChevronRight,
  Save, Send, AlertCircle, CheckCircle, Clock, Eye, RotateCcw, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { getSession, logout as authLogout, type AuthSession } from '@/lib/auth';
import { getRoleLabel, getRoleColor, type UserRole, seedUsers } from '@/lib/rbac';
import {
  getIntakesForUser, createIntake, updateIntakeDraft, transitionStage,
  autoSaveIntake, getAutoSavedIntake, clearAutoSave,
  type PatientIntake, type IntakeStage, seedIntakes
} from '@/lib/intake';
import { getManagedCamps, seedManagedCamps, type ManagedCamp } from '@/lib/camps';
import { logAudit } from '@/lib/audit';

const sidebarItems = [
  { title: 'Home', url: '/volunteer', icon: Home },
  { title: 'New Patient', url: '/volunteer/intake', icon: ClipboardPlus },
  { title: 'My Submissions', url: '/volunteer/submissions', icon: FileText },
  { title: 'My Reports', url: '/volunteer/reports', icon: BarChart3 },
];

function VolunteerSidebarContent() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary" />
              {!collapsed && <span className="font-serif font-semibold">Volunteer</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/volunteer'} className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => { authLogout('volunteer'); navigate('/volunteer/login'); }} className="hover:bg-destructive/10 text-destructive">
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

const stageBadge = (stage: IntakeStage) => {
  const map: Record<IntakeStage, string> = {
    draft: 'bg-muted text-muted-foreground',
    pending_review: 'bg-amber-100 text-amber-700',
    under_review: 'bg-blue-100 text-blue-700',
    with_doctor: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    referred: 'bg-coral-50 text-coral-600',
    returned: 'bg-destructive/10 text-destructive',
  };
  return <Badge className={map[stage]}>{stage.replace(/_/g, ' ')}</Badge>;
};

// ===== HOME =====
function HomePage({ session }: { session: AuthSession }) {
  const intakes = getIntakesForUser(session.userId, session.role);
  const today = new Date().toISOString().split('T')[0];
  const todayCount = intakes.filter(i => i.createdAt.startsWith(today)).length;
  const pending = intakes.filter(i => ['pending_review', 'under_review', 'with_doctor'].includes(i.stage)).length;
  const completed = intakes.filter(i => i.stage === 'completed').length;
  const returned = intakes.filter(i => i.stage === 'returned');
  const camps = getManagedCamps().filter(c => c.assignedVolunteers.includes(session.userId) && c.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Welcome, {session.name}!</h1>
        {camps.length > 0 && <p className="text-muted-foreground">Assigned camp: {camps[0].name}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{todayCount}</div><p className="text-sm text-muted-foreground">Today</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{intakes.length}</div><p className="text-sm text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{pending}</div><p className="text-sm text-muted-foreground">In Progress</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{completed}</div><p className="text-sm text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      {returned.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-lg text-destructive flex items-center gap-2"><RotateCcw className="w-5 h-5" />Returned Forms ({returned.length})</CardTitle></CardHeader>
          <CardContent>
            {returned.map(i => (
              <div key={i.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{i.patientName}</p>
                  <p className="text-xs text-destructive">{i.supervisorComments}</p>
                </div>
                <Link to="/volunteer/submissions"><Button size="sm" variant="outline">Edit</Button></Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Link to="/volunteer/intake"><Button size="lg" className="w-full md:w-auto"><ClipboardPlus className="w-5 h-5 mr-2" />Start New Patient Form</Button></Link>
    </div>
  );
}

// ===== PATIENT INTAKE FORM =====
function IntakeFormPage({ session }: { session: AuthSession }) {
  const navigate = useNavigate();
  const camps = getManagedCamps().filter(c => c.assignedVolunteers.includes(session.userId) && c.isActive);
  const autoSaved = getAutoSavedIntake();

  const [form, setForm] = useState({
    patientName: autoSaved?.patientName || '',
    age: autoSaved?.age || '',
    gender: autoSaved?.gender || 'male',
    phone: autoSaved?.phone || '',
    address: autoSaved?.address || '',
    chiefComplaint: autoSaved?.chiefComplaint || '',
    symptoms: autoSaved?.symptoms || '',
    bp: autoSaved?.bp || '',
    temperature: autoSaved?.temperature || '',
    pulse: autoSaved?.pulse || '',
    weight: autoSaved?.weight || '',
    height: autoSaved?.height || '',
    medicalHistory: autoSaved?.medicalHistory || '',
    currentMedications: autoSaved?.currentMedications || '',
    volunteerNotes: autoSaved?.volunteerNotes || '',
    campId: autoSaved?.campId || (camps.length === 1 ? camps[0].id : ''),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoLat, setGeoLat] = useState<number | undefined>();
  const [geoLng, setGeoLng] = useState<number | undefined>();
  const [locationStatus, setLocationStatus] = useState<string>('');
  const autoSaveRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (form.patientName) autoSaveIntake(form);
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [form]);

  // Capture geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      setLocationStatus('Fetching location...');
      navigator.geolocation.getCurrentPosition(
        pos => { setGeoLat(pos.coords.latitude); setGeoLng(pos.coords.longitude); setLocationStatus('Location captured'); },
        () => setLocationStatus('Location unavailable'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const updateField = (field: string, value: string) => {
    setForm(p => ({ ...p, [field]: value }));
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.patientName.trim()) e.patientName = 'Required';
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 0 || Number(form.age) > 120) e.age = 'Valid age required';
    if (!form.phone.trim()) e.phone = 'Required';
    if (!form.chiefComplaint.trim()) e.chiefComplaint = 'Required';
    if (!form.campId) e.campId = 'Select a camp';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!asDraft && !validate()) return;
    setIsSubmitting(true);
    const camp = camps.find(c => c.id === form.campId);
    try {
      createIntake({
        patientName: form.patientName,
        age: Number(form.age),
        gender: form.gender as 'male' | 'female' | 'other',
        phone: form.phone,
        address: form.address,
        chiefComplaint: form.chiefComplaint,
        symptoms: form.symptoms,
        vitals: { bp: form.bp, temperature: form.temperature, pulse: form.pulse, weight: form.weight, height: form.height },
        medicalHistory: form.medicalHistory,
        currentMedications: form.currentMedications,
        volunteerNotes: form.volunteerNotes,
        campId: form.campId,
        campName: camp?.name || '',
        createdBy: session.userId,
        createdByName: session.name,
        createdByRole: session.role,
        geoLat, geoLng,
      }, asDraft);
      logAudit({ action: 'patient.create', domain: 'hmis', actor: session.name, actorRole: session.role, entityType: 'intake', entityId: '', details: `${asDraft ? 'Draft saved' : 'Submitted'}: ${form.patientName}` });
      navigate('/volunteer/submissions');
    } catch (e: any) { alert(e.message); }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">New Patient Form</h1>
        {locationStatus && (
          <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{locationStatus}</span>
        )}
      </div>

      {autoSaved && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-amber-700">Auto-saved draft found</span>
          <Button size="sm" variant="ghost" onClick={() => { clearAutoSave(); setForm({ patientName: '', age: '', gender: 'male', phone: '', address: '', chiefComplaint: '', symptoms: '', bp: '', temperature: '', pulse: '', weight: '', height: '', medicalHistory: '', currentMedications: '', volunteerNotes: '', campId: camps.length === 1 ? camps[0].id : '' }); }}>Clear</Button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        {/* Camp Selection */}
        <div>
          <Label>Camp *</Label>
          <Select value={form.campId} onValueChange={v => updateField('campId', v)}>
            <SelectTrigger className={errors.campId ? 'border-destructive' : ''}><SelectValue placeholder="Select camp" /></SelectTrigger>
            <SelectContent>{camps.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          {errors.campId && <p className="text-xs text-destructive mt-1">{errors.campId}</p>}
        </div>

        {/* Patient Details */}
        <div>
          <h3 className="font-semibold text-sm mb-3 text-foreground">Patient Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Full Name *</Label><Input value={form.patientName} onChange={e => updateField('patientName', e.target.value)} className={errors.patientName ? 'border-destructive' : ''} />{errors.patientName && <p className="text-xs text-destructive mt-1">{errors.patientName}</p>}</div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Age *</Label><Input type="number" value={form.age} onChange={e => updateField('age', e.target.value)} className={errors.age ? 'border-destructive' : ''} />{errors.age && <p className="text-xs text-destructive mt-1">{errors.age}</p>}</div>
              <div><Label>Gender</Label><Select value={form.gender} onValueChange={v => updateField('gender', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Phone *</Label><Input value={form.phone} onChange={e => updateField('phone', e.target.value)} placeholder="+91 98765 43210" className={errors.phone ? 'border-destructive' : ''} />{errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}</div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => updateField('address', e.target.value)} /></div>
          </div>
        </div>

        {/* Clinical */}
        <div>
          <h3 className="font-semibold text-sm mb-3 text-foreground">Clinical Information</h3>
          <div className="space-y-4">
            <div><Label>Chief Complaint *</Label><Textarea value={form.chiefComplaint} onChange={e => updateField('chiefComplaint', e.target.value)} rows={2} className={errors.chiefComplaint ? 'border-destructive' : ''} />{errors.chiefComplaint && <p className="text-xs text-destructive mt-1">{errors.chiefComplaint}</p>}</div>
            <div><Label>Symptoms</Label><Textarea value={form.symptoms} onChange={e => updateField('symptoms', e.target.value)} rows={2} /></div>
          </div>
        </div>

        {/* Vitals */}
        <div>
          <h3 className="font-semibold text-sm mb-3 text-foreground">Vitals</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><Label>BP</Label><Input value={form.bp} onChange={e => updateField('bp', e.target.value)} placeholder="120/80" /></div>
            <div><Label>Temp (°F)</Label><Input value={form.temperature} onChange={e => updateField('temperature', e.target.value)} placeholder="98.6" /></div>
            <div><Label>Pulse</Label><Input value={form.pulse} onChange={e => updateField('pulse', e.target.value)} placeholder="72" /></div>
            <div><Label>Weight (kg)</Label><Input value={form.weight} onChange={e => updateField('weight', e.target.value)} placeholder="60" /></div>
            <div><Label>Height (cm)</Label><Input value={form.height} onChange={e => updateField('height', e.target.value)} placeholder="170" /></div>
          </div>
        </div>

        {/* History */}
        <div>
          <h3 className="font-semibold text-sm mb-3 text-foreground">History & Notes</h3>
          <div className="space-y-4">
            <div><Label>Medical History</Label><Textarea value={form.medicalHistory} onChange={e => updateField('medicalHistory', e.target.value)} rows={2} /></div>
            <div><Label>Current Medications</Label><Textarea value={form.currentMedications} onChange={e => updateField('currentMedications', e.target.value)} rows={2} /></div>
            <div><Label>Volunteer Notes</Label><Textarea value={form.volunteerNotes} onChange={e => updateField('volunteerNotes', e.target.value)} rows={3} placeholder="Any additional observations..." /></div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => handleSubmit(true)} disabled={isSubmitting}><Save className="w-4 h-4 mr-2" />Save Draft</Button>
          <Button onClick={() => handleSubmit(false)} disabled={isSubmitting} className="flex-1"><Send className="w-4 h-4 mr-2" />{isSubmitting ? 'Submitting...' : 'Submit for Review'}</Button>
        </div>
      </div>
    </div>
  );
}

// ===== MY SUBMISSIONS =====
function SubmissionsPage({ session }: { session: AuthSession }) {
  const [intakes, setIntakes] = useState<PatientIntake[]>([]);
  const [selected, setSelected] = useState<PatientIntake | null>(null);
  const [stageFilter, setStageFilter] = useState('all');

  const load = () => setIntakes(getIntakesForUser(session.userId, session.role));
  useEffect(() => { load(); }, []);

  const filtered = intakes.filter(i => stageFilter === 'all' || i.stage === stageFilter);

  // Resubmit returned form
  const handleResubmit = (id: string) => {
    try {
      transitionStage(id, 'pending_review', session.userId, session.name, session.role, 'Resubmitted after corrections');
      logAudit({ action: 'patient.update', domain: 'hmis', actor: session.name, actorRole: session.role, entityType: 'intake', entityId: id, details: 'Resubmitted' });
      load();
      setSelected(null);
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">My Submissions</h1>
      <Select value={stageFilter} onValueChange={setStageFilter}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="pending_review">Pending</SelectItem>
          <SelectItem value="returned">Returned</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Camp</TableHead><TableHead>Stage</TableHead><TableHead>Date</TableHead><TableHead>View</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(i => (
              <TableRow key={i.id} className={i.stage === 'returned' ? 'bg-destructive/5' : ''}>
                <TableCell className="font-medium">{i.patientName}</TableCell>
                <TableCell className="text-sm">{i.campName}</TableCell>
                <TableCell>{stageBadge(i.stage)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell><Button variant="ghost" size="sm" onClick={() => setSelected(i)}><Eye className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No submissions found</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{selected?.patientName} {selected && stageBadge(selected.stage)}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 pt-4 text-sm">
              {selected.stage === 'returned' && selected.supervisorComments && (
                <div className="bg-destructive/10 p-3 rounded-lg">
                  <p className="text-xs text-destructive uppercase font-medium">Supervisor Comments</p>
                  <p className="text-destructive">{selected.supervisorComments}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Age/Gender</p><p>{selected.age} / {selected.gender}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p>{selected.phone}</p></div>
              </div>
              <div><p className="text-xs text-muted-foreground">Complaint</p><p>{selected.chiefComplaint}</p></div>
              <div><p className="text-xs text-muted-foreground">Vitals</p><p>BP {selected.vitals.bp} | Temp {selected.vitals.temperature} | Pulse {selected.vitals.pulse} | Wt {selected.vitals.weight} | Ht {selected.vitals.height}</p></div>
              {selected.prescription && (
                <div className="bg-primary/5 p-3 rounded-lg">
                  <p className="text-xs text-primary uppercase font-medium">Prescription</p>
                  <p><strong>Diagnosis:</strong> {selected.prescription.diagnosis}</p>
                  <p><strong>Medications:</strong> {selected.prescription.medications}</p>
                </div>
              )}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-xs mb-2">Timeline</h4>
                {selected.stageHistory.map(s => (
                  <div key={s.id} className="flex items-start gap-2 mb-1">
                    <Clock className="w-3 h-3 mt-1 text-muted-foreground shrink-0" />
                    <div><span className="font-medium">{s.userName}</span> → {s.toStage.replace(/_/g, ' ')}<p className="text-xs text-muted-foreground">{new Date(s.timestamp).toLocaleString('en-IN')}</p></div>
                  </div>
                ))}
              </div>
              {(selected.stage === 'returned' || selected.stage === 'draft') && (
                <Button onClick={() => handleResubmit(selected.id)} className="w-full"><Send className="w-4 h-4 mr-2" />Resubmit</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== MY REPORTS =====
function ReportsPage({ session }: { session: AuthSession }) {
  const intakes = getIntakesForUser(session.userId, session.role);

  const exportCSV = () => {
    const headers = 'Patient,Age,Gender,Complaint,Stage,Camp,Date\n';
    const rows = intakes.map(i => `"${i.patientName}",${i.age},${i.gender},"${i.chiefComplaint}",${i.stage},"${i.campName}",${i.createdAt}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'my-submissions.csv'; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">My Reports</h1>
        <Button variant="outline" onClick={exportCSV}><BarChart3 className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{intakes.length}</div><p className="text-sm text-muted-foreground">Total Submissions</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{intakes.filter(i => i.stage === 'completed').length}</div><p className="text-sm text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{intakes.filter(i => ['pending_review', 'under_review', 'with_doctor'].includes(i.stage)).length}</div><p className="text-sm text-muted-foreground">In Progress</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-destructive">{intakes.filter(i => i.stage === 'returned').length}</div><p className="text-sm text-muted-foreground">Returned</p></CardContent></Card>
      </div>

      {/* Camp-wise breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Camp-wise Breakdown</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const byCamp: Record<string, number> = {};
            intakes.forEach(i => { byCamp[i.campName] = (byCamp[i.campName] || 0) + 1; });
            return Object.entries(byCamp).map(([camp, count]) => (
              <div key={camp} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-sm">{camp}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ));
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== MAIN VOLUNTEER PANEL =====
export default function VolunteerPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession('volunteer');

  useEffect(() => {
    seedUsers();
    seedManagedCamps();
    seedIntakes();
    if (!session) { navigate('/volunteer/login'); return; }
  }, [navigate, session]);

  if (!session) return null;

  const path = location.pathname.replace('/volunteer', '') || '/';
  const getPage = () => {
    switch (path) {
      case '/': return <HomePage session={session} />;
      case '/intake': return <IntakeFormPage session={session} />;
      case '/submissions': return <SubmissionsPage session={session} />;
      case '/reports': return <ReportsPage session={session} />;
      default: return <HomePage session={session} />;
    }
  };

  const crumbs = [{ label: 'Volunteer', url: '/volunteer' }];
  if (path !== '/') {
    const item = sidebarItems.find(i => i.url === `/volunteer${path}`);
    if (item) crumbs.push({ label: item.title, url: item.url });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <VolunteerSidebarContent />
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
