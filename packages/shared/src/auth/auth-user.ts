export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  roles: string[];
  permissions: string[];
}
