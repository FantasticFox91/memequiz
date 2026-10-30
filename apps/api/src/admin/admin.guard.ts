import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSession } from './admin-session';

/**
 * Доступ к /api/admin/* по куке сессии (POST /api/admin/login).
 * Без ADMIN_USERNAME / ADMIN_PASSWORD админки нет совсем (404), нет сессии — 401.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly session: AdminSession) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.session.enabled) throw new NotFoundException();
    if (!this.session.isValid(context.switchToHttp().getRequest<Request>())) {
      throw new UnauthorizedException('Admin session required');
    }
    return true;
  }
}
