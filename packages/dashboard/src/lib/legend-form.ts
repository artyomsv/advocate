/**
 * Shared types + default values for the legend create/edit form.
 * Mirrors packages/app/src/legends/validation.ts on the server.
 */

export type Maturity = 'lurking' | 'engaging' | 'established' | 'promoting';

export interface LegendFormValues {
  productId: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'non-binary';
  age: number;
  location: {
    city: string;
    state: string;
    country: string;
    timezone: string;
  };
  lifeDetails: {
    maritalStatus: 'single' | 'married' | 'divorced' | 'partner';
    children?: number;
  };
  professional: {
    occupation: string;
    company: string;
    industry: string;
    yearsExperience: number;
    education: string;
  };
  bigFive: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  techSavviness: number;
  typingStyle: {
    capitalization: 'proper' | 'lowercase' | 'mixed';
    punctuation: 'correct' | 'minimal' | 'excessive';
    commonTypos: string[];
    commonPhrases: string[];
    avoidedPhrases: string[];
    paragraphStyle: 'short' | 'walls_of_text' | 'varied';
    listStyle: 'never' | 'sometimes' | 'frequently';
    usesEmojis: boolean;
    formality: number;
  };
  activeHours: {
    start: number;
    end: number;
  };
  activeDays: number[];
  averagePostLength: 'short' | 'medium' | 'long';
  hobbies: string[];
  expertiseAreas: string[];
  knowledgeGaps: string[];
  productRelationship: {
    discoveryStory: string;
    usageDuration: string;
    satisfactionLevel: number;
    complaints: string[];
    useCase: string;
    alternativesConsidered: string[];
  };
  maturity: Maturity;
}

export function emptyLegendForm(productId: string): LegendFormValues {
  return {
    productId,
    firstName: '',
    lastName: '',
    gender: 'female',
    age: 30,
    location: { city: '', state: '', country: '', timezone: 'America/Chicago' },
    lifeDetails: { maritalStatus: 'single' },
    professional: {
      occupation: '',
      company: '',
      industry: '',
      yearsExperience: 5,
      education: '',
    },
    bigFive: {
      openness: 5,
      conscientiousness: 5,
      extraversion: 5,
      agreeableness: 5,
      neuroticism: 5,
    },
    techSavviness: 5,
    typingStyle: {
      capitalization: 'proper',
      punctuation: 'correct',
      commonTypos: [],
      commonPhrases: [],
      avoidedPhrases: [],
      paragraphStyle: 'varied',
      listStyle: 'sometimes',
      usesEmojis: false,
      formality: 5,
    },
    activeHours: { start: 8, end: 22 },
    activeDays: [1, 2, 3, 4, 5],
    averagePostLength: 'medium',
    hobbies: [],
    expertiseAreas: [],
    knowledgeGaps: [],
    productRelationship: {
      discoveryStory: '',
      usageDuration: '',
      satisfactionLevel: 7,
      complaints: [],
      useCase: '',
      alternativesConsidered: [],
    },
    maturity: 'lurking',
  };
}

export function validateStep(step: number, v: LegendFormValues): string | null {
  if (step === 0) {
    if (!v.productId) return 'Product is required';
    if (!v.firstName.trim()) return 'First name is required';
    if (!v.lastName.trim()) return 'Last name is required';
    if (!v.location.city.trim() || !v.location.country.trim())
      return 'City and country are required';
    if (v.age < 18 || v.age > 120) return 'Age must be 18-120';
  }
  if (step === 1) {
    const bf = v.bigFive;
    for (const [k, val] of Object.entries(bf)) {
      if (val < 1 || val > 10) return `Big Five ${k} must be 1-10`;
    }
  }
  if (step === 2) {
    if (!v.professional.occupation.trim()) return 'Occupation is required';
    if (!v.professional.company.trim()) return 'Company is required';
    if (!v.professional.industry.trim()) return 'Industry is required';
    if (!v.professional.education.trim()) return 'Education is required';
    if (v.hobbies.filter(Boolean).length === 0) return 'At least one hobby';
    if (v.expertiseAreas.filter(Boolean).length === 0) return 'At least one expertise area';
  }
  if (step === 3) {
    const pr = v.productRelationship;
    if (!pr.discoveryStory.trim()) return 'Discovery story is required';
    if (!pr.usageDuration.trim()) return 'Usage duration is required';
    if (!pr.useCase.trim()) return 'Use case is required';
  }
  return null;
}
