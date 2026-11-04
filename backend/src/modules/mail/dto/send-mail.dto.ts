export class SendTestMailDto {
  to!: string;
}

export class SendCustomMailDto {
  to!: string | string[];
  subject!: string;
  text?: string;
  html?: string;
}

