// CMS Content Storage using localStorage

export interface HeroContent {
  badge: string;
  title: string;
  highlight: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
}

export interface AboutContent {
  badge: string;
  title: string;
  description: string;
  vision: string;
  mission: string;
}

export interface ProgramItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  outcomes: string[];
}

export interface ProgramsContent {
  badge: string;
  title: string;
  description: string;
  programs: ProgramItem[];
}

export interface ImpactStat {
  id: string;
  value: string;
  label: string;
  description: string;
}

export interface ImpactContent {
  badge: string;
  title: string;
  description: string;
  stats: ImpactStat[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  title: string;
  credentials: string;
  initials: string;
  linkedin: string;
}

export interface TeamContent {
  badge: string;
  title: string;
  description: string;
  members: TeamMember[];
}

export interface ContactInfo {
  icon: string;
  title: string;
  details: string[];
}

export interface OperationArea {
  name: string;
  districts: number;
}

export interface ContactContent {
  badge: string;
  title: string;
  description: string;
  contactInfo: ContactInfo[];
  operationAreas: OperationArea[];
}

export interface CTAContent {
  badge: string;
  title: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
}

export interface CMSContent {
  hero: HeroContent;
  about: AboutContent;
  programs: ProgramsContent;
  impact: ImpactContent;
  team: TeamContent;
  contact: ContactContent;
  cta: CTAContent;
}

const CMS_KEY = 'saathi_cms_content';

const defaultContent: CMSContent = {
  hero: {
    badge: 'Taking Oral Healthcare to the Last Mile',
    title: 'Healthy Smiles for',
    highlight: 'Every Child',
    description: 'We are a group of dedicated dental professionals committed to providing quality dental care to underserved communities. Through mobile dental camps, school programs, and community outreach, we\'re building a healthier India—one smile at a time.',
    primaryCta: 'Join Our Mission',
    secondaryCta: 'Learn More',
  },
  about: {
    badge: 'Who We Are',
    title: 'A Movement for Oral Health Equity',
    description: 'Saathi Cares was born from a simple observation: millions of Indians, especially in rural and underserved urban areas, lack access to basic dental care. What started as weekend dental camps has grown into a comprehensive oral health initiative.',
    vision: 'A world where everyone, regardless of their socioeconomic status, has access to quality oral healthcare.',
    mission: 'To bridge the oral health gap by providing accessible, affordable, and quality dental care to underserved communities across India.',
  },
  programs: {
    badge: 'What We Do',
    title: 'Our Approach to Lasting Impact',
    description: 'We believe in sustainable change. Our programs are designed not just to treat, but to prevent, educate, and empower communities to take charge of their oral health.',
    programs: [
      {
        id: '1',
        icon: 'Stethoscope',
        title: 'Mobile Dental Camps',
        description: 'We bring fully-equipped dental care directly to remote villages and urban slums, ensuring no one is left behind.',
        outcomes: ['5,000+ patients treated annually', 'Free consultations and treatments', 'Follow-up care coordination'],
      },
      {
        id: '2',
        icon: 'GraduationCap',
        title: 'School Health Programs',
        description: 'Partnering with schools to instill lifelong oral hygiene habits in children through education and regular check-ups.',
        outcomes: ['200+ schools covered', 'Interactive hygiene workshops', 'Free dental kits distribution'],
      },
      {
        id: '3',
        icon: 'Users',
        title: 'Community Training',
        description: 'Training local health workers and volunteers to become oral health champions in their communities.',
        outcomes: ['150+ health workers trained', 'Sustainable local capacity', 'Ongoing mentorship support'],
      },
    ],
  },
  impact: {
    badge: 'Our Impact',
    title: 'Numbers That Tell Our Story',
    description: 'Every statistic represents real lives changed, real smiles restored, and real communities empowered.',
    stats: [
      { id: '1', value: '25,000+', label: 'Lives Touched', description: 'Patients treated across our programs' },
      { id: '2', value: '45+', label: 'Districts Covered', description: 'Geographic reach across 5 states' },
      { id: '3', value: '200+', label: 'Schools Partnered', description: 'Building healthy habits early' },
      { id: '4', value: '150+', label: 'Health Workers', description: 'Trained as oral health champions' },
    ],
  },
  team: {
    badge: 'Our People',
    title: 'Meet Our Team',
    description: 'A dedicated group of professionals united by a common purpose: bringing quality oral healthcare to those who need it most.',
    members: [
      {
        id: '1',
        name: 'Dr. Aishwarya Rohatgi',
        role: 'Management',
        title: 'Dentist and Public Health Professional',
        credentials: 'MPH, IIPH Delhi, PHFI | BDS, MCODS Manipal',
        initials: 'AR',
        linkedin: 'https://www.linkedin.com/in/aishwarya-rohatgi',
      },
      {
        id: '2',
        name: 'Dr. Vishal Garg',
        role: 'Operations',
        title: 'Dental Practitioner and Clinical Scientist',
        credentials: 'PhD Scholar, ICMR Delhi | BDS, MAIDS Delhi',
        initials: 'VG',
        linkedin: 'https://www.linkedin.com/in/vishal-garg',
      },
      {
        id: '3',
        name: 'Himanshu Singh',
        role: 'Organization Development',
        title: 'Generalist and Founder, Saathi Ventures',
        credentials: 'MiM, Lunds Universitet Sweden | BE, PEC University of Technology',
        initials: 'HS',
        linkedin: 'https://www.linkedin.com/in/himanshu-singh',
      },
      {
        id: '4',
        name: 'Abhinav Goyal',
        role: 'Technology',
        title: 'Tech Lead — System Architect & AI Engineer',
        credentials: 'B.Tech + MBA',
        initials: 'AG',
        linkedin: 'https://www.linkedin.com/in/abhinavg-oyal',
      },
    ],
  },
  contact: {
    badge: 'Get In Touch',
    title: "Let's Work Together",
    description: "Whether you want to partner with us, volunteer, or learn more about our work, we'd love to hear from you. Reach out and let's create impact together.",
    contactInfo: [
      { icon: 'MapPin', title: 'Office Address', details: ['Saathi Ventures Foundation', 'Sector 15, Gurugram', 'Haryana 122001, India'] },
      { icon: 'Phone', title: 'Phone', details: ['+91 98765 43210', '+91 11 4567 8900'] },
      { icon: 'Mail', title: 'Email', details: ['info@saathiventures.com', 'support@saathiventures.com'] },
      { icon: 'Clock', title: 'Working Hours', details: ['Monday - Friday: 9:00 AM - 6:00 PM', 'Saturday: 10:00 AM - 2:00 PM'] },
    ],
    operationAreas: [
      { name: 'Haryana', districts: 12 },
      { name: 'Rajasthan', districts: 8 },
      { name: 'Uttar Pradesh', districts: 15 },
      { name: 'Madhya Pradesh', districts: 6 },
      { name: 'Delhi NCR', districts: 4 },
    ],
  },
  cta: {
    badge: 'Join Us',
    title: 'Be Part of the Change',
    description: "Every contribution, whether time, expertise, or resources, helps us reach more communities and transform more lives. Together, we can build a healthier India.",
    primaryCta: 'Donate Now',
    secondaryCta: 'Become a Partner',
  },
};

export function getCMSContent(): CMSContent {
  try {
    const data = localStorage.getItem(CMS_KEY);
    if (data) {
      return { ...defaultContent, ...JSON.parse(data) };
    }
    return defaultContent;
  } catch {
    return defaultContent;
  }
}

export function saveCMSContent(content: Partial<CMSContent>): void {
  const current = getCMSContent();
  const updated = { ...current, ...content };
  localStorage.setItem(CMS_KEY, JSON.stringify(updated));
}

export function resetCMSContent(): void {
  localStorage.removeItem(CMS_KEY);
}

export function getDefaultContent(): CMSContent {
  return defaultContent;
}
