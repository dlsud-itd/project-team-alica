import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { TicketStatus, type Event, type Ticket } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

export class CreateRegistrationDto {
  eventId!: string;
  fullName!: string;
  email!: string;
  studentId!: string;
  userId?: string;
}

export interface RegistrationResponseDto {
  ticketCode: string;
  qrPayload: string;
  attendeeName: string;
  eventId: string;
  status: string;
}

export interface TicketProfileDto {
  id: string;
  ticketCode: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  status: string;
  identificationNumber?: string;
  eventName?: string;
  issuedAt: string;
  qrPayload: string;
}

export interface AttendeeRsvpDto {
  ticketId: string;
  ticketCode: string;
  qrPayload: string;
  ticketType: string;
  status: 'Registered' | 'Checked In' | 'Cancelled';
  registeredAt: string;
  firstScannedAt: string | null;
  eventId: string;
  eventName: string;
  eventSlug: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  categoryLabel: string;
  description: string;
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateRegistrationDto,
  ): Promise<RegistrationResponseDto> {
    if (!dto.eventId || !dto.fullName || !dto.email) {
      throw new BadRequestException(
        'Event ID, full name, and email are required',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });

    // Events awaiting (or denied) admin approval are not open for registration.
    if (
      !event ||
      !event.isActive ||
      event.deletedAt ||
      event.approvalStatus !== 'APPROVED'
    ) {
      throw new NotFoundException(`Event with ID '${dto.eventId}' not found`);
    }

    const existing = await this.prisma.ticket.findUnique({
      where: { eventId_email: { eventId: dto.eventId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('This email is already registered for this event');
    }

    if (event.capacity) {
      const spotsTaken = await this.prisma.ticket.count({
        where: {
          eventId: dto.eventId,
          status: { not: TicketStatus.CANCELLED },
        },
      });
      if (spotsTaken >= event.capacity) {
        throw new BadRequestException('This event has reached full capacity');
      }
    }

    // Split fullName into firstName and lastName
    const nameParts = dto.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Attendee';
    const lastName = nameParts.slice(1).join(' ') || 'Delegate';

    // Generate unique Checkpoint ticket code
    const randomSuffix =
      Math.floor(1000 + Math.random() * 9000).toString() + 'A';
    const ticketCode = `CHK-2026-${randomSuffix}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        eventId: dto.eventId,
        userId: dto.userId || null,
        firstName,
        lastName,
        email: dto.email,
        studentId: dto.studentId || null,
        ticketType: 'STUDENT',
        ticketCode,
        qrPayload: ticketCode,
      },
    });

    return {
      ticketCode: ticket.ticketCode,
      qrPayload: ticket.qrPayload,
      attendeeName: `${firstName} ${lastName}`.trim(),
      eventId: ticket.eventId,
      status: ticket.status,
    };
  }

  async findForUser(user: UserSummaryDto): Promise<TicketProfileDto> {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [{ userId: user.id }, { email: user.email }],
      },
      include: {
        event: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (ticket) {
      return this.toTicketProfile(ticket);
    }

    const nameParts = user.fullName.split(' ');
    return {
      id: user.id,
      ticketCode: '',
      fullName: user.fullName,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' '),
      email: user.email,
      phoneNumber: '',
      role: user.role,
      status: 'PENDING',
      identificationNumber: user.studentId || undefined,
      issuedAt: new Date().toISOString(),
      qrPayload: user.id,
    };
  }

  async findMine(user: UserSummaryDto): Promise<AttendeeRsvpDto[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        OR: [{ userId: user.id }, { email: user.email }],
      },
      include: {
        event: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((t) => this.toAttendeeRsvp(t, t.event));
  }

  async cancelRsvp(
    user: UserSummaryDto,
    ticketCode: string,
  ): Promise<AttendeeRsvpDto> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketCode },
      include: { event: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket '${ticketCode}' not found`);
    }

    const isOwner =
      ticket.userId === user.id ||
      ticket.email.toLowerCase() === user.email.toLowerCase();
    if (!isOwner && user.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this ticket');
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException('This registration is already cancelled');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.CANCELLED },
      include: { event: true },
    });

    return this.toAttendeeRsvp(updated, updated.event);
  }

  async findByTicketCode(ticketCode: string): Promise<TicketProfileDto> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketCode },
      include: {
        event: { select: { title: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Registration with ticket code '${ticketCode}' not found`,
      );
    }

    return this.toTicketProfile(ticket);
  }

  private toAttendeeRsvp(ticket: Ticket, event: Event): AttendeeRsvpDto {
    const lowerSlug = (event.slug + ' ' + event.title).toLowerCase();
    let category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO' =
      'CONFERENCE';
    let categoryLabel = 'Conference';

    if (lowerSlug.includes('hackathon') || lowerSlug.includes('sprint')) {
      category = 'HACKATHON';
      categoryLabel = 'Hackathon';
    } else if (
      lowerSlug.includes('workshop') ||
      lowerSlug.includes('masterclass')
    ) {
      category = 'WORKSHOP';
      categoryLabel = 'Workshop';
    } else if (
      lowerSlug.includes('expo') ||
      lowerSlug.includes('demo') ||
      lowerSlug.includes('showcase')
    ) {
      category = 'EXPO';
      categoryLabel = 'Expos & Demos';
    }

    let statusLabel: 'Registered' | 'Checked In' | 'Cancelled' = 'Registered';
    if (ticket.status === TicketStatus.CHECKED_IN) {
      statusLabel = 'Checked In';
    } else if (ticket.status === TicketStatus.CANCELLED) {
      statusLabel = 'Cancelled';
    }

    return {
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      qrPayload: ticket.qrPayload,
      ticketType: ticket.ticketType,
      status: statusLabel,
      registeredAt: ticket.createdAt.toISOString(),
      firstScannedAt: ticket.firstScannedAt?.toISOString() ?? null,
      eventId: event.id,
      eventName: event.title,
      eventSlug: event.slug,
      venue: event.venueName,
      startsAt: event.startDate.toISOString(),
      endsAt: event.endDate.toISOString(),
      category,
      categoryLabel,
      description: event.description ?? '',
    };
  }

  private toTicketProfile(
    ticket: Ticket & { event: { title: string } | null },
  ): TicketProfileDto {
    return {
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      fullName: `${ticket.firstName} ${ticket.lastName}`.trim(),
      firstName: ticket.firstName,
      lastName: ticket.lastName,
      email: ticket.email,
      phoneNumber: '',
      role: 'ATTENDEE',
      status: 'ACTIVE',
      identificationNumber: ticket.studentId || undefined,
      eventName: ticket.event?.title,
      issuedAt: ticket.createdAt.toISOString(),
      qrPayload: ticket.qrPayload,
    };
  }
}
