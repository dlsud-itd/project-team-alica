import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

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

export interface EventRegistrantDto {
  id: string;
  event_id: string;
  attendee_id: string;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: 'Registered' | 'Checked In' | 'Cancelled';
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRegistrationDto): Promise<RegistrationResponseDto> {
    if (!dto.eventId || !dto.fullName || !dto.email) {
      throw new BadRequestException(
        'Event ID, full name, and email are required',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      include: { tickets: true },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${dto.eventId}' not found`);
    }

    const spotsTaken = event.tickets.filter(
      (t) => t.status === 'REGISTERED',
    ).length;
    if (event.capacity && spotsTaken >= event.capacity) {
      throw new BadRequestException('This event has reached full capacity');
    }

    const existingTicket = await this.prisma.ticket.findFirst({
      where: {
        eventId: dto.eventId,
        email: dto.email,
      },
    });

    if (existingTicket) {
      return {
        ticketCode: existingTicket.ticketCode,
        qrPayload: existingTicket.qrPayload,
        attendeeName:
          `${existingTicket.firstName} ${existingTicket.lastName}`.trim(),
        eventId: existingTicket.eventId,
        status: existingTicket.status,
      };
    }

    const nameParts = dto.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Attendee';
    const lastName = nameParts.slice(1).join(' ') || 'User';

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

  async findByEventId(eventId: string): Promise<EventRegistrantDto[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((t) => {
      let status: 'Registered' | 'Checked In' | 'Cancelled' = 'Registered';
      if (t.status === 'CHECKED_IN') {
        status = 'Checked In';
      } else if (t.status === 'CANCELLED') {
        status = 'Cancelled';
      }

      return {
        id: t.id,
        event_id: t.eventId,
        attendee_id: t.userId ?? t.id,
        full_name: `${t.firstName} ${t.lastName}`.trim(),
        email: t.email,
        ticket_id: t.ticketCode,
        registered_at: t.createdAt.toISOString(),
        status,
      };
    });
  }

  async toggleCheckIn(ticketId: string): Promise<EventRegistrantDto> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID '${ticketId}' not found`);
    }

    if (ticket.status === 'CANCELLED') {
      throw new BadRequestException('Cannot check in a cancelled ticket');
    }

    const nextStatus =
      ticket.status === 'CHECKED_IN' ? 'REGISTERED' : 'CHECKED_IN';

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        lastScannedAt:
          nextStatus === 'CHECKED_IN' ? new Date() : ticket.lastScannedAt,
      },
    });

    let statusLabel: 'Registered' | 'Checked In' | 'Cancelled' = 'Registered';
    if (updated.status === 'CHECKED_IN') {
      statusLabel = 'Checked In';
    } else if (updated.status === 'CANCELLED') {
      statusLabel = 'Cancelled';
    }

    return {
      id: updated.id,
      event_id: updated.eventId,
      attendee_id: updated.userId ?? updated.id,
      full_name: `${updated.firstName} ${updated.lastName}`.trim(),
      email: updated.email,
      ticket_id: updated.ticketCode,
      registered_at: updated.createdAt.toISOString(),
      status: statusLabel,
    };
  }
}
