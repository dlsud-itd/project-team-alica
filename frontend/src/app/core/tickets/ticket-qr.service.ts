import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import * as QRCode from 'qrcode';

/** The parts of a ticket needed to render its QR pass. */
export interface TicketQrSource {
  ticketCode: string;
  /** What scanners read; falls back to the ticket code when the API omits it. */
  qrPayload?: string | null;
}

/**
 * The single, fixed set of options for every ticket QR in the app, so the same
 * ticket renders the exact same image on every screen.
 */
export const TICKET_QR_OPTIONS: QRCode.QRCodeToDataURLOptions = {
  errorCorrectionLevel: 'M',
  width: 320,
  margin: 2,
  color: { dark: '#0d5c46', light: '#ffffff' },
};

/** The value encoded into a ticket's QR: its `qrPayload`, else its ticket code. */
export function ticketQrPayload(ticket: TicketQrSource): string {
  return ticket.qrPayload?.trim() || ticket.ticketCode;
}

@Injectable({ providedIn: 'root' })
export class TicketQrService {
  /** Renders a ticket's QR pass as a PNG data URL. */
  render(ticket: TicketQrSource): Observable<string> {
    return from(this.toDataUrl(ticket));
  }

  /** Promise form of {@link render}. */
  toDataUrl(ticket: TicketQrSource): Promise<string> {
    return QRCode.toDataURL(ticketQrPayload(ticket), TICKET_QR_OPTIONS);
  }
}
