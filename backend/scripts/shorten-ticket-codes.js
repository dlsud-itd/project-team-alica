/**
 * One-off: replaces long UUID ticket codes (CHK-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX)
 * with short ones (CHK-###########: 10 random digits + a Luhn check digit).
 *
 *   npm run db:shorten-ticket-codes            # dry run: prints the changes, writes nothing
 *   npm run db:shorten-ticket-codes -- --apply # writes the changes
 *
 * For each ticket it updates, in one transaction:
 *   - tickets.ticketCode
 *   - tickets.qrPayload (when it held the old code)
 *   - attendance_logs.ticketCode rows that recorded the old code
 *
 * Old QR images (downloaded PNGs, invitation emails) encode the old code, so they
 * stop scanning once this runs. Attendees get the new QR from My Hub.
 */
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Keep in sync with src/common/ticket-code.ts.
const TICKET_CODE_RANDOM_DIGITS = 10;

const LONG_CODE_PATTERN =
  /^CHK-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

function luhnCheckDigit(digits) {
  let sum = 0;
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

function generateTicketCode() {
  let digits = '';
  for (let i = 0; i < TICKET_CODE_RANDOM_DIGITS; i++) {
    digits += String(randomInt(10));
  }
  return `CHK-${digits}${luhnCheckDigit(digits)}`;
}

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const tickets = (
    await prisma.ticket.findMany({
      where: { ticketCode: { startsWith: 'CHK-' } },
      select: { id: true, ticketCode: true, qrPayload: true, email: true },
      orderBy: { createdAt: 'asc' },
    })
  ).filter((t) => LONG_CODE_PATTERN.test(t.ticketCode));

  if (tickets.length === 0) {
    console.log('No long ticket codes found. Nothing to do.');
    return;
  }

  const taken = new Set(
    (await prisma.ticket.findMany({ select: { ticketCode: true } })).map((t) =>
      t.ticketCode.toUpperCase(),
    ),
  );
  const nextCode = () => {
    let code;
    do code = generateTicketCode();
    while (taken.has(code));
    taken.add(code);
    return code;
  };

  console.log(
    `${apply ? 'Updating' : 'Dry run:'} ${tickets.length} ticket(s) with long codes\n`,
  );
  console.log('email,old_code,new_code,scan_logs');

  let updated = 0;
  for (const ticket of tickets) {
    const newCode = nextCode();
    const logCount = await prisma.attendanceLog.count({
      where: { ticketCode: ticket.ticketCode },
    });
    console.log(`${ticket.email},${ticket.ticketCode},${newCode},${logCount}`);
    if (!apply) continue;

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          ticketCode: newCode,
          ...(ticket.qrPayload === ticket.ticketCode ? { qrPayload: newCode } : {}),
        },
      }),
      prisma.attendanceLog.updateMany({
        where: { ticketCode: ticket.ticketCode },
        data: { ticketCode: newCode },
      }),
    ]);
    updated++;
  }

  console.log(
    apply
      ? `\nDone: ${updated} ticket(s) updated.`
      : '\nNothing written. Re-run with --apply to save these changes.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
