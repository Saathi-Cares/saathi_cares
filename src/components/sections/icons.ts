import { AlertCircle, Globe, GraduationCap, Skull, Stethoscope, Users } from 'lucide-react';

// Content in src/content/site.ts names an icon by key; the type makes a misspelt key a compile error.
export const programIcons = { Stethoscope, GraduationCap, Users };
export type ProgramIconName = keyof typeof programIcons;

export const problemIcons = { Globe, Users, AlertCircle, Skull };
export type ProblemIconName = keyof typeof problemIcons;
