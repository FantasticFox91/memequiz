import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard } from 'grammy';
import type { Env } from '../config/env';
import { QuestionsService } from '../quiz/questions.service';
import {
  BUTTON_PLAY,
  DESCRIPTION,
  HELP_TEXT,
  MENU_BUTTON,
  SHORT_DESCRIPTION,
  welcomeText,
} from './bot.texts';

/**
 * Бот: приветствие на /start с кнопкой Mini App. Long polling, входящий маршрут не нужен.
 * Работает, только если BOT_ENABLED=true и заданы TELEGRAM_BOT_TOKEN и WEB_APP_URL.
 * Ошибки бота логируются и не роняют api: викторина работает и без него.
 */
@Injectable()
export class BotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot | null = null;
  // известен после старта бота; нужен фронту для ссылки t.me/<username>?startapp
  private botUsername: string | null = null;

  get username(): string | null {
    return this.botUsername;
  }

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly questions: QuestionsService,
  ) {}

  onApplicationBootstrap() {
    const enabled = this.config.get('BOT_ENABLED', { infer: true });
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const webAppUrl = this.config.get('WEB_APP_URL', { infer: true });
    if (!enabled) {
      this.logger.log('Bot disabled (BOT_ENABLED=false)');
      return;
    }
    if (!token || !webAppUrl) {
      this.logger.warn(
        'BOT_ENABLED=true, but TELEGRAM_BOT_TOKEN or WEB_APP_URL is not set: bot is off',
      );
      return;
    }

    const bot = new Bot(token);
    const keyboard = new InlineKeyboard().webApp(BUTTON_PLAY, webAppUrl);
    // «Раунд 1. Зверушки» → «Зверушки»
    const rounds = this.questions.getRounds().map((r) => r.title.replace(/^Раунд\s*\d+\.\s*/i, ''));

    bot.command('start', (ctx) =>
      ctx.reply(welcomeText(ctx.from?.first_name ?? 'друг', rounds, this.questions.total), {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    );
    // на любое другое сообщение — подсказка с той же кнопкой
    bot.on('message', (ctx) => ctx.reply(HELP_TEXT, { reply_markup: keyboard }));
    bot.catch((err) =>
      this.logger.error(`Update ${err.ctx.update.update_id} failed: ${err.message}`),
    );

    this.bot = bot;
    void this.setupProfile(bot, webAppUrl);
    // start() резолвится только после stop(), поэтому не ждём
    bot
      .start({
        drop_pending_updates: true,
        onStart: (me) => {
          this.botUsername = me.username;
          this.logger.log(`Bot @${me.username} started (long polling)`);
        },
      })
      .catch((e: Error) => {
        this.logger.error(`Bot polling stopped: ${e.message}`);
        this.bot = null;
      });
  }

  async onApplicationShutdown() {
    if (this.bot?.isRunning()) await this.bot.stop();
  }

  // команды, описания и кнопка меню; при каждом старте, чтобы прод не зависел от ручных правок в BotFather
  private async setupProfile(bot: Bot, webAppUrl: string) {
    try {
      await bot.api.setMyCommands([{ command: 'start', description: 'Начать' }]);
      await bot.api.setMyDescription(DESCRIPTION);
      await bot.api.setMyShortDescription(SHORT_DESCRIPTION);
      await bot.api.setChatMenuButton({
        menu_button: { type: 'web_app', text: MENU_BUTTON, web_app: { url: webAppUrl } },
      });
    } catch (e) {
      this.logger.warn(`Bot profile setup failed: ${(e as Error).message}`);
    }
  }
}
