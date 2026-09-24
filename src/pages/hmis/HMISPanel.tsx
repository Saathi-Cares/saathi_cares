import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, GitBranch, Pill, ArrowRightLeft,
  BarChart3, Tent, LogOut, Heart, ChevronRight, Search, Download,
  Clock, Eye, CheckCircle, ArrowRight, RotateCcw, AlertTriangle,
  Stethoscope, Plus, Filter
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
import { getSession, logout as authLogout } from '@/lib/auth';
import { getRoleLabel, getRoleColor, type UserRole, seedUsers, getUsers } from '@/lib/rbac';
import { getIntakesForUser, getIntakeStats, getAllIntakes, transitionStage, type PatientIntake, type IntakeStage, seedIntakes } from '@/lib/intake';
import { getManagedCamps, seedManagedCamps } from '@/lib/camps';
import { logAudit } from '@/lib/audit';

const sidebarItems = [
  { title: 'Dashboard', url: '/hmis', icon: LayoutDashboard },
  { title: 'Patient Records', url: '/hmis/patients', icon: Users },
  { title: 'Form Reports', url: '/hmis/forms', icon: FileText },
  { title: 'Stage Workflow', url: '/hmis/workflow', icon: GitBranch },
  { title: 'Prescriptions', url: '/hmis/prescriptions', icon: Pill },
  { title: 'Referrals', url: '/hmis/referrals', icon: ArrowRightLeft },
  { title: 'HMIS Conversion', url: '/hmis/conversion', icon: BarChart3 },
  { title: 'Camp Coverage', url: '/hmis/coverage', icon: Tent },
];

function HMISSidebarContent() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();

  const handleLogout = () => {
    authLogout('hmis');
    navigate('/hmis/login');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" />
              {!collapsed && <span className="font-serif font-semibold">HMIS Panel</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/hmis'} className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
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

// ===== DASHBOARD =====
function DashboardPage({ session }: { session: any }) {
  const stats = getIntakeStats();
  const intakes = getIntakesForUser(session.userId, session.role);
  const pendingReview = intakes.filter(i => i.stage === 'pending_review').length;
  const withDoctor = intakes.filter(i => i.stage === 'with_doctor').length;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">HMIS Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats.total}</div><p className="text-sm text-muted-foreground">Total Patients</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats.today}</div><p className="text-sm text-muted-foreground">Today</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{pendingReview}</div><p className="text-sm text-muted-foreground">Pending Review</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-primary">{withDoctor}</div><p className="text-sm text-muted-foreground">With Doctor</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Stage Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['draft', 'pending_review', 'under_review', 'with_doctor', 'completed', 'referred', 'returned'].map(stage => (
              <div key={stage} className="flex items-center justify-between">
                <span className="text-sm capitalize text-muted-foreground">{stage.replace(/_/g, ' ')}</span>
                <Badge variant="secondary">{stats.byStage[stage] || 0}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== PATIENT RECORDS =====
function PatientRecordsPage({ session }: { session: any }) {
  const intakes = getIntakesForUser(session.userId, session.role);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selectedIntake, setSelectedIntake] = useState<PatientIntake | null>(null);

  const filtered = intakes.filter(i => {
    const matchSearch = i.patientName.toLowerCase().includes(search.toLowerCase()) || i.phone.includes(search);
    const matchStage = stageFilter === 'all' || i.stage === stageFilter;
    return matchSearch && matchStage;
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Patient Records</h1>
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients..." className="pl-10" /></div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="with_doctor">With Doctor</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="referred">Referred</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Camp</TableHead><TableHead>Complaint</TableHead><TableHead>Stage</TableHead><TableHead className="hidden md:table-cell">Volunteer</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead>View</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.patientName}<br/><span className="text-xs text-muted-foreground">{i.gender}, {i.age}y</span></TableCell>
                <TableCell className="text-sm">{i.campName}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{i.chiefComplaint}</TableCell>
                <TableCell>{stageBadge(i.stage)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{i.createdByName}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell><Button variant="ghost" size="sm" onClick={() => setSelectedIntake(i)}><Eye className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedIntake} onOpenChange={() => setSelectedIntake(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{selectedIntake?.patientName} {selectedIntake && stageBadge(selectedIntake.stage)}</DialogTitle></DialogHeader>
          {selectedIntake && (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase">Age / Gender</p><p>{selectedIntake.age} / {selectedIntake.gender}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Phone</p><p>{selectedIntake.phone}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Address</p><p>{selectedIntake.address}</p></div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Clinical Info</h4>
                <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Chief Complaint</p><p>{selectedIntake.chiefComplaint}</p></div>
                <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Symptoms</p><p>{selectedIntake.symptoms}</p></div>
                <div className="grid grid-cols-5 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">BP</p><p>{selectedIntake.vitals.bp}</p></div>
                  <div><p className="text-xs text-muted-foreground">Temp</p><p>{selectedIntake.vitals.temperature}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pulse</p><p>{selectedIntake.vitals.pulse}</p></div>
                  <div><p className="text-xs text-muted-foreground">Weight</p><p>{selectedIntake.vitals.weight}</p></div>
                  <div><p className="text-xs text-muted-foreground">Height</p><p>{selectedIntake.vitals.height}</p></div>
                </div>
                <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Medical History</p><p>{selectedIntake.medicalHistory}</p></div>
                <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Current Medications</p><p>{selectedIntake.currentMedications}</p></div>
                <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Volunteer Notes</p><p>{selectedIntake.volunteerNotes}</p></div>
                {selectedIntake.supervisorComments && <div className="text-sm bg-amber-50 p-3 rounded-lg"><p className="text-xs text-amber-700 uppercase">Supervisor Comments</p><p>{selectedIntake.supervisorComments}</p></div>}
                {selectedIntake.clinicalAssessment && <div className="text-sm"><p className="text-xs text-muted-foreground uppercase">Clinical Assessment</p><p>{selectedIntake.clinicalAssessment}</p></div>}
                {selectedIntake.prescription && (
                  <div className="text-sm bg-primary/5 p-3 rounded-lg space-y-1">
                    <p className="text-xs text-primary uppercase font-medium">Prescription</p>
                    <p><strong>Diagnosis:</strong> {selectedIntake.prescription.diagnosis}</p>
                    <p><strong>Medications:</strong> {selectedIntake.prescription.medications}</p>
                    <p><strong>Dosage:</strong> {selectedIntake.prescription.dosage}</p>
                    <p><strong>Follow-up:</strong> {selectedIntake.prescription.followUpInstructions}</p>
                    <p className="text-xs text-muted-foreground">By {selectedIntake.prescription.doctorName}</p>
                  </div>
                )}
              </div>
              <div className="border-t pt-4">
                <h4 className="font-semibold text-sm mb-3">Stage History</h4>
                <div className="space-y-2">
                  {selectedIntake.stageHistory.map(s => (
                    <div key={s.id} className="flex items-start gap-2 text-sm">
                      <Clock className="w-3 h-3 mt-1 text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-medium">{s.userName}</span>
                        <span className="text-muted-foreground"> moved to </span>
                        <Badge variant="outline" className="text-xs">{s.toStage.replace(/_/g, ' ')}</Badge>
                        {s.comments && <p className="text-muted-foreground text-xs mt-0.5">{s.comments}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(s.timestamp).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== WORKFLOW PAGE (Supervisor/Doctor actions) =====
function WorkflowPage({ session }: { session: any }) {
  const [intakes, setIntakes] = useState<PatientIntake[]>([]);
  const [actionIntake, setActionIntake] = useState<PatientIntake | null>(null);
  const [comments, setComments] = useState('');
  const [assignDoctor, setAssignDoctor] = useState('');
  const [clinicalAssessment, setClinicalAssessment] = useState('');
  const [prescription, setPrescription] = useState({ diagnosis: '', medications: '', dosage: '', followUpInstructions: '' });

  const load = () => {
    const user = getSession('hmis');
    if (!user) return;
    const data = getIntakesForUser(user.userId, user.role);
    setIntakes(data);
  };
  useEffect(() => { load(); }, []);

  const doctors = getUsers().filter(u => u.role === 'doctor' && u.isActive);

  const handleTransition = (intakeId: string, toStage: IntakeStage, extra?: Partial<PatientIntake>) => {
    try {
      transitionStage(intakeId, toStage, session.userId, session.name, session.role, comments, extra);
      logAudit({ action: 'patient.update', domain: 'hmis', actor: session.name, actorRole: session.role, entityType: 'intake', entityId: intakeId, details: `Stage → ${toStage}: ${comments}` });
      setActionIntake(null);
      setComments('');
      load();
    } catch (e: any) { alert(e.message); }
  };

  // Filter based on role
  const actionable = session.role === 'doctor'
    ? intakes.filter(i => i.stage === 'with_doctor')
    : intakes.filter(i => ['pending_review', 'under_review'].includes(i.stage));

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Stage Workflow</h1>
      <p className="text-muted-foreground">
        {session.role === 'doctor' ? 'Cases assigned to you for clinical assessment' : 'Records requiring your review and action'}
      </p>

      <div className="space-y-4">
        {actionable.map(i => (
          <Card key={i.id}>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{i.patientName}</h3>
                    {stageBadge(i.stage)}
                  </div>
                  <p className="text-sm text-muted-foreground">{i.chiefComplaint}</p>
                  <p className="text-xs text-muted-foreground mt-1">By {i.createdByName} • {i.campName} • {new Date(i.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActionIntake(i)}><Eye className="w-4 h-4 mr-1" />Review</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {actionable.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No records requiring your action</p>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionIntake} onOpenChange={() => setActionIntake(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{actionIntake?.patientName} {actionIntake && stageBadge(actionIntake.stage)}</DialogTitle></DialogHeader>
          {actionIntake && (
            <div className="space-y-4 pt-4">
              {/* Read-only previous data */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
                <h4 className="font-semibold">Patient Details (read-only)</h4>
                <p><strong>Age/Gender:</strong> {actionIntake.age} / {actionIntake.gender}</p>
                <p><strong>Complaint:</strong> {actionIntake.chiefComplaint}</p>
                <p><strong>Symptoms:</strong> {actionIntake.symptoms}</p>
                <p><strong>Vitals:</strong> BP {actionIntake.vitals.bp} | Temp {actionIntake.vitals.temperature}°F | Pulse {actionIntake.vitals.pulse} | Wt {actionIntake.vitals.weight}kg | Ht {actionIntake.vitals.height}cm</p>
                <p><strong>History:</strong> {actionIntake.medicalHistory}</p>
                <p><strong>Medications:</strong> {actionIntake.currentMedications}</p>
                <p><strong>Volunteer Notes:</strong> {actionIntake.volunteerNotes}</p>
              </div>

              {/* Supervisor actions */}
              {(session.role === 'supervisor' || session.role === 'hmis_staff' || session.role === 'super_admin') && actionIntake.stage === 'pending_review' && (
                <div className="space-y-3">
                  <Textarea placeholder="Add your review comments..." value={comments} onChange={e => setComments(e.target.value)} />
                  <Button onClick={() => handleTransition(actionIntake.id, 'under_review')} className="w-full"><Eye className="w-4 h-4 mr-2" />Take Under Review</Button>
                </div>
              )}

              {(session.role === 'supervisor' || session.role === 'hmis_staff' || session.role === 'super_admin') && actionIntake.stage === 'under_review' && (
                <div className="space-y-3">
                  <Textarea placeholder="Supervisor comments..." value={comments} onChange={e => setComments(e.target.value)} />
                  <div>
                    <Label>Assign to Doctor</Label>
                    <Select value={assignDoctor} onValueChange={setAssignDoctor}>
                      <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
                      <SelectContent>
                        {doctors.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => {
                      const doc = doctors.find(d => d.id === assignDoctor);
                      handleTransition(actionIntake.id, 'with_doctor', {
                        supervisorComments: comments,
                        assignedDoctorId: assignDoctor,
                        assignedDoctorName: doc?.name || '',
                      });
                    }} disabled={!assignDoctor} className="flex-1"><ArrowRight className="w-4 h-4 mr-2" />Forward to Doctor</Button>
                    <Button variant="destructive" onClick={() => handleTransition(actionIntake.id, 'returned', { supervisorComments: comments })} className="flex-1"><RotateCcw className="w-4 h-4 mr-2" />Return</Button>
                  </div>
                </div>
              )}

              {/* Doctor actions */}
              {session.role === 'doctor' && actionIntake.stage === 'with_doctor' && (
                <div className="space-y-4">
                  <div><Label>Clinical Assessment</Label><Textarea placeholder="Your clinical assessment..." value={clinicalAssessment} onChange={e => setClinicalAssessment(e.target.value)} rows={3} /></div>
                  <div className="border p-4 rounded-lg space-y-3">
                    <h4 className="font-semibold text-sm">Prescription</h4>
                    <div><Label>Diagnosis</Label><Input value={prescription.diagnosis} onChange={e => setPrescription(p => ({ ...p, diagnosis: e.target.value }))} /></div>
                    <div><Label>Medications</Label><Textarea value={prescription.medications} onChange={e => setPrescription(p => ({ ...p, medications: e.target.value }))} rows={2} /></div>
                    <div><Label>Dosage</Label><Input value={prescription.dosage} onChange={e => setPrescription(p => ({ ...p, dosage: e.target.value }))} /></div>
                    <div><Label>Follow-up Instructions</Label><Textarea value={prescription.followUpInstructions} onChange={e => setPrescription(p => ({ ...p, followUpInstructions: e.target.value }))} rows={2} /></div>
                  </div>
                  <Textarea placeholder="Additional comments..." value={comments} onChange={e => setComments(e.target.value)} />
                  <div className="flex gap-2">
                    <Button onClick={() => handleTransition(actionIntake.id, 'completed', {
                      clinicalAssessment,
                      prescription: { ...prescription, doctorName: session.name, doctorId: session.userId, createdAt: new Date().toISOString() },
                    })} className="flex-1"><CheckCircle className="w-4 h-4 mr-2" />Complete</Button>
                    <Button variant="outline" onClick={() => handleTransition(actionIntake.id, 'referred', {
                      clinicalAssessment,
                      prescription: prescription.diagnosis ? { ...prescription, doctorName: session.name, doctorId: session.userId, createdAt: new Date().toISOString() } : null,
                    })} className="flex-1"><ArrowRightLeft className="w-4 h-4 mr-2" />Refer</Button>
                  </div>
                </div>
              )}

              {/* Stage History */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-sm mb-2">Timeline</h4>
                {actionIntake.stageHistory.map(s => (
                  <div key={s.id} className="flex items-start gap-2 text-sm mb-2">
                    <Clock className="w-3 h-3 mt-1 text-muted-foreground shrink-0" />
                    <div>
                      <span className="font-medium">{s.userName}</span> → <Badge variant="outline" className="text-xs">{s.toStage.replace(/_/g, ' ')}</Badge>
                      {s.comments && <p className="text-xs text-muted-foreground">{s.comments}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(s.timestamp).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== PRESCRIPTIONS =====
function PrescriptionsPage({ session }: { session: any }) {
  const intakes = getIntakesForUser(session.userId, session.role);
  const withPrescriptions = intakes.filter(i => i.prescription !== null);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Prescriptions</h1>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Diagnosis</TableHead><TableHead>Doctor</TableHead><TableHead className="hidden md:table-cell">Date</TableHead><TableHead>View</TableHead></TableRow></TableHeader>
          <TableBody>
            {withPrescriptions.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.patientName}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{i.prescription!.diagnosis}</TableCell>
                <TableCell className="text-sm">{i.prescription!.doctorName}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{new Date(i.prescription!.createdAt).toLocaleDateString('en-IN')}</TableCell>
                <TableCell><Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}
            {withPrescriptions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No prescriptions yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== REFERRALS =====
function ReferralsPage({ session }: { session: any }) {
  const intakes = getIntakesForUser(session.userId, session.role);
  const referred = intakes.filter(i => i.stage === 'referred');

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Referral Management</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {referred.map(i => (
          <Card key={i.id}>
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{i.patientName}</h3>
                <Badge className="bg-coral-50 text-coral-600">Referred</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{i.chiefComplaint}</p>
              {i.prescription && <p className="text-sm"><strong>Diagnosis:</strong> {i.prescription.diagnosis}</p>}
              <p className="text-sm text-muted-foreground">Doctor: {i.assignedDoctorName} • Camp: {i.campName}</p>
              <p className="text-xs text-muted-foreground">{new Date(i.updatedAt).toLocaleDateString('en-IN')}</p>
            </CardContent>
          </Card>
        ))}
        {referred.length === 0 && <p className="text-muted-foreground col-span-2 text-center py-8">No referrals found</p>}
      </div>
    </div>
  );
}

// ===== HMIS CONVERSION =====
function ConversionPage({ session }: { session: any }) {
  const intakes = getAllIntakes();
  const completed = intakes.filter(i => i.stage === 'completed' || i.stage === 'referred');

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(completed, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'hmis-export.json'; a.click();
  };

  const exportCSV = () => {
    const headers = 'ID,Patient,Age,Gender,Complaint,Diagnosis,Doctor,Stage,Camp,Date\n';
    const rows = completed.map(i => `${i.id},${i.patientName},${i.age},${i.gender},"${i.chiefComplaint}","${i.prescription?.diagnosis || ''}",${i.assignedDoctorName},${i.stage},${i.campName},${i.createdAt}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'hmis-export.csv'; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-serif text-2xl font-semibold text-foreground">HMIS Conversion</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />CSV</Button>
          <Button variant="outline" onClick={exportJSON}><Download className="w-4 h-4 mr-2" />JSON</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{completed.length}</div><p className="text-sm text-muted-foreground">Ready for Conversion</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-amber-600">{intakes.length - completed.length}</div><p className="text-sm text-muted-foreground">Pending</p></CardContent></Card>
      </div>
    </div>
  );
}

// ===== CAMP COVERAGE =====
function CampCoveragePage({ session }: { session: any }) {
  const camps = getManagedCamps();
  const intakes = getAllIntakes();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Camp Patient Coverage</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {camps.map(camp => {
          const campIntakes = intakes.filter(i => i.campId === camp.id);
          const stageMap: Record<string, number> = {};
          campIntakes.forEach(i => { stageMap[i.stage] = (stageMap[i.stage] || 0) + 1; });

          return (
            <Card key={camp.id}>
              <CardHeader><CardTitle className="text-lg">{camp.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Patients</span><span className="font-bold">{campIntakes.length}</span></div>
                {Object.entries(stageMap).map(([stage, count]) => (
                  <div key={stage} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{stage.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
                {campIntakes.length === 0 && <p className="text-sm text-muted-foreground">No patients registered</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===== FORM REPORTS =====
function FormReportsPage({ session }: { session: any }) {
  const intakes = getIntakesForUser(session.userId, session.role);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Form Reports</h1>
        <Button variant="outline" onClick={() => {
          const headers = 'Patient,Age,Gender,Complaint,Stage,Camp,Volunteer,Date\n';
          const rows = intakes.map(i => `"${i.patientName}",${i.age},${i.gender},"${i.chiefComplaint}",${i.stage},"${i.campName}","${i.createdByName}",${i.createdAt}`).join('\n');
          const blob = new Blob([headers + rows], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'form-reports.csv'; a.click();
        }}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
      </div>
      <p className="text-muted-foreground">{intakes.length} forms across all camps</p>
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Camp</TableHead><TableHead>Volunteer</TableHead><TableHead>Stage</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>
            {intakes.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.patientName}</TableCell>
                <TableCell className="text-sm">{i.campName}</TableCell>
                <TableCell className="text-sm">{i.createdByName}</TableCell>
                <TableCell>{stageBadge(i.stage)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString('en-IN')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== MAIN HMIS PANEL =====
export default function HMISPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession('hmis');

  useEffect(() => {
    seedUsers();
    seedManagedCamps();
    seedIntakes();
    if (!session) { navigate('/hmis/login'); return; }
  }, [navigate, session]);

  if (!session) return null;

  const path = location.pathname.replace('/hmis', '') || '/';
  const getPage = () => {
    switch (path) {
      case '/': return <DashboardPage session={session} />;
      case '/patients': return <PatientRecordsPage session={session} />;
      case '/forms': return <FormReportsPage session={session} />;
      case '/workflow': return <WorkflowPage session={session} />;
      case '/prescriptions': return <PrescriptionsPage session={session} />;
      case '/referrals': return <ReferralsPage session={session} />;
      case '/conversion': return <ConversionPage session={session} />;
      case '/coverage': return <CampCoveragePage session={session} />;
      default: return <DashboardPage session={session} />;
    }
  };

  const crumbs = [{ label: 'HMIS', url: '/hmis' }];
  if (path !== '/') {
    const item = sidebarItems.find(i => i.url === `/hmis${path}`);
    if (item) crumbs.push({ label: item.title, url: item.url });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <HMISSidebarContent />
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
