import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { EmissionFactorsModule } from './emission-factors/emission-factors.module';
import { ReportingPeriodsModule } from './reporting-periods/reporting-periods.module';
import { ActivityDataModule } from './activity-data/activity-data.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ReductionModule } from './reduction/reduction.module';
import { OffsetsModule } from './offsets/offsets.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    FacilitiesModule,
    EmissionFactorsModule,
    ReportingPeriodsModule,
    ActivityDataModule,
    AttachmentsModule,
    DashboardModule,
    AuditLogsModule,
    ReductionModule,
    OffsetsModule,
  ],
  providers: [
    // Global JWT auth: every route requires a valid token unless decorated @Public().
    // Per-route RBAC (@Roles + RolesGuard) is applied at the controller level on top of this.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
