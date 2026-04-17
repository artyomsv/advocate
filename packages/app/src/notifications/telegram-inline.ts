/**
 * Callback data has a 64-byte Telegram limit. Encoding format:
 *   v1:<decision>:<contentPlanId>
 * A UUID v4 is 36 chars; `v1:approve:` is 11 chars → total 47. Safely under.
 */
export interface CallbackPayload {
  version: 'v1';
  decision: 'approve' | 'reject';
  contentPlanId: string;
}

export function encodeCallback(p: CallbackPayload): string {
  return `${p.version}:${p.decision}:${p.contentPlanId}`;
}

export function decodeCallback(raw: string): CallbackPayload | null {
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [version, decision, contentPlanId] = parts;
  if (version !== 'v1') return null;
  if (decision !== 'approve' && decision !== 'reject') return null;
  if (!contentPlanId || contentPlanId.length < 10) return null;
  return { version, decision, contentPlanId };
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export function buildApprovalKeyboard(contentPlanId: string): InlineKeyboardButton[][] {
  return [
    [
      {
        text: '✅ Approve',
        callback_data: encodeCallback({ version: 'v1', decision: 'approve', contentPlanId }),
      },
      {
        text: '❌ Reject',
        callback_data: encodeCallback({ version: 'v1', decision: 'reject', contentPlanId }),
      },
    ],
  ];
}
