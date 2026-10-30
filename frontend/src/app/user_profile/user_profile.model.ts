export enum UserRole {
  ATTENDEE = 'ATTENDEE',
  ORGANIZER = 'ORGANIZER',
  STAFF = 'STAFF',
  VIP = 'VIP',
  SPEAKER = 'SPEAKER',
}

export enum ProfileStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
}

export type UserProfile = {
  id: string;
  ticketCode: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role: UserRole;
  status: ProfileStatus;
  identificationNumber?: string;
  eventName?: string;
  issuedAt: string;
  qrPayload: string;
};

export type ApiResponse<T> = {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
};
