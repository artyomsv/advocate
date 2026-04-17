import { describe, expect, it } from 'vitest';
import {
  buildApprovalKeyboard,
  decodeCallback,
  encodeCallback,
} from '../../src/notifications/telegram-inline.js';

describe('telegram-inline codec', () => {
  it('round-trips a valid approve callback', () => {
    const payload = {
      version: 'v1' as const,
      decision: 'approve' as const,
      contentPlanId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    expect(decodeCallback(encodeCallback(payload))).toEqual(payload);
  });

  it('rejects unknown version', () => {
    expect(decodeCallback('v2:approve:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeNull();
  });

  it('rejects unknown decision', () => {
    expect(decodeCallback('v1:maybe:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeNull();
  });

  it('rejects missing id', () => {
    expect(decodeCallback('v1:approve:')).toBeNull();
  });

  it('buildApprovalKeyboard produces two buttons under 64 bytes each', () => {
    const kb = buildApprovalKeyboard('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(kb).toHaveLength(1);
    expect(kb[0]).toHaveLength(2);
    for (const btn of kb[0] ?? []) {
      expect(btn.callback_data.length).toBeLessThan(64);
    }
  });
});
