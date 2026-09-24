import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    // NOTE: email is unique per-organization, not globally (see users.@@unique([organizationId, email])
    // in schema.prisma). A production login flow should ask the user which organization they belong to
    // (e.g. a subdomain, an org-code field, or a "select your workspace" step after a first lookup by
    // email across orgs) rather than assuming a single global email namespace. This MVP stub queries by
    // email only and takes the first match — replace before supporting users who belong to multiple tenants.
    const user = await this.prisma.user.findFirst({ where: { email, isActive: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials.');

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials.');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'login',
        entityType: 'users',
        entityId: user.id,
      },
    });

    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      restrictedFacilityId: user.restrictedFacilityId,
      email: user.email,
      fullName: user.fullName,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}
