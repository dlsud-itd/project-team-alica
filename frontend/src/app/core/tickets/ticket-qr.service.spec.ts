import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';
import { TicketQrService, ticketQrPayload } from './ticket-qr.service';

describe('TicketQrService', () => {
  let service: TicketQrService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TicketQrService);
  });

  it('encodes the qrPayload when present', () => {
    expect(ticketQrPayload({ ticketCode: 'CHK-A', qrPayload: 'CHK-PAYLOAD' })).toBe(
      'CHK-PAYLOAD',
    );
  });

  it('falls back to the ticket code when qrPayload is missing or blank', () => {
    expect(ticketQrPayload({ ticketCode: 'CHK-A' })).toBe('CHK-A');
    expect(ticketQrPayload({ ticketCode: 'CHK-A', qrPayload: '  ' })).toBe('CHK-A');
  });

  it('renders a PNG data URL', async () => {
    const url = await firstValueFrom(service.render({ ticketCode: 'CHK-A', qrPayload: 'CHK-A' }));
    expect(url).toContain('data:image/png;base64,');
  });

  it('renders the same ticket identically every time', async () => {
    const ticket = { ticketCode: 'CHK-123', qrPayload: 'CHK-123' };
    const first = await firstValueFrom(service.render(ticket));
    const second = await firstValueFrom(service.render({ ticketCode: 'CHK-123' }));
    expect(second).toBe(first);
  });
});
