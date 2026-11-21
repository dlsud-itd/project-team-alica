import { randomInt } from 'node:crypto';

/** Random digits per code: 10^10 possible codes. */
export const TICKET_CODE_RANDOM_DIGITS = 10;

/** Format of codes from {@link generateTicketCode}: 10 random digits + 1 check digit. */
export const TICKET_CODE_PATTERN = /^CHK-\d{11}$/;

/**
 * Luhn check digit for a string of digits (same scheme as card numbers).
 * It catches any single mistyped digit and most swapped neighbours.
 */
export function luhnCheckDigit(digits: string): string {
  let sum = 0;
  // Walk right to left, doubling every other digit starting with the rightmost.
  for (let i = digits.length - 1, double = true; i >= 0; i--, double = !double) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/** A cryptographically random ticket code such as `CHK-48213907752`. */
export function generateTicketCode(): string {
  let digits = '';
  for (let i = 0; i < TICKET_CODE_RANDOM_DIGITS; i++) {
    digits += String(randomInt(10));
  }
  return `CHK-${digits}${luhnCheckDigit(digits)}`;
}

/** True when the code has the CHK-########### format and a valid check digit. */
export function isValidTicketCode(code: string): boolean {
  if (!TICKET_CODE_PATTERN.test(code)) return false;
  const digits = code.slice(4);
  return luhnCheckDigit(digits.slice(0, -1)) === digits.slice(-1);
}
