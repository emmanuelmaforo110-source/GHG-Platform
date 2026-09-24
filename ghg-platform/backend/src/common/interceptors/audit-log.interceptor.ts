import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit';
export interface AuditMeta {
  action: AuditAction;
  entityType: string;
}
/** Usage: @Audit({ action: 'update', entityType: 'activity_data' }) above a controller method. */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);

/**
 * Writes an append-only audit_logs row after a decorated mutating endpoint succeeds.
 * Reads old_value/new_value off `request.auditContext`, which the controller/service populates
 * before returning (see activity-data.service.ts for the pattern) — the interceptor itself doesn't
 * know entity-specific shapes, it just persists whatever context was set.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap(async (response) => {
        const ctx = request.auditContext ?? {};
        try {
          await this.prisma.auditLog.create({
            data: {
              organizationId: user?.organizationId,
              userId: user?.id,
              action: meta.action,
              entityType: meta.entityType,
              entityId: ctx.entityId ?? response?.id ?? null,
              oldValue: ctx.oldValue ?? undefined,
              newValue: ctx.newValue ?? response ?? undefined,
              ipAddress: request.ip,
            },
          });
        } catch (err) {
          // Audit logging must never break the primary request/response cycle; log and move on.
          console.error('Failed to write audit log entry:', err);
        }
      }),
    );
  }
}
