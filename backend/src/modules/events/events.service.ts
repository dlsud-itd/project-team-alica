import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Event,
  EventApprovalStatus,
  Prisma,
  TicketStatus,
} from '@prisma/client';
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
export type ApprovalStatusLabel = 'Pending' | 'Approved' | 'Rejected';

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
  description: string;
  allow_walk_ins: boolean;
  approval_status: ApprovalStatusLabel;
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string;
}

export interface AdminEventDto extends OrganizerEventDto {
  organizer_name: string;
  organizer_email: string;
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
  description?: string;
  venue?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
  allow_walk_ins?: boolean;
}

export class CreateEventDto {
  name!: string;
  description?: string;
  venue!: string;
  starts_at!: string;
  ends_at!: string;
  capacity!: number;
  allow_walk_ins?: boolean;
}

export class ReviewEventDto {
  decision!: 'APPROVED' | 'REJECTED';
  notes?: string;
}

const REGISTRANT_STATUS_LABELS: Record<TicketStatus, RegistrantStatus> = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Checked In',
  CANCELLED: 'Cancelled',
};

const APPROVAL_STATUS_LABELS: Record<
  EventApprovalStatus,
  ApprovalStatusLabel
> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// Tickets that hold a seat (everything except cancelled).
const ACTIVE_TICKET_FILTER = { status: { not: TicketStatus.CANCELLED } };

const ADMIN_EVENT_INCLUDE = {
  organizer: { select: { fullName: true, email: true } },
  _count: { select: { tickets: { where: ACTIVE_TICKET_FILTER } } },
} satisfies Prisma.EventInclude;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Public listing: only active, admin-approved events. */
  async findAll(): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        approvalStatus: EventApprovalStatus.APPROVED,
      },
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

  /** Organizer submits a new event; it stays hidden until an admin approves it. */
  async create(
    user: UserSummaryDto,
    dto: CreateEventDto,
  ): Promise<OrganizerEventDto> {
    this.assertOrganizerRole(user);

    const title = this.requireText(dto.name, 'Event title is required');
    const venueName = this.requireText(dto.venue, 'Venue is required');
    const [startDate, endDate] = this.parseDateRange(
      dto.starts_at,
      dto.ends_at,
    );
    if (startDate <= new Date()) {
      throw new BadRequestException('Start date & time must be in the future');
    }
    const capacity = this.parseCapacity(dto.capacity);

    const event = await this.prisma.event.create({
      data: {
        title,
        slug: await this.uniqueSlug(title),
        description: dto.description?.trim() || null,
        venueName,
        startDate,
        endDate,
        capacity,
        allowWalkIns: dto.allow_walk_ins ?? false,
        approvalStatus: EventApprovalStatus.PENDING,
        organizerId: user.id,
      },
    });

    this.logger.log(`Event '${event.id}' submitted for review by ${user.id}`);
    return this.toOrganizerEvent(event, 0);
  }

  async update(
    user: UserSummaryDto,
    eventId: string,
    dto: UpdateEventDto,
  ): Promise<OrganizerEventDto> {
    const event = await this.findManageableEvent(user, eventId);
    const data: Prisma.EventUpdateInput = {};

    if (dto.name !== undefined) {
      data.title = this.requireText(dto.name, 'Event title is required');
    }

    if (dto.venue !== undefined) {
      data.venueName = this.requireText(dto.venue, 'Venue is required');
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.allow_walk_ins !== undefined) {
      data.allowWalkIns = Boolean(dto.allow_walk_ins);
    }

    const [startDate, endDate] = this.parseDateRange(
      dto.starts_at ?? event.startDate.toISOString(),
      dto.ends_at ?? event.endDate.toISOString(),
    );
    data.startDate = startDate;
    data.endDate = endDate;

    // Editing a rejected event resubmits it for admin review.
    if (
      user.role !== 'ADMIN' &&
      event.approvalStatus === EventApprovalStatus.REJECTED
    ) {
      data.approvalStatus = EventApprovalStatus.PENDING;
      data.reviewNotes = null;
      data.reviewedAt = null;
      data.reviewedBy = { disconnect: true };
    }

    const registrationsCount = await this.prisma.ticket.count({
      where: { eventId, ...ACTIVE_TICKET_FILTER },
    });

    if (dto.capacity !== undefined) {
      const capacity = this.parseCapacity(dto.capacity);
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

  /** Every event for the admin console, optionally filtered by approval status. */
  async findAllForAdmin(
    user: UserSummaryDto,
    status?: string,
  ): Promise<AdminEventDto[]> {
    this.assertAdminRole(user);

    let approvalStatus: EventApprovalStatus | undefined;
    if (status) {
      const normalized = status.toUpperCase();
      if (!(normalized in EventApprovalStatus)) {
        throw new BadRequestException(`Unknown approval status '${status}'`);
      }
      approvalStatus = normalized as EventApprovalStatus;
    }

    const events = await this.prisma.event.findMany({
      where: { deletedAt: null, ...(approvalStatus ? { approvalStatus } : {}) },
      include: ADMIN_EVENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return events.map((ev) => this.toAdminEvent(ev, ev._count.tickets));
  }

  async review(
    user: UserSummaryDto,
    eventId: string,
    dto: ReviewEventDto,
  ): Promise<AdminEventDto> {
    this.assertAdminRole(user);

    if (dto.decision !== 'APPROVED' && dto.decision !== 'REJECTED') {
      throw new BadRequestException(
        "Decision must be either 'APPROVED' or 'REJECTED'",
      );
    }
    const notes = dto.notes?.trim() || null;
    if (dto.decision === 'REJECTED' && !notes) {
      throw new BadRequestException(
        'Please provide a reason so the organizer can revise the event',
      );
    }

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        approvalStatus: dto.decision,
        reviewNotes: notes,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      include: ADMIN_EVENT_INCLUDE,
    });

    this.logger.log(`Event '${eventId}' ${dto.decision} by ${user.id}`);
    return this.toAdminEvent(updated, updated._count.tickets);
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

  async cancelRegistrant(
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
      throw new BadRequestException('Registration is already cancelled');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.CANCELLED },
    });

    return this.toRegistrant(updated);
  }

  async restoreRegistrant(
    user: UserSummaryDto,
    eventId: string,
    registrantId: string,
  ): Promise<EventRegistrantDto> {
    const event = await this.findManageableEvent(user, eventId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: registrantId, eventId },
    });
    if (!ticket) {
      throw new NotFoundException(`Registrant '${registrantId}' not found`);
    }
    if (ticket.status !== TicketStatus.CANCELLED) {
      throw new BadRequestException(
        'Only cancelled registrations can be restored',
      );
    }

    if (event.capacity) {
      const spotsTaken = await this.prisma.ticket.count({
        where: { eventId, status: { not: TicketStatus.CANCELLED } },
      });
      if (spotsTaken >= event.capacity) {
        throw new BadRequestException(
          'Event is at full capacity. Cannot restore registration.',
        );
      }
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.REGISTERED },
    });

    return this.toRegistrant(updated);
  }

  private assertOrganizerRole(user: UserSummaryDto): void {
    if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only organizers can manage events');
    }
  }

  private assertAdminRole(user: UserSummaryDto): void {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can review events');
    }
  }

  private requireText(value: string | undefined, message: string): string {
    const text = value?.trim();
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private parseDateRange(startsAt?: string, endsAt?: string): [Date, Date] {
    const startDate = new Date(startsAt ?? '');
    const endDate = new Date(endsAt ?? '');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Please provide valid start and end dates');
    }
    if (endDate <= startDate) {
      throw new BadRequestException(
        'End date & time must be after the start date & time',
      );
    }
    return [startDate, endDate];
  }

  private parseCapacity(value: unknown): number {
    const capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new BadRequestException('Capacity must be a positive whole number');
    }
    return capacity;
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'event';

    let slug = base;
    while (await this.prisma.event.findUnique({ where: { slug } })) {
      slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    }
    return slug;
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
    ev: Event,
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
      description: ev.description ?? '',
      allow_walk_ins: ev.allowWalkIns,
      approval_status: APPROVAL_STATUS_LABELS[ev.approvalStatus],
      review_notes: ev.reviewNotes,
      reviewed_at: ev.reviewedAt?.toISOString() ?? null,
      submitted_at: ev.createdAt.toISOString(),
    };
  }

  private toAdminEvent(
    ev: Event & { organizer: { fullName: string; email: string } },
    registrationsCount: number,
  ): AdminEventDto {
    return {
      ...this.toOrganizerEvent(ev, registrationsCount),
      organizer_name: ev.organizer.fullName,
      organizer_email: ev.organizer.email,
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
