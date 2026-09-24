import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  role: 'admin' | 'data_entry' | 'management';
  restrictedFacilityId: string | null;
  email: string;
}

/**
 * Pulls the authenticated user off the request (populated by JwtStrategy from the JWT payload).
 * organizationId always comes from here — NEVER from a client-supplied query/body param —
 * so a request can't be crafted to read or write another tenant's data.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
