export const SECRET_CATEGORIES = {
  reddit: [
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_REDIRECT_URI',
    'REDDIT_USER_AGENT',
  ],
  llm: [
    'ANTHROPIC_API_KEY',
    'GOOGLE_AI_API_KEY',
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'QWEN_API_KEY',
  ],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID'],
} as const;

export type SecretCategory = keyof typeof SECRET_CATEGORIES;

export function isKnownKey(category: SecretCategory, key: string): boolean {
  return (SECRET_CATEGORIES[category] as readonly string[]).includes(key);
}
