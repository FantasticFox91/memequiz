import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminAnswersResponse,
  type AdminParticipantsResponse,
  adminAnswersQuerySchema,
  adminLoginRequestSchema,
  adminVerdictRequestSchema,
} from '@memequiz/shared';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ADMIN_LOGIN_LIMITS } from '../common/throttling';
import { createZodDto } from '../common/zod-validation.pipe';
import { AdminSession } from './admin-session';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class AdminLoginRequestDto extends createZodDto(adminLoginRequestSchema) {}
class AdminAnswersQueryDto extends createZodDto(adminAnswersQuerySchema) {}
class AdminVerdictRequestDto extends createZodDto(adminVerdictRequestSchema) {}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly session: AdminSession,
  ) {}

  @Post('login')
  @HttpCode(204)
  @Throttle(ADMIN_LOGIN_LIMITS)
  login(@Body() body: AdminLoginRequestDto, @Res({ passthrough: true }) res: Response): void {
    if (!this.session.enabled) throw new NotFoundException();
    if (!this.session.checkCredentials(body.username, body.password)) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        issues: [{ path: 'password', message: 'Неверный логин или пароль' }],
      });
    }
    this.session.issue(res);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.session.clear(res);
  }

  @Get('answers')
  @UseGuards(AdminGuard)
  answers(@Query() query: AdminAnswersQueryDto): Promise<AdminAnswersResponse> {
    return this.admin.answers(query.filter);
  }

  // те же текстовые ответы, сгруппированные по участникам (засчитанным результатам)
  @Get('participants')
  @UseGuards(AdminGuard)
  participants(@Query() query: AdminAnswersQueryDto): Promise<AdminParticipantsResponse> {
    return this.admin.participants(query.filter);
  }

  @Post('answers/verdict')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async verdict(@Body() body: AdminVerdictRequestDto): Promise<void> {
    await this.admin.setVerdict(body.ids, body.points);
  }
}
