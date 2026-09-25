import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string; // user id
  organizationId: string;
  role: 'admin' | 'data_entry' | 'management' | 'verifier';
  restrictedFacilityId: string | null;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  // Whatever this returns becomes `request.user` — this is the single source of truth for
  // organizationId used throughout the app (see CurrentUser decorator). Never trust a client-supplied
  // organizationId instead of this value.
  async validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      restrictedFacilityId: payload.restrictedFacilityId,
      email: payload.email,
    };
  }
}
