import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * If the authenticated user has a restrictedFacilityId (typical for a Data Entry user tied to one
 * site), this guard rejects any request whose :facilityId param, body.facilityId, or query.facilityId
 * refers to a different facility. Admin and Management users (restrictedFacilityId = null) pass through.
 *
 * Apply this in addition to RolesGuard on activity-data and attachment routes — RolesGuard answers
 * "can this role do this action at all", this guard answers "on which facility".
 */
@Injectable()
export class FacilityScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.restrictedFacilityId) return true;

    const requestedFacilityId =
      request.params?.facilityId ?? request.body?.facilityId ?? request.query?.facilityId;

    if (requestedFacilityId && requestedFacilityId !== user.restrictedFacilityId) {
      throw new ForbiddenException('You do not have access to this facility.');
    }
    return true;
  }
}
