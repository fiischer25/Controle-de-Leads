export type LeadStatus = 'Em Andamento' | 'Fechado' | 'Perdido';
export type ProjectType = 'Residencial' | 'Comercial' | 'Reforma' | 'Paisagismo';
export type ContactOrigin = 'Site' | 'Instagram' | 'Facebook' | 'Google Ads' | 'Indicação' | 'WhatsApp';
export type FamilyStructure = 'Solteiro(a)' | 'Casal sem filhos' | 'Casal com filhos' | 'Família monoparental' | 'Outros';
export type AgeRange = '18-25' | '26-35' | '36-45' | '46-55' | '56-65' | '65+';

export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  city: string;
  familyStructure: FamilyStructure;
  ageRange: AgeRange;
  profession: string;
  projectType: ProjectType;
  budgetValue: number;
  areaM2: number;
  status: LeadStatus;
  contactOrigin: ContactOrigin;
  meetingHeld: boolean;
  proposalSent: boolean;
  createdAt: string;
  notes: string;
}

export interface Metrics {
  totalLeads: number;
  closedLeads: number;
  lostLeads: number;
  inProgressLeads: number;
  closedValue: number;
  totalValue: number;
  conversionRate: number;
  goalProgress: number;
  originStats: Record<string, { count: number; value: number }>;
  meetingStats: { held: number; pending: number };
  proposalStats: { sent: number; pending: number };
  cityStats: Record<string, { count: number; value: number }>;
  ageStats: Record<string, { count: number; value: number }>;
  familyStats: Record<string, { count: number; value: number }>;
}