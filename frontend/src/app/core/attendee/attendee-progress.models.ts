export type StampCheckpointType = 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';

export interface TicketStamp {
  checkpointId: string;
  name: string;
  location: string | null;
  type: StampCheckpointType;
  parentId: string | null;
  visited: boolean;
  firstVisitedAt: string | null;
}

/** Short summary also returned with every successful/duplicate scan. */
export interface ProgressSummary {
  visitedCount: number;
  totalCount: number;
  percent: number;
  completed: boolean;
}

export interface TicketProgress extends ProgressSummary {
  ticketCode: string;
  eventId: string;
  eventName: string;
  stamps: TicketStamp[];
}
