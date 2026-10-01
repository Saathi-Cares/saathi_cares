/**
 * Static site content for the public pages until the CMS (PLAN.md Phase 4) replaces it.
 * Editing this file and redeploying is currently the only way to change public copy.
 * Every component, the page metadata and the JSON-LD in app/layout.tsx read from here.
 */

import type { ProblemIconName, ProgramIconName } from '@/components/sections/icons';

export interface OrgContent {
  name: string;
  legalName: string;
  tagline: string;
  headline: string;
  summary: string;
  metaDescription: string;
  structuredDescription: string;
  parent: string;
  url: string;
  email: string;
  address: {
    lines: string[];
    locality: string;
    region: string;
    postalCode: string;
    countryCode: string;
  };
  socials: { name: 'LinkedIn' | 'Twitter'; href: string }[];
}

export interface NavLink {
  name: string;
  href: string;
}

export interface HeroContent {
  badge: string;
  title: string;
  highlight: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
}

export interface ProblemStat {
  id: string;
  icon: ProblemIconName;
  value: string;
  label: string;
  description: string;
}

export interface ProblemContent {
  badge: string;
  heading: string;
  description: string;
  stats: ProblemStat[];
  quote: { text: string; author: string };
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
  icon: ProgramIconName;
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
  linkedin?: string;
}

export interface TeamContent {
  badge: string;
  title: string;
  description: string;
  members: TeamMember[];
}

export interface ContactInfo {
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

export interface SiteContent {
  hero: HeroContent;
  problem: ProblemContent;
  about: AboutContent;
  programs: ProgramsContent;
  impact: ImpactContent;
  team: TeamContent;
  contact: ContactContent;
  cta: CTAContent;
}

// Contact details are carried over from the prototype and await confirmation by the organisation (README).
// No phone number is published until the organisation supplies a real one.
export const org: OrgContent = {
  name: 'Saathi Cares',
  legalName: 'SHC Foundation',
  tagline: 'Oral Health for All',
  headline: 'Taking Oral Healthcare to the Last Mile',
  metaDescription:
    'Saathi Cares by SHC Foundation provides free dental camps, school oral health programs, and community outreach to underserved communities across India. Join our mission for oral health equity.',
  structuredDescription:
    'Taking oral healthcare to the last mile: free dental camps and programs for underserved communities across India.',
  summary:
    'Taking oral healthcare to the last mile. We are a group of dedicated dental professionals committed to providing quality dental care to underserved communities across India.',
  parent: 'Saathi Ventures',
  url: 'https://saathicares.org',
  email: 'cares@saathiventures.com',
  address: {
    lines: ['Saathi Ventures Foundation', 'Sector 15, Gurugram', 'Haryana 122001, India'],
    locality: 'Gurugram',
    region: 'Haryana',
    postalCode: '122001',
    countryCode: 'IN',
  },
  socials: [
    { name: 'LinkedIn', href: 'https://www.linkedin.com/company/saathiventures' },
    { name: 'Twitter', href: 'https://twitter.com/saathiventures' },
  ],
};

// One list for the Header and the Footer. `/#id` links point at section ids on the home page.
export const navLinks: NavLink[] = [
  { name: 'Home', href: '/#home' },
  { name: 'About', href: '/#about' },
  { name: 'Our Work', href: '/#programs' },
  { name: 'Impact', href: '/#impact' },
  { name: 'Team', href: '/#team' },
  { name: 'Contact', href: '/contact' },
];

export const siteContent: SiteContent = {
  hero: {
    badge: 'Taking Oral Healthcare to the Last Mile',
    title: 'Healthy Smiles for',
    highlight: 'Every Child',
    description:
      "We are a group of dedicated dental professionals committed to providing quality dental care to underserved communities. Through mobile dental camps, school programs, and community outreach, we're building a healthier India—one smile at a time.",
    primaryCta: 'Join Our Mission',
    secondaryCta: 'Learn More',
  },
  // The statistics below have no cited source yet; the owner's sources are pending (README).
  problem: {
    badge: 'The Challenge',
    heading: 'What Are We Solving?',
    description:
      'Oral health is the mirror to general health. In a country of 1.3 billion, more than 90% of healthcare facilities are concentrated in urban areas, leaving rural communities underserved.',
    stats: [
      {
        id: '1',
        icon: 'Globe',
        value: '3.5B',
        label: 'Worldwide',
        description: 'People affected by oral diseases worldwide',
      },
      {
        id: '2',
        icon: 'Users',
        value: '50%',
        label: 'Global population',
        description: 'Of global population suffers from oral health issues',
      },
      {
        id: '3',
        icon: 'AlertCircle',
        value: '27%',
        label: 'Tobacco and cancer',
        description: 'Of cancers in India linked to tobacco use',
      },
      {
        id: '4',
        icon: 'Skull',
        value: '50%',
        label: 'Oral cancer',
        description: 'Of oral cancer patients in India die within a year',
      },
    ],
    quote: {
      text: 'Injustice anywhere is a threat to justice everywhere. We are caught in an inescapable network of mutuality, tied in a single garment of destiny.',
      author: 'Martin Luther King Jr.',
    },
  },
  about: {
    badge: 'Who We Are',
    title: 'A Movement for Oral Health Equity',
    description:
      'Saathi Cares was born from a simple observation: millions of Indians, especially in rural and underserved urban areas, lack access to basic dental care. What started as weekend dental camps has grown into a comprehensive oral health initiative.',
    vision:
      'A world where everyone, regardless of their socioeconomic status, has access to quality oral healthcare.',
    mission:
      'To bridge the oral health gap by providing accessible, affordable, and quality dental care to underserved communities across India.',
  },
  programs: {
    badge: 'What We Do',
    title: 'Our Approach to Lasting Impact',
    description:
      'We believe in sustainable change. Our programs are designed not just to treat, but to prevent, educate, and empower communities to take charge of their oral health.',
    programs: [
      {
        id: '1',
        icon: 'Stethoscope',
        title: 'Mobile Dental Camps',
        description:
          'We bring fully-equipped dental care directly to remote villages and urban slums, ensuring no one is left behind.',
        outcomes: [
          '5,000+ patients treated annually',
          'Free consultations and treatments',
          'Follow-up care coordination',
        ],
      },
      {
        id: '2',
        icon: 'GraduationCap',
        title: 'School Health Programs',
        description:
          'Partnering with schools to instill lifelong oral hygiene habits in children through education and regular check-ups.',
        outcomes: ['200+ schools covered', 'Interactive hygiene workshops', 'Free dental kits distribution'],
      },
      {
        id: '3',
        icon: 'Users',
        title: 'Community Training',
        description:
          'Training local health workers and volunteers to become oral health champions in their communities.',
        outcomes: ['150+ health workers trained', 'Sustainable local capacity', 'Ongoing mentorship support'],
      },
    ],
  },
  impact: {
    badge: 'Our Impact',
    title: 'Numbers That Tell Our Story',
    description:
      'Every statistic represents real lives changed, real smiles restored, and real communities empowered.',
    stats: [
      {
        id: '1',
        value: '25,000+',
        label: 'Lives Touched',
        description: 'Patients treated across our programs',
      },
      { id: '2', value: '45+', label: 'Districts Covered', description: 'Geographic reach across 5 states' },
      { id: '3', value: '200+', label: 'Schools Partnered', description: 'Building healthy habits early' },
      { id: '4', value: '150+', label: 'Health Workers', description: 'Trained as oral health champions' },
    ],
  },
  team: {
    badge: 'Our People',
    title: 'Meet Our Team',
    description:
      'A dedicated group of professionals united by a common purpose: bringing quality oral healthcare to those who need it most.',
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
    description:
      "Whether you want to partner with us, volunteer, or learn more about our work, we'd love to hear from you. Reach out and let's create impact together.",
    contactInfo: [
      {
        title: 'Working Hours',
        details: ['Monday - Friday: 9:00 AM - 6:00 PM', 'Saturday: 10:00 AM - 2:00 PM'],
      },
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
    description:
      'Every contribution, whether time, expertise, or resources, helps us reach more communities and transform more lives. Together, we can build a healthier India.',
    primaryCta: 'Donate Now',
    secondaryCta: 'Become a Partner',
  },
};
