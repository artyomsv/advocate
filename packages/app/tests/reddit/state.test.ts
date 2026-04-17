import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, newNonce } from '../../src/reddit/state.js';

const SECRET = 'test-secret-1234567890';

describe('state codec', () => {
  it('round-trips a valid payload', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: newNonce() };
    expect(decodeState(encodeState(p, SECRET), SECRET)).toEqual(p);
  });

  it('rejects tampered state', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: 'abc' };
    const encoded = encodeState(p, SECRET);
    const tampered = `${encoded.slice(0, -3)}xyz`;
    expect(decodeState(tampered, SECRET)).toBeNull();
  });

  it('rejects state signed with a different secret', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: 'abc' };
    const encoded = encodeState(p, SECRET);
    expect(decodeState(encoded, 'other-secret')).toBeNull();
  });

  it('rejects malformed state', () => {
    expect(decodeState('only-two-parts', SECRET)).toBeNull();
  });
});
