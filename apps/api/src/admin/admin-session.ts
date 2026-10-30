import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env';
import { readCookie } from '../participant/participant.resolver';

export const ADMIN_COOKIE = 'mq_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// хэши одной длины: timingSafeEqual не выдаёт ни содержимое, ни длину
const digest = (value: string) => createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * Сессия админки без хранения на сервере: кука `<истекает_мс>.<hmac>`.
 * Ключ подписи выводится из логина и пароля, поэтому смена пароля разлогинивает все сессии.
 */
@Injectable()
export class AdminSession {
  private readonly username: string | undefined;
  private readonly password: string | undefined;
  private readonly key: Buffer | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.username = config.get('ADMIN_USERNAME', { infer: true });
    this.password = config.get('ADMIN_PASSWORD', { infer: true });
    if (this.username && this.password) {
      this.key = digest(`memequiz-admin-session:${this.username}:${this.password}`);
    }
  }

  get enabled(): boolean {
    return !!this.key;
  }

  checkCredentials(username: string, password: string): boolean {
    if (!this.username || !this.password) return false;
    // оба сравнения всегда: время ответа не подсказывает, что угадан логин
    const userOk = safeEqual(username, this.username);
    const passwordOk = safeEqual(password, this.password);
    return userOk && passwordOk;
  }

  issue(res: Response): void {
    const expires = Date.now() + SESSION_TTL_MS;
    res.cookie(ADMIN_COOKIE, `${expires}.${this.sign(String(expires))}`, {
      httpOnly: true,
      // Strict: запросы к /api/admin с чужих сайтов уходят без куки (защита от CSRF)
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/admin',
      maxAge: SESSION_TTL_MS,
    });
  }

  clear(res: Response): void {
    res.clearCookie(ADMIN_COOKIE, { path: '/api/admin' });
  }

  isValid(req: Request): boolean {
    if (!this.key) return false;
    const value = readCookie(req, ADMIN_COOKIE);
    const [expires, signature] = value?.split('.') ?? [];
    if (!expires || !signature || !/^\d+$/.test(expires)) return false;
    if (Number(expires) < Date.now()) return false;
    return safeEqual(signature, this.sign(expires));
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key!).update(payload).digest('base64url');
  }
}
