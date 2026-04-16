import type { Legend } from '../db/schema.js';

/**
 * Builds the Soul system prompt for a legend — the cache-friendly identity
 * layer of the three-layer prompt stack.
 *
 * Sections:
 *  - Identity (name, age, occupation, location)
 *  - Personality (Big Five interpretation)
 *  - Writing style (typing style, post length)
 *  - Knowledge (expertise + gaps + tech savviness)
 *  - Personal details (life details)
 *  - What you never do
 */
export function buildSoulPrompt(legend: Legend): string {
  const sections = [
    identitySection(legend),
    personalitySection(legend),
    writingStyleSection(legend),
    knowledgeSection(legend),
    personalDetailsSection(legend),
    neverDoSection(legend),
  ].filter((s) => s.trim().length > 0);

  return sections.join('\n\n');
}

function identitySection(legend: Legend): string {
  const loc = legend.location as { city: string; state: string; country: string };
  const prof = legend.professional as {
    occupation: string;
    company: string;
    yearsExperience: number;
  };

  return [
    `You are ${legend.firstName} ${legend.lastName}, ${legend.age}, ${prof.occupation} in ${loc.city}, ${loc.state}.`,
    `${prof.yearsExperience} years in the trade. You work at ${prof.company}.`,
  ].join(' ');
}

function personalitySection(legend: Legend): string {
  const b = legend.bigFive as {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };

  const traits: string[] = [];

  // Openness
  if (b.openness >= 8) traits.push('curious and imaginative');
  else if (b.openness <= 3) traits.push('practical, prefers the tried-and-true');
  else traits.push('balanced between curiosity and convention');

  // Conscientiousness
  if (b.conscientiousness >= 8) traits.push('disciplined and organized');
  else if (b.conscientiousness <= 3) traits.push('spontaneous, sometimes disorganized');
  else traits.push('reasonably organized');

  // Extraversion
  if (b.extraversion >= 8) traits.push('outgoing and energetic');
  else if (b.extraversion <= 3) traits.push('reserved, prefers to listen');
  else traits.push('social but reflective');

  // Agreeableness
  if (b.agreeableness >= 8) traits.push('warm and agreeable');
  else if (b.agreeableness <= 3) traits.push("blunt, doesn't sugarcoat");
  else traits.push('fair-minded');

  // Neuroticism
  if (b.neuroticism >= 8) traits.push('easily stressed or frustrated');
  else if (b.neuroticism <= 3) traits.push('even-keeled, rarely rattled');
  else traits.push('usually composed');

  return `PERSONALITY: ${traits.join('. ')}.`;
}

function writingStyleSection(legend: Legend): string {
  const ts = legend.typingStyle as {
    capitalization: string;
    punctuation: string;
    commonTypos: string[];
    commonPhrases: string[];
    avoidedPhrases: string[];
    paragraphStyle: string;
    listStyle: string;
    usesEmojis: boolean;
    formality: number;
  };

  const lines = [
    'WRITING STYLE:',
    `- Capitalization: ${ts.capitalization}.`,
    `- Punctuation: ${ts.punctuation}.`,
    `- Paragraphs: ${ts.paragraphStyle}.`,
    `- Lists: ${ts.listStyle === 'never' ? 'never use bullet lists' : `${ts.listStyle} use bullet lists`}.`,
    `- Emojis: ${ts.usesEmojis ? 'occasional' : 'never'}.`,
    `- Formality: ${formalityLabel(ts.formality)} (${ts.formality}/10).`,
  ];

  if (ts.commonTypos.length > 0) {
    lines.push(`- Common typos (natural, leave in occasionally): ${ts.commonTypos.join(', ')}`);
  }
  if (ts.commonPhrases.length > 0) {
    lines.push(`- Common phrases: "${ts.commonPhrases.join('", "')}"`);
  }
  if (ts.avoidedPhrases.length > 0) {
    lines.push(`- Never use these words: ${ts.avoidedPhrases.join(', ')}`);
  }
  lines.push(`- Average post length: ${legend.averagePostLength}.`);

  return lines.join('\n');
}

function knowledgeSection(legend: Legend): string {
  const expertise = Array.isArray(legend.expertiseAreas) ? (legend.expertiseAreas as string[]) : [];
  const gaps = Array.isArray(legend.knowledgeGaps) ? (legend.knowledgeGaps as string[]) : [];

  const lines = ['KNOWLEDGE:'];
  lines.push(
    `- Tech savviness: ${techSavvinessLabel(legend.techSavviness)} (${legend.techSavviness}/10).`,
  );
  if (expertise.length > 0) {
    lines.push(`- Deep expertise: ${expertise.join(', ')}.`);
  }
  if (gaps.length > 0) {
    lines.push(`- Knowledge gaps (be honest about these): ${gaps.join(', ')}.`);
  }
  return lines.join('\n');
}

function personalDetailsSection(legend: Legend): string {
  const life = legend.lifeDetails as {
    maritalStatus: string;
    partnerName?: string;
    children?: number;
  };

  const bits: string[] = [];
  if (life.maritalStatus && life.maritalStatus !== 'single') {
    if (life.partnerName) {
      bits.push(`${life.maritalStatus === 'married' ? 'Spouse' : 'Partner'}: ${life.partnerName}`);
    } else {
      bits.push(`Relationship: ${life.maritalStatus}`);
    }
  }
  if (life.children) {
    bits.push(`Children: ${life.children}`);
  }
  const hobbies = Array.isArray(legend.hobbies) ? (legend.hobbies as string[]) : [];
  if (hobbies.length > 0) {
    bits.push(`Hobbies: ${hobbies.join(', ')}`);
  }

  if (bits.length === 0) return '';
  return `PERSONAL DETAILS:\n- ${bits.join('\n- ')}`;
}

function neverDoSection(legend: Legend): string {
  const neverDo = Array.isArray(legend.neverDo) ? (legend.neverDo as string[]) : [];
  if (neverDo.length === 0) return '';
  return `WHAT YOU NEVER DO:\n- ${neverDo.join('\n- ')}`;
}

function techSavvinessLabel(score: number): string {
  if (score <= 3) return 'low tech savviness; not a tech person';
  if (score >= 8) return 'highly tech-savvy; fluent in technical concepts';
  return 'moderate tech savviness; understands basics';
}

function formalityLabel(score: number): string {
  if (score <= 3) return 'casual';
  if (score >= 8) return 'formal';
  return 'conversational';
}
