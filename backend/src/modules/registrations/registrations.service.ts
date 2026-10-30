import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import type { Ticket } from '@prisma/client';
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

    if (!event) {
      throw new NotFoundException(`Event with ID '${dto.eventId}' not found`);
    }

    const existing = await this.prisma.ticket.findUnique({
      where: { eventId_email: { eventId: dto.eventId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('This email is already registered for this event');
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
        status: 'REGISTERED',
      },
    });

    return {
      ticketCode: ticket.ticketCode,
      qrPayload: ticket.qrPayload,
      attendeeName: `${ticket.firstName} ${ticket.lastName}`.trim(),
      eventId: ticket.eventId,
      status: ticket.status,
    };
  }

  /** The user's most recent active ticket, or their account details if they have none. */
  async findForUser(user: UserSummaryDto): Promise<TicketProfileDto> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { userId: user.id, status: { not: 'CANCELLED' } },
      include: { event: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (ticket) {
      return { ...this.toTicketProfile(ticket), role: user.role };
    }

    const nameParts = user.fullName.trim().split(/\s+/);
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
