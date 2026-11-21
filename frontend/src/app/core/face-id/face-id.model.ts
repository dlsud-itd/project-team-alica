export type FaceIdStatus =
  | 'idle'
  | 'prompting'
  | 'loading'
  | 'capturing'
  | 'success'
  | 'error';

export interface FaceStatusResponse {
  registered: boolean;
}

export interface RegisterFaceResponse {
  success: boolean;
  message: string;
  registeredAt: string;
}

export interface RemoveFaceResponse {
  success: boolean;
  message: string;
}

export interface RegisterFacePayload {
  descriptor: number[];
}
