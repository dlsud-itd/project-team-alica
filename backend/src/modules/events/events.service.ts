import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

export interface EventResponseDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  categoryLabel: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  spotsTotal: number;
  spotsTaken: number;
  status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON';
  statusLabel: string;
  organizerName: string;
  organizerId?: string;
  staffIds?: string[];
  registeredUserIds?: string[];
}

export type OrganizerEventStatus = 'Upcoming' | 'In progress' | 'Completed';
export type RegistrantStatus = 'Registered' | 'Checked In' | 'Cancelled';

export interface OrganizerEventDto {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  registrations_count: number;
  capacity: number | null;
  status: OrganizerEventStatus;
}

export interface EventRegistrantDto {
  id: string;
  event_id: string;
  attendee_id: string | null;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: RegistrantStatus;
}

export class UpdateEventDto {
  name?: string;
  venue?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
}

const REGISTRANT_STATUS_LABELS: Record<TicketStatus, RegistrantStatus> = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Checked In',
  CANCELLED: 'Cancelled',
};

// Tickets that hold a seat (everything except cancelled).
const ACTIVE_TICKET_FILTER = { status: { not: TicketStatus.CANCELLED } };

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: { isActive: true },
      include: {
        organizer: {
          select: { id: true, fullName: true, affiliation: true },
        },
        staff: {
          where: { isActive: true },
          select: { userId: true },
        },
        tickets: {
          where: ACTIVE_TICKET_FILTER,
          select: { id: true, userId: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((ev) => {
      const spotsTaken = ev.tickets.length;
      const spotsTotal = ev.capacity ?? 100;
      const spotsRemaining = spotsTotal - spotsTaken;

      let status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON' = 'OPEN';
      let statusLabel = 'Registration Open';

      const now = new Date();
      const start = new Date(ev.startDate);
      const end = new Date(ev.endDate);

      if (now >= start && now <= end) {
        status = 'LIVE_TODAY';
        statusLabel = 'Happening Today';
      } else if (spotsRemaining <= 15 && spotsRemaining > 0) {
        status = 'CLOSING_SOON';
        statusLabel = `${spotsRemaining} Spots Left`;
      }

      // Infer category from title/slug
      const lowerSlug = (ev.slug + ' ' + ev.title).toLowerCase();
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
        lowerSlug.includes('showcase')
      ) {
        category = 'EXPO';
        categoryLabel = 'Expo';
      }

      const dateLabel = start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const timeLabel = `${start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })} - ${end.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}`;

      return {
        id: ev.id,
        slug: ev.slug,
        title: ev.title,
        description: ev.description ?? '',
        category,
        categoryLabel,
        dateLabel,
        timeLabel,
        venue: ev.venueName,
        spotsTotal,
        spotsTaken,
        status,
        statusLabel,
        organizerName: ev.organizer?.fullName ?? 'Campus Organizer',
        organizerId: ev.organizerId,
        staffIds: ev.staff.map((s) => s.userId),
        registeredUserIds: ev.tickets
          .map((t) => t.userId)
          .filter((uid): uid is string => uid !== null),
      };
    });
  }

  /** Events the user organizes (admins see every active event). */
  async findForOrganizer(user: UserSummaryDto): Promise<OrganizerEventDto[]> {
    this.assertOrganizerRole(user);

    const events = await this.prisma.event.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(user.role === 'ADMIN' ? {} : { organizerId: user.id }),
      },
      include: {
        _count: { select: { tickets: { where: ACTIVE_TICKET_FILTER } } },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((ev) => this.toOrganizerEvent(ev, ev._count.tickets));
  }

  async update(
    user: UserSummaryDto,
    eventId: string,
    dto: UpdateEventDto,
  ): Promise<OrganizerEventDto> {
    const event = await this.findManageableEvent(user, eventId);
    const data: Prisma.EventUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Event title is required');
      data.title = name;
    }

    if (dto.venue !== undefined) {
      const venue = dto.venue.trim();
      if (!venue) throw new BadRequestException('Venue is required');
      data.venueName = venue;
    }

    const startDate = dto.starts_at ? new Date(dto.starts_at) : event.startDate;
    const endDate = dto.ends_at ? new Date(dto.ends_at) : event.endDate;
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Please provide valid start and end dates');
    }
    if (endDate <= startDate) {
      throw new BadRequestException(
        'End date & time must be after the start date & time',
      );
    }
    data.startDate = startDate;
    data.endDate = endDate;

    const registrationsCount = await this.prisma.ticket.count({
      where: { eventId, ...ACTIVE_TICKET_FILTER },
    });

    if (dto.capacity !== undefined) {
      const capacity = Number(dto.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new BadRequestException(
          'Capacity must be a positive whole number',
        );
      }
      if (capacity < registrationsCount) {
        throw new BadRequestException(
          `Capacity cannot be lower than current registrations (${registrationsCount})`,
        );
      }
      data.capacity = capacity;
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data,
    });

    return this.toOrganizerEvent(updated, registrationsCount);
  }

  async findRegistrants(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<EventRegistrantDto[]> {
    await this.findManageableEvent(user, eventId);

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((ticket) => this.toRegistrant(ticket));
  }

  async toggleCheckIn(
    user: UserSummaryDto,
    eventId: string,
    registrantId: string,
  ): Promise<EventRegistrantDto> {
    await this.findManageableEvent(user, eventId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: registrantId, eventId },
    });
    if (!ticket) {
      throw new NotFoundException(`Registrant '${registrantId}' not found`);
    }
    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled registrations cannot be checked in',
      );
    }

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data:
        ticket.status === TicketStatus.CHECKED_IN
          ? { status: TicketStatus.REGISTERED }
          : {
              status: TicketStatus.CHECKED_IN,
              firstScannedAt: ticket.firstScannedAt ?? now,
              lastScannedAt: now,
            },
    });

    return this.toRegistrant(updated);
  }

  private assertOrganizerRole(user: UserSummaryDto): void {
    if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only organizers can manage events');
    }
  }

  private async findManageableEvent(user: UserSummaryDto, eventId: string) {
    this.assertOrganizerRole(user);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }
    if (user.role !== 'ADMIN' && event.organizerId !== user.id) {
      throw new ForbiddenException('You do not manage this event');
    }
    return event;
  }

  private toOrganizerEvent(
    ev: {
      id: string;
      organizerId: string;
      title: string;
      startDate: Date;
      endDate: Date;
      venueName: string;
      capacity: number | null;
    },
    registrationsCount: number,
  ): OrganizerEventDto {
    const now = new Date();
    const status: OrganizerEventStatus =
      now < ev.startDate
        ? 'Upcoming'
        : now <= ev.endDate
          ? 'In progress'
          : 'Completed';

    return {
      id: ev.id,
      organizer_id: ev.organizerId,
      name: ev.title,
      starts_at: ev.startDate.toISOString(),
      ends_at: ev.endDate.toISOString(),
      venue: ev.venueName,
      registrations_count: registrationsCount,
      capacity: ev.capacity,
      status,
    };
  }

  private toRegistrant(ticket: {
    id: string;
    eventId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    ticketCode: string;
    createdAt: Date;
    status: TicketStatus;
  }): EventRegistrantDto {
    return {
      id: ticket.id,
      event_id: ticket.eventId,
      attendee_id: ticket.userId,
      full_name: `${ticket.firstName} ${ticket.lastName}`.trim(),
      email: ticket.email,
      ticket_id: ticket.ticketCode,
      registered_at: ticket.createdAt.toISOString(),
      status: REGISTRANT_STATUS_LABELS[ticket.status],
    };
  }
}
