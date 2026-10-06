import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@memequiz/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      // 503, чтобы uptime-мониторинг (этап 8) видел падение БД
      throw new ServiceUnavailableException({ status: 'error', db: 'down' } satisfies HealthResponse);
    }
  }
}
