export type AccountStatus = 'active' | 'suspended' | 'pending' | 'rejected';

export interface UserCredentials {
  userId: number;
  email: string;
  phone: string;
  passwordHash: string;
  accountStatus: AccountStatus;
  mfaEnabled: boolean;
}

export function canLogin(credentials: UserCredentials): boolean {
  return credentials.accountStatus === 'active';
}
