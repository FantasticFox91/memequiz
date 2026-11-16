import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { OilMapEvent } from '@memequiz/shared';
import type { Response } from 'express';

// комментарий в потоке раз в 25 с: прокси и мобильные сети не рвут «тихое» соединение
const HEARTBEAT_MS = 25_000;

/**
 * Живые изменения карт по SSE. Подписчики хранятся в памяти: api — один процесс на сервер,
 * а при перезапуске EventSource сам переподключается и клиент перечитывает карту.
 */
@Injectable()
export class OilMapEvents implements OnModuleDestroy {
  private readonly streams = new Map<string, Set<Response>>();
  private readonly heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);

  constructor() {
    this.heartbeat.unref();
  }

  subscribe(mapId: string, res: Response): void {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform: Caddy (encode) не сжимает поток и не копит его в буфере
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // после обрыва EventSource переподключается сам через 3 с
    res.write('retry: 3000\n\n');

    let set = this.streams.get(mapId);
    if (!set) {
      set = new Set();
      this.streams.set(mapId, set);
    }
    set.add(res);
    res.on('close', () => {
      set.delete(res);
      if (set.size) this.presence(mapId);
      else if (this.streams.get(mapId) === set) this.streams.delete(mapId);
    });
    this.presence(mapId);
  }

  emit(mapId: string, event: OilMapEvent): void {
    const set = this.streams.get(mapId);
    if (!set) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) res.write(data);
  }

  // карта удалена: сообщаем и закрываем потоки
  close(mapId: string): void {
    this.emit(mapId, { type: 'deleted' });
    for (const res of this.streams.get(mapId) ?? []) res.end();
    this.streams.delete(mapId);
  }

  private presence(mapId: string): void {
    this.emit(mapId, { type: 'presence', online: this.streams.get(mapId)?.size ?? 0 });
  }

  private ping(): void {
    for (const set of this.streams.values()) for (const res of set) res.write(': ping\n\n');
  }

  // открытые потоки не дают серверу закрыться при остановке контейнера
  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const set of this.streams.values()) for (const res of set) res.end();
    this.streams.clear();
  }
}
