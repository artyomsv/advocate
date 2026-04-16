import type { Legend, Product } from '../db/schema.js';

/**
 * Produces the Product Knowledge layer of the prompt — what this legend
 * knows about this product, filtered through their tech savviness and
 * framed with their personal relationship to it.
 */
export function filterProductKnowledge(product: Product, legend: Legend): string {
  const sections: string[] = [];

  // Header
  sections.push(
    `PRODUCT YOU USE: ${product.name}\n${product.description}${
      product.url ? ` (${product.url})` : ''
    }`,
  );

  // Value props
  const valueProps = (product.valueProps as string[]) ?? [];
  if (valueProps.length > 0) {
    sections.push(['What it does well:', ...valueProps.map((v) => `- ${v}`)].join('\n'));
  }

  // Pain points this product solves
  const painPoints = (product.painPoints as string[]) ?? [];
  if (painPoints.length > 0) {
    sections.push(['Problems it solves:', ...painPoints.map((p) => `- ${p}`)].join('\n'));
  }

  // Talking points (pre-approved ways to describe it)
  const talkingPoints = (product.talkingPoints as string[]) ?? [];
  if (talkingPoints.length > 0) {
    sections.push(
      [
        'Approved talking points (natural ways to mention it):',
        ...talkingPoints.map((t) => `- ${t}`),
      ].join('\n'),
    );
  }

  // Competitor comparisons
  const competitors =
    (product.competitorComparisons as { name: string; comparison: string }[] | null) ?? [];
  if (competitors.length > 0) {
    sections.push(
      [
        'Competitor comparisons (fair, factual only):',
        ...competitors.map((c) => `- vs ${c.name}: ${c.comparison}`),
      ].join('\n'),
    );
  }

  // Negative constraints
  const neverSay = (product.neverSay as string[] | null) ?? [];
  if (neverSay.length > 0) {
    sections.push(
      [
        'NEVER say these about the product (would sound like a shill):',
        ...neverSay.map((n) => `- "${n}"`),
      ].join('\n'),
    );
  }

  // Your personal relationship with it (from the legend)
  const rel = legend.productRelationship as {
    discoveryStory: string;
    usageDuration: string;
    satisfactionLevel: number;
    complaints: string[];
    useCase: string;
    alternativesConsidered: string[];
  };
  if (rel) {
    const relationshipLines = [
      'YOUR RELATIONSHIP WITH THE PRODUCT:',
      `- How you found it: ${rel.discoveryStory}`,
      `- How long you've used it: ${rel.usageDuration}`,
      `- Satisfaction (1-10): ${rel.satisfactionLevel}`,
      `- Your use case: ${rel.useCase}`,
    ];
    if (rel.complaints.length > 0) {
      relationshipLines.push(`- Your honest complaints: ${rel.complaints.join('; ')}`);
    }
    if (rel.alternativesConsidered.length > 0) {
      relationshipLines.push(
        `- Alternatives you tried/considered: ${rel.alternativesConsidered.join(', ')}`,
      );
    }
    sections.push(relationshipLines.join('\n'));
  }

  return sections.join('\n\n');
}
