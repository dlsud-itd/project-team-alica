import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventApprovalStatus, TicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsService } from './events.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import { GuestInvitationMailer } from './guest-invitation-mailer.service.js';

const ORGANIZER: UserSummaryDto = {
  id: 'usr-org',
  email: 'organizer@alica.ph',
  fullName: 'Campus Organizer',
  role: 'ORGANIZER',
};

const ADMIN: UserSummaryDto = {
  id: 'usr-admin',
  email: 'admin@dlsud.edu.ph',
  fullName: 'System Administrator',
  role: 'ADMIN',
};

const futureIso = (daysAhead: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const dbEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  title: 'Tech Summit',
  slug: 'tech-summit',
  description: null,
  venueName: 'Gymnasium',
  startDate: new Date(futureIso(10, 9)),
  endDate: new Date(futureIso(10, 17)),
  capacity: 100,
  allowWalkIns: false,
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  approvalStatus: EventApprovalStatus.PENDING,
  reviewNotes: null,
  reviewedAt: null,
  reviewedById: null,
  organizerId: 'usr-org',
  ...overrides,
});

describe('EventsService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  let service: EventsService;
  let prisma: {
    event: Record<string, ReturnType<typeof vi.fn>>;
    ticket: Record<string, ReturnType<typeof vi.fn>>;
    user: Record<string, ReturnType<typeof vi.fn>>;
  };
  let invitationMailer: {
    assertConfigured: ReturnType<typeof vi.fn>;
    sendInvitation: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      event: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      ticket: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };
    invitationMailer = {
      assertConfigured: vi.fn().mockResolvedValue(undefined),
      sendInvitation: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GuestInvitationMailer, useValue: invitationMailer },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('importGuestUsers', () => {
    const csv = [
      'First Name,Last Name,Email,Affiliation',
      'Alex,Guest,alex@example.org,CS Department',
      'Sam,Guest,sam@example.org,',
    ].join('\n');

    beforeEach(() => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: data.id ?? randomUUID(),
          email: data.email,
          fullName: data.fullName,
          tickets: [
            {
              id: 'ticket-created',
              ticketCode: data.tickets.create.ticketCode,
            },
          ],
        }),
      );
    });

    it('creates distinct attendee credentials and returns them only in opted-in test mode', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('GUEST_IMPORT_DEBUG_CREDENTIALS', 'true');

      const result = await service.importGuestUsers(
        ORGANIZER,
        'evt-1',
        { originalname: 'guests.csv', buffer: Buffer.from(csv) },
        'true',
      );

      expect(result.summary).toEqual({
        created: 2,
        skipped: 0,
        emailFailures: 0,
      });
      expect(result.credentials).toHaveLength(2);
      expect(result.credentials?.[0].temporaryPassword).not.toBe(
        result.credentials?.[1].temporaryPassword,
      );
      expect(
        result.credentials?.every(
          ({ temporaryPassword }) => temporaryPassword.length === 10,
        ),
      ).toBe(true);

      const { data: firstData } = prisma.user.create.mock.calls[0][0];
      expect(firstData.id).toBeUndefined();
      expect(result.created[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(firstData.role).toBe('ATTENDEE');
      expect(firstData.studentId).toBeNull();
      expect(firstData.mustChangePassword).toBe(true);
      expect(firstData.affiliation).toBe('CS Department');
      expect(firstData.tickets.create).toMatchObject({
        firstName: 'Alex',
        lastName: 'Guest',
        email: 'alex@example.org',
        studentId: null,
        affiliation: 'CS Department',
        ticketType: 'REGULAR',
        status: 'REGISTERED',
        event: { connect: { id: 'evt-1' } },
      });
      expect(firstData.tickets.create.ticketCode).toMatch(/^CHK-/);
      expect(firstData.tickets.create.qrPayload).toBe(
        firstData.tickets.create.ticketCode,
      );
      expect(result.created[0].ticketId).toBe('ticket-created');
      expect(
        await bcrypt.compare(
          result.credentials![0].temporaryPassword,
          firstData.passwordHash,
        ),
      ).toBe(true);
      expect(prisma.user.create.mock.calls[1][0].data.affiliation).toBe(
        'Guest / Imported Attendee',
      );
      expect(invitationMailer.sendInvitation).toHaveBeenCalledTimes(2);
      expect(invitationMailer.sendInvitation.mock.calls[0][0].ticketCode).toBe(
        firstData.tickets.create.ticketCode,
      );
    });

    it('does not disclose passwords unless explicitly enabled by the server', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('GUEST_IMPORT_DEBUG_CREDENTIALS', 'false');

      await expect(
        service.importGuestUsers(
          ORGANIZER,
          'evt-1',
          { originalname: 'guests.csv', buffer: Buffer.from(csv) },
          true,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('reports invalid rows and duplicate emails without creating them', async () => {
      const file = Buffer.from(
        [
          'First Name,Last Name,Email',
          'Alex,Guest,alex@example.org',
          'Another,Name,alex@example.org',
          'Invalid,Email,bad-address',
          'Existing,Guest,existing@example.org',
        ].join('\n'),
      );
      prisma.user.findMany.mockResolvedValue([
        { email: 'existing@example.org' },
      ]);

      const result = await service.importGuestUsers(ORGANIZER, 'evt-1', {
        originalname: 'guests.csv',
        buffer: file,
      });

      expect(result.summary).toEqual({
        created: 1,
        skipped: 3,
        emailFailures: 0,
      });
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ row: 3, reason: 'duplicate_in_file' }),
          expect.objectContaining({ row: 4, reason: 'invalid_email' }),
          expect.objectContaining({
            row: 5,
            reason: 'email_already_registered',
          }),
        ]),
      );
      expect(result).not.toHaveProperty('credentials');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('skips guests when the event is at capacity', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent({ capacity: 1 }));
      prisma.ticket.count.mockResolvedValue(1);

      const result = await service.importGuestUsers(ORGANIZER, 'evt-1', {
        originalname: 'guests.csv',
        buffer: Buffer.from(csv),
      });

      expect(result.summary).toEqual({
        created: 0,
        skipped: 2,
        emailFailures: 0,
      });
      expect(
        result.skipped.every(
          (skipped) => skipped.reason === 'event_capacity_reached',
        ),
      ).toBe(true);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(invitationMailer.assertConfigured).not.toHaveBeenCalled();
    });

    it('parses XLSX workbooks as well as CSV files', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Guests');
      worksheet.addRow(['First Name', 'Last Name', 'Email']);
      worksheet.addRow(['Taylor', 'Guest', 'taylor@example.org']);
      const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

      const result = await service.importGuestUsers(ORGANIZER, 'evt-1', {
        originalname: 'guests.xlsx',
        buffer: fileBuffer,
      });

      expect(result.created).toHaveLength(1);
      expect(result.created[0].email).toBe('taylor@example.org');
    });

    it('supports custom column mapping with single full name, student ID, and contact number', async () => {
      const customCsv = [
        'Complete Name,E-Mail Address,ID Number,Phone,Department,Extra Info',
        'Juan Dela Cruz,juan@example.org,2022-00123,+63-912-345-6789,Engineering,Ignored field',
      ].join('\n');

      const result = await service.importGuestUsers(
        ORGANIZER,
        'evt-1',
        { originalname: 'custom.csv', buffer: Buffer.from(customCsv) },
        false,
        {
          nameMode: 'single',
          fullNameColumn: 'Complete Name',
          emailColumn: 'E-Mail Address',
          studentIdColumn: 'ID Number',
          contactNumberColumn: 'Phone',
          affiliationColumn: 'Department',
        },
      );

      expect(result.summary.created).toBe(1);
      expect(result.created[0].email).toBe('juan@example.org');
      expect(result.created[0].fullName).toBe('Juan Dela Cruz');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Juan Dela Cruz',
            studentId: '2022-00123',
            contactNumber: '+63-912-345-6789',
            affiliation: 'Engineering',
            tickets: expect.objectContaining({
              create: expect.objectContaining({
                firstName: 'Juan Dela Cruz',
                lastName: 'Juan Dela Cruz',
                studentId: '2022-00123',
                contactNumber: '+63-912-345-6789',
              }),
            }),
          }),
        }),
      );
    });

    it('supports split name custom mapping with numeric column indexes without headers', async () => {
      const noHeaderCsv = [
        'Maria,Santos,maria@example.org,2023-99999',
      ].join('\n');

      const result = await service.importGuestUsers(
        ORGANIZER,
        'evt-1',
        { originalname: 'noheader.csv', buffer: Buffer.from(noHeaderCsv) },
        false,
        {
          hasHeaders: false,
          nameMode: 'split',
          firstNameColumn: 1,
          lastNameColumn: 2,
          emailColumn: 3,
          studentIdColumn: 4,
        },
      );

      expect(result.summary.created).toBe(1);
      expect(result.created[0].fullName).toBe('Maria Santos');
    });
  });

  describe('create', () => {
    const dto = {
      name: 'AI Workshop',
      venue: 'Lab 1',
      starts_at: futureIso(5, 9),
      ends_at: futureIso(5, 12),
      capacity: 40,
    };

    it('submits the event as pending for the current organizer', async () => {
      prisma.event.create.mockImplementation(({ data }) =>
        Promise.resolve(dbEvent({ ...data, id: 'evt-new' })),
      );

      const res = await service.create(ORGANIZER, dto);

      const { data } = prisma.event.create.mock.calls[0][0];
      expect(data.approvalStatus).toBe(EventApprovalStatus.PENDING);
      expect(data.organizerId).toBe('usr-org');
      expect(data.slug).toBe('ai-workshop');
      expect(res.approval_status).toBe('Pending');
    });

    it('allows any user to create a private event with immediate approval', async () => {
      prisma.event.create.mockImplementation(({ data }) =>
        Promise.resolve(dbEvent({ ...data, id: 'evt-private' })),
      );
      const res = await service.create(
        { ...ORGANIZER, role: 'USER' as any },
        { ...dto, is_private: true },
      );
      expect(res.approval_status).toBe('Approved');
      expect(res.is_private).toBe(true);
    });

    it('rejects events that start in the past', async () => {
      await expect(
        service.create(ORGANIZER, {
          ...dto,
          starts_at: '2020-01-01T09:00:00Z',
          ends_at: '2020-01-01T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid capacity', async () => {
      await expect(
        service.create(ORGANIZER, { ...dto, capacity: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('review', () => {
    it('only lets admins review', async () => {
      await expect(
        service.review(ORGANIZER, 'evt-1', { decision: 'APPROVED' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a reason when rejecting', async () => {
      await expect(
        service.review(ADMIN, 'evt-1', { decision: 'REJECTED', notes: ' ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the decision and reviewer', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.event.update.mockImplementation(({ data }) =>
        Promise.resolve({
          ...dbEvent(data),
          organizer: { fullName: 'Campus Organizer', email: 'o@alica.ph' },
          _count: { tickets: 0 },
        }),
      );

      const res = await service.review(ADMIN, 'evt-1', {
        decision: 'APPROVED',
      });

      const { data } = prisma.event.update.mock.calls[0][0];
      expect(data.approvalStatus).toBe('APPROVED');
      expect(data.reviewedById).toBe('usr-admin');
      expect(res.approval_status).toBe('Approved');
      expect(res.organizer_name).toBe('Campus Organizer');
    });
  });

  it('resubmits a rejected event when the organizer edits it', async () => {
    prisma.event.findFirst.mockResolvedValue(
      dbEvent({ approvalStatus: EventApprovalStatus.REJECTED }),
    );
    prisma.event.update.mockImplementation(({ data }) =>
      Promise.resolve(dbEvent({ approvalStatus: data.approvalStatus })),
    );

    const res = await service.update(ORGANIZER, 'evt-1', { venue: 'Hall B' });

    const { data } = prisma.event.update.mock.calls[0][0];
    expect(data.approvalStatus).toBe(EventApprovalStatus.PENDING);
    expect(data.reviewNotes).toBeNull();
    expect(res.approval_status).toBe('Pending');
  });

  it('only lists approved events publicly', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.event.findMany.mock.calls[0][0].where.approvalStatus).toBe(
      EventApprovalStatus.APPROVED,
    );
  });

  describe('cancelRegistrant and restoreRegistrant', () => {
    const mockTicket = {
      id: 'tkt-1',
      eventId: 'evt-1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      studentId: '2023-1234',
      ticketCode: 'CHK-2026-ALICE',
      status: TicketStatus.REGISTERED,
      createdAt: new Date(),
    };

    it('cancels registrant for an owned event', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue(mockTicket);
      prisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });

      const res = await service.cancelRegistrant(ORGANIZER, 'evt-1', 'tkt-1');
      expect(res.status).toBe('Cancelled');
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-1' },
        data: { status: TicketStatus.CANCELLED },
      });
    });

    it('rejects cancellation if registrant already cancelled', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });

      await expect(
        service.cancelRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('restores a cancelled registrant when capacity is available', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent({ capacity: 100 }));
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });
      prisma.ticket.count.mockResolvedValue(50);
      prisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.REGISTERED,
      });

      const res = await service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1');
      expect(res.status).toBe('Registered');
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-1' },
        data: { status: TicketStatus.REGISTERED },
      });
    });

    it('rejects restore if event is at capacity', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent({ capacity: 100 }));
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });
      prisma.ticket.count.mockResolvedValue(100);

      await expect(
        service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects restore if registrant is not cancelled', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue(mockTicket);

      await expect(
        service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
