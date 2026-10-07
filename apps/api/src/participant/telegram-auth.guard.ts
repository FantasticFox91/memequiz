import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { InitDataError, type TelegramInitUser, verifyInitData } from './telegram-init-data';

export type TelegramRequest = Request & { telegramUser?: TelegramInitUser };

const SCHEME = 'tma ';

/**
 * Глобальный guard. Заголовок `Authorization: tma <initData>` → проверка подписи
 * и request.telegramUser. Без заголовка запрос проходит как web.
 * Заголовок есть, но подпись неверна → 401, без отката к web-ветке.
 */
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly logger = new Logger(TelegramAuthGuard.name);
  private readonly botToken: string | undefined;
  private readonly maxAgeSec: number;

  constructor(config: ConfigService<Env, true>) {
    this.botToken = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.maxAgeSec = config.get('TG_INIT_DATA_TTL', { infer: true });
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set: requests from Telegram will get 401');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TelegramRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith(SCHEME)) return true;

    if (!this.botToken) throw new UnauthorizedException('Telegram auth is not configured');

    try {
      req.telegramUser = verifyInitData(header.slice(SCHEME.length), this.botToken, this.maxAgeSec);
    } catch (e) {
      if (e instanceof InitDataError) {
        this.logger.debug(`initData rejected: ${e.message}`);
        throw new UnauthorizedException('Invalid Telegram initData');
      }
      throw e;
    }
    return true;
  }
}
