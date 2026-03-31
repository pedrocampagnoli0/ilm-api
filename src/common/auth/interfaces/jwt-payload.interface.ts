export interface JwtPayload {
  sub: string; // auth.users.id (UUID)
  email: string;
  aud: string; // "authenticated"
  role: string; // "authenticated"
  exp: number;
  iat: number;
}