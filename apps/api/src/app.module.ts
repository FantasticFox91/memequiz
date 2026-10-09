import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BotModule } from './bot/bot.module';
import { THROTTLERS } from './common/throttling';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { TelegramAuthGuard } from './participant/telegram-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { QuizModule } from './quiz/quiz.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // локально .env лежит в корне монорепо; в Docker переменные приходят из compose
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    QuizModule,
    BotModule,
    ThrottlerModule.forRoot({ throttlers: THROTTLERS, errorMessage: 'Слишком много запросов' }),
  ],
  // порядок важен: лимит по участнику берёт telegramUser, который ставит TelegramAuthGuard
  providers: [
    { provide: APP_GUARD, useClass: TelegramAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
