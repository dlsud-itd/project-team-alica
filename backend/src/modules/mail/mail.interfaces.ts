export interface SendMailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
  cid?: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: SendMailAttachment[];
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IMailProvider {
  send(options: SendMailOptions): Promise<SendMailResult>;
  verifyConnection?(): Promise<boolean>;
}

export interface TicketConfirmationDetails {
  attendeeName: string;
  eventTitle: string;
  ticketCode: string;
  venueName: string;
  startDate: string;
  qrPayload?: string;
}

