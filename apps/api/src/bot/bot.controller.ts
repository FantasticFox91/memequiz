import { Controller, Get } from '@nestjs/common';
import type { BotInfoResponse } from '@memequiz/shared';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Get()
  info(): BotInfoResponse {
    return { username: this.bot.username };
  }
}
