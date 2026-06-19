export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface RequestUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}
