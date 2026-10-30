import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

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

export interface OrganizerEventDto {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  registrations_count: number;
  capacity: number;
  status: 'Upcoming' | 'In progress' | 'Completed';
}

export interface OrganizerRegistrantDto {
  id: string;
  event_id: string;
  attendee_id: string | null;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: 'Registered' | 'Checked In' | 'Cancelled';
}

export interface OrganizerDashboardDto {
  events: OrganizerEventDto[];
  registrants: OrganizerRegistrantDto[];
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findForOrganizer(organizerId: string): Promise<OrganizerDashboardDto> {
    const events = await this.prisma.event.findMany({
      where: { organizerId, isActive: true },
      include: {
        tickets: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const now = new Date();
    const organizerEvents: OrganizerEventDto[] = events.map((event) => {
      const start = event.startDate;
      const end = event.endDate;
      let status: OrganizerEventDto['status'] = 'Upcoming';

      if (now >= start && now <= end) {
        status = 'In progress';
      } else if (now > end) {
        status = 'Completed';
      }

      return {
        id: event.id,
        organizer_id: event.organizerId,
        name: event.title,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        venue: event.venueName,
        registrations_count: event.tickets.filter(
          (ticket) => ticket.status !== 'CANCELLED',
        ).length,
        capacity: event.capacity ?? 100,
        status,
      };
    });

    const registrants: OrganizerRegistrantDto[] = events.flatMap((event) =>
      event.tickets.map((ticket) => ({
        id: ticket.id,
        event_id: ticket.eventId,
        attendee_id: ticket.userId,
        full_name: `${ticket.firstName} ${ticket.lastName}`.trim(),
        email: ticket.email,
        ticket_id: ticket.ticketCode,
        registered_at: ticket.createdAt.toISOString(),
        status:
          ticket.status === 'CHECKED_IN'
            ? 'Checked In'
            : ticket.status === 'CANCELLED'
              ? 'Cancelled'
              : 'Registered',
      })),
    );

    return { events: organizerEvents, registrants };
  }

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
          where: { status: 'REGISTERED' },
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
}
