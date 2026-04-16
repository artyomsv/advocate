import type { PromptContext } from './types.js';

export function buildContextBlock(context: PromptContext): string {
  const sections: string[] = [];

  // Task (always present)
  const taskLines = [
    'CURRENT TASK:',
    `- Type: ${context.task.type}`,
    `- Promotion level: ${context.task.promotionLevel}/10`,
    `- Instructions: ${context.task.instructions}`,
  ];
  if (context.task.promotionLevel === 0) {
    taskLines.push('- CRITICAL: Do not mention the product in this reply. Pure value only.');
  } else if (context.task.promotionLevel <= 3) {
    taskLines.push('- Product mention only if the thread genuinely calls for it.');
  }
  sections.push(taskLines.join('\n'));

  // Platform + community
  if (context.platform || context.community) {
    const lines = ['WHERE YOU ARE POSTING:'];
    if (context.platform) lines.push(`- Platform: ${context.platform.name}`);
    if (context.community) {
      lines.push(`- Community: ${context.community.name}`);
      if (context.community.cultureSummary) {
        lines.push(`- Culture: ${context.community.cultureSummary}`);
      }
      if (context.community.rulesSummary) {
        lines.push(`- Rules: ${context.community.rulesSummary}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // Thread
  if (context.thread) {
    const lines = ['THREAD YOU ARE REPLYING TO:', `- Summary: ${context.thread.summary}`];
    if (context.thread.url) lines.push(`- URL: ${context.thread.url}`);
    sections.push(lines.join('\n'));
  }

  // Memories
  if (context.relevantMemories && context.relevantMemories.length > 0) {
    sections.push(
      [
        'YOUR MEMORY (lessons from prior interactions):',
        ...context.relevantMemories.map((m) => `- ${m}`),
      ].join('\n'),
    );
  }

  // Recent activity
  if (context.recentActivity && context.recentActivity.length > 0) {
    sections.push(
      [
        "YOUR RECENT ACTIVITY (so you don't repeat yourself):",
        ...context.recentActivity.map((a) => `- ${a}`),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}
