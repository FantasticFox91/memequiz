import { OIL_MAP_IMAGE_TYPES, OIL_MAP_LIMITS } from '@memequiz/shared';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/zod-validation.pipe';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // за одним прокси (Caddy в prod, dev-прокси Nuxt локально): req.ip — клиент из X-Forwarded-For,
  // иначе лимит по IP был бы общим на всех
  app.set('trust proxy', 1);

  // раскладка карты нефти (до 500 точек и 1500 связей) больше стандартных 100 КБ;
  // фон карты приходит сырыми байтами картинки
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('raw', { type: [...OIL_MAP_IMAGE_TYPES], limit: OIL_MAP_LIMITS.image });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
