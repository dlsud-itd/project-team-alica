import { describe, it, expect } from 'vitest';
import {
  TICKET_CODE_PATTERN,
  generateTicketCode,
  isValidTicketCode,
  luhnCheckDigit,
} from './ticket-code.js';

describe('luhnCheckDigit', () => {
  it('matches known Luhn values', () => {
    expect(luhnCheckDigit('7992739871')).toBe('3');
    expect(luhnCheckDigit('0000000000')).toBe('0');
  });
});

describe('generateTicketCode', () => {
  it('produces CHK- followed by 11 digits', () => {
    const code = generateTicketCode();
    expect(code).toMatch(TICKET_CODE_PATTERN);
    expect(code).toHaveLength(15);
  });

  it('always ends in a valid check digit', () => {
    for (let i = 0; i < 1_000; i++) {
      expect(isValidTicketCode(generateTicketCode())).toBe(true);
    }
  });

  it('does not repeat across many codes', () => {
    const codes = new Set(Array.from({ length: 10_000 }, generateTicketCode));
    expect(codes.size).toBe(10_000);
  });
});

describe('isValidTicketCode', () => {
  const code = 'CHK-79927398713';

  it('accepts a correct code', () => {
    expect(isValidTicketCode(code)).toBe(true);
  });

  it('rejects any single mistyped digit', () => {
    for (let pos = 4; pos < code.length; pos++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === code[pos]) continue;
        const typo = code.slice(0, pos) + d + code.slice(pos + 1);
        expect(isValidTicketCode(typo)).toBe(false);
      }
    }
  });

  it('rejects other formats', () => {
    expect(isValidTicketCode('CHK-2026-9812A')).toBe(false);
    expect(isValidTicketCode('CHK-4049FE72-9BE3-402D-9E71-490F4517F0F8')).toBe(false);
    expect(isValidTicketCode('CHK-7992739871')).toBe(false);
  });
});
