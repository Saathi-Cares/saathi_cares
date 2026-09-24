// Patient Intake System with Multi-Stage Workflow
// Stage pipeline: Draft → Pending Review → Under Review → With Doctor → Completed/Referred/Returned

export type IntakeStage = 'draft' | 'pending_review' | 'under_review' | 'with_doctor' | 'completed' | 'referred' | 'returned';

export interface PatientVitals {
  bp: string;
  temperature: string;
  pulse: string;
  weight: string;
  height: string;
}

export interface StageTransition {
  id: string;
  fromStage: IntakeStage;
  toStage: IntakeStage;
  userId: string;
  userName: string;
  userRole: string;
  comments: string;
  timestamp: string;
}

export interface Prescription {
  diagnosis: string;
  medications: string;
  dosage: string;
  followUpInstructions: string;
  doctorName: string;
  doctorId: string;
  createdAt: string;
}

export interface PatientIntake {
  id: string;
  // Patient personal details
  patientName: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  phone: string;
  address: string;
  // Clinical - volunteer
  chiefComplaint: string;
  symptoms: string;
  vitals: PatientVitals;
  medicalHistory: string;
  currentMedications: string;
  volunteerNotes: string;
  // Supervisor
  supervisorComments: string;
  // Doctor - clinical assessment
  clinicalAssessment: string;
  prescription: Prescription | null;
  // Workflow
  stage: IntakeStage;
  stageHistory: StageTransition[];
  assignedDoctorId: string;
  assignedDoctorName: string;
  // Meta
  campId: string;
  campName: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  // Location
  geoLat?: number;
  geoLng?: number;
  locationCapturedAt?: string;
}

const INTAKES_KEY = 'saathi_intakes';
const AUTO_SAVE_KEY = 'saathi_intake_autosave';

function getStore(): PatientIntake[] {
  try { return JSON.parse(localStorage.getItem(INTAKES_KEY) || '[]'); } catch { return []; }
}
function setStore(data: PatientIntake[]): void {
  localStorage.setItem(INTAKES_KEY, JSON.stringify(data));
}

// === Role-based query filtering (row-level security at data layer) ===

export function getIntakesForUser(userId: string, role: string, assignedCamps?: string[]): PatientIntake[] {
  const all = getStore();
  switch (role) {
    case 'volunteer':
      // Volunteers see ONLY their own records
      return all.filter(i => i.createdBy === userId);
    case 'supervisor':
      // Supervisors see all records in their assigned camps
      return assignedCamps?.length
        ? all.filter(i => assignedCamps.includes(i.campId))
        : [];
    case 'doctor':
      // Doctors see only records assigned to them
      return all.filter(i => i.assignedDoctorId === userId);
    case 'hmis_staff':
    case 'super_admin':
      // Full access to all clinical records
      return all;
    case 'admin':
      // Admin sees NO clinical records — only counts via stats
      return [];
    default:
      return [];
  }
}

export function getIntake(id: string): PatientIntake | undefined {
  return getStore().find(i => i.id === id);
}

export function getAllIntakes(): PatientIntake[] {
  return getStore();
}

// === CRUD ===

export function createIntake(data: {
  patientName: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  phone: string;
  address: string;
  chiefComplaint: string;
  symptoms: string;
  vitals: PatientVitals;
  medicalHistory: string;
  currentMedications: string;
  volunteerNotes: string;
  campId: string;
  campName: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  geoLat?: number;
  geoLng?: number;
}, asDraft: boolean = false): PatientIntake {
  const now = new Date().toISOString();
  const stage: IntakeStage = asDraft ? 'draft' : 'pending_review';
  const intake: PatientIntake = {
    ...data,
    id: crypto.randomUUID(),
    supervisorComments: '',
    clinicalAssessment: '',
    prescription: null,
    stage,
    stageHistory: [{
      id: crypto.randomUUID(),
      fromStage: 'draft',
      toStage: stage,
      userId: data.createdBy,
      userName: data.createdByName,
      userRole: data.createdByRole,
      comments: asDraft ? 'Form saved as draft' : 'Form submitted for review',
      timestamp: now,
    }],
    assignedDoctorId: '',
    assignedDoctorName: '',
    createdAt: now,
    updatedAt: now,
    locationCapturedAt: data.geoLat ? now : undefined,
  };
  const all = getStore();
  setStore([intake, ...all]);
  clearAutoSave();
  return intake;
}

export function updateIntakeDraft(id: string, updates: Partial<PatientIntake>): PatientIntake {
  const all = getStore();
  const idx = all.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('Intake not found');
  if (all[idx].stage !== 'draft' && all[idx].stage !== 'returned') {
    throw new Error('Can only edit drafts or returned records');
  }
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  setStore(all);
  return all[idx];
}

// === Stage transitions ===

const VALID_TRANSITIONS: Record<string, { allowedRoles: string[]; toStages: IntakeStage[] }> = {
  draft: { allowedRoles: ['volunteer'], toStages: ['pending_review'] },
  pending_review: { allowedRoles: ['supervisor', 'hmis_staff', 'super_admin'], toStages: ['under_review'] },
  under_review: { allowedRoles: ['supervisor', 'hmis_staff', 'super_admin'], toStages: ['with_doctor', 'returned'] },
  with_doctor: { allowedRoles: ['doctor', 'super_admin'], toStages: ['completed', 'referred'] },
  returned: { allowedRoles: ['volunteer'], toStages: ['pending_review'] },
};

export function transitionStage(
  intakeId: string,
  toStage: IntakeStage,
  userId: string,
  userName: string,
  userRole: string,
  comments: string,
  extraUpdates?: Partial<PatientIntake>,
): PatientIntake {
  const all = getStore();
  const idx = all.findIndex(i => i.id === intakeId);
  if (idx === -1) throw new Error('Intake not found');

  const intake = all[idx];
  const rule = VALID_TRANSITIONS[intake.stage];
  if (!rule) throw new Error(`No transitions available from stage: ${intake.stage}`);
  if (!rule.allowedRoles.includes(userRole) && userRole !== 'super_admin') {
    throw new Error(`Role ${userRole} cannot transition from ${intake.stage}`);
  }
  if (!rule.toStages.includes(toStage)) {
    throw new Error(`Cannot transition from ${intake.stage} to ${toStage}`);
  }

  const transition: StageTransition = {
    id: crypto.randomUUID(),
    fromStage: intake.stage,
    toStage,
    userId,
    userName,
    userRole,
    comments,
    timestamp: new Date().toISOString(),
  };

  all[idx] = {
    ...intake,
    ...extraUpdates,
    stage: toStage,
    stageHistory: [...intake.stageHistory, transition],
    updatedAt: new Date().toISOString(),
  };
  setStore(all);
  return all[idx];
}

// === Auto-save for volunteer form ===

export function autoSaveIntake(data: any): void {
  localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
}

export function getAutoSavedIntake(): any | null {
  try {
    const data = localStorage.getItem(AUTO_SAVE_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

export function clearAutoSave(): void {
  localStorage.removeItem(AUTO_SAVE_KEY);
}

// === Stats ===

export function getIntakeStats() {
  const all = getStore();
  const today = new Date().toISOString().split('T')[0];
  const todayIntakes = all.filter(i => i.createdAt.startsWith(today));

  const byStage: Record<string, number> = {};
  all.forEach(i => { byStage[i.stage] = (byStage[i.stage] || 0) + 1; });

  return {
    total: all.length,
    today: todayIntakes.length,
    byStage,
    pendingReview: all.filter(i => i.stage === 'pending_review').length,
    withDoctor: all.filter(i => i.stage === 'with_doctor').length,
    completed: all.filter(i => i.stage === 'completed').length,
    referred: all.filter(i => i.stage === 'referred').length,
    returned: all.filter(i => i.stage === 'returned').length,
  };
}

// === Seed demo intakes ===

export function seedIntakes(): void {
  if (getStore().length > 0) return;
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const intakes: PatientIntake[] = [
    {
      id: 'intake-1', patientName: 'Ramesh Kumar', age: 45, gender: 'male',
      phone: '+91 98111 22233', address: 'Village Rithoj, Gurugram',
      chiefComplaint: 'Severe toothache in lower right molar',
      symptoms: 'Pain while eating, sensitivity to hot/cold, swelling',
      vitals: { bp: '130/85', temperature: '98.6', pulse: '78', weight: '72', height: '170' },
      medicalHistory: 'No significant medical history', currentMedications: 'None',
      volunteerNotes: 'Patient in visible discomfort, needs urgent dental attention',
      supervisorComments: 'Forwarded to Dr. Aishwarya for assessment',
      clinicalAssessment: '', prescription: null,
      stage: 'with_doctor',
      stageHistory: [
        { id: 's1', fromStage: 'draft', toStage: 'pending_review', userId: 'user-vol1', userName: 'Rahul Sharma', userRole: 'volunteer', comments: 'Form submitted', timestamp: yesterday },
        { id: 's2', fromStage: 'pending_review', toStage: 'under_review', userId: 'user-sup', userName: 'Dr. Vishal Garg', userRole: 'supervisor', comments: 'Reviewing', timestamp: yesterday },
        { id: 's3', fromStage: 'under_review', toStage: 'with_doctor', userId: 'user-sup', userName: 'Dr. Vishal Garg', userRole: 'supervisor', comments: 'Forwarded to Dr. Aishwarya', timestamp: now },
      ],
      assignedDoctorId: 'user-doc', assignedDoctorName: 'Dr. Aishwarya Rohatgi',
      campId: 'camp-1', campName: 'Gurugram Rural Camp',
      createdBy: 'user-vol1', createdByName: 'Rahul Sharma', createdByRole: 'volunteer',
      createdAt: yesterday, updatedAt: now,
    },
    {
      id: 'intake-2', patientName: 'Sunita Devi', age: 32, gender: 'female',
      phone: '+91 98222 33344', address: 'Village Badshahpur, Gurugram',
      chiefComplaint: 'Bleeding gums', symptoms: 'Gums bleed while brushing',
      vitals: { bp: '120/80', temperature: '98.4', pulse: '72', weight: '58', height: '155' },
      medicalHistory: 'None', currentMedications: 'None',
      volunteerNotes: 'Moderate gingivitis observed',
      supervisorComments: '', clinicalAssessment: '', prescription: null,
      stage: 'pending_review',
      stageHistory: [
        { id: 's4', fromStage: 'draft', toStage: 'pending_review', userId: 'user-vol1', userName: 'Rahul Sharma', userRole: 'volunteer', comments: 'Submitted', timestamp: now },
      ],
      assignedDoctorId: '', assignedDoctorName: '',
      campId: 'camp-1', campName: 'Gurugram Rural Camp',
      createdBy: 'user-vol1', createdByName: 'Rahul Sharma', createdByRole: 'volunteer',
      createdAt: now, updatedAt: now,
    },
    {
      id: 'intake-3', patientName: 'Mohan Singh', age: 58, gender: 'male',
      phone: '+91 98333 44455', address: 'Village Sohna, Gurugram',
      chiefComplaint: 'Loose teeth', symptoms: 'Multiple loose teeth, difficulty chewing',
      vitals: { bp: '145/92', temperature: '98.8', pulse: '82', weight: '80', height: '175' },
      medicalHistory: 'Diabetes Type 2, Hypertension', currentMedications: 'Metformin 500mg',
      volunteerNotes: 'Patient is a tobacco user. Requires urgent attention.',
      supervisorComments: 'Returned — please recheck BP and add tobacco usage details',
      clinicalAssessment: '', prescription: null,
      stage: 'returned',
      stageHistory: [
        { id: 's5', fromStage: 'draft', toStage: 'pending_review', userId: 'user-vol2', userName: 'Priya Patel', userRole: 'volunteer', comments: 'Submitted', timestamp: yesterday },
        { id: 's6', fromStage: 'pending_review', toStage: 'under_review', userId: 'user-sup', userName: 'Dr. Vishal Garg', userRole: 'supervisor', comments: 'Reviewing', timestamp: yesterday },
        { id: 's7', fromStage: 'under_review', toStage: 'returned', userId: 'user-sup', userName: 'Dr. Vishal Garg', userRole: 'supervisor', comments: 'Please recheck BP and add tobacco details', timestamp: now },
      ],
      assignedDoctorId: '', assignedDoctorName: '',
      campId: 'camp-1', campName: 'Gurugram Rural Camp',
      createdBy: 'user-vol2', createdByName: 'Priya Patel', createdByRole: 'volunteer',
      createdAt: yesterday, updatedAt: now,
    },
  ];
  setStore(intakes);
}
