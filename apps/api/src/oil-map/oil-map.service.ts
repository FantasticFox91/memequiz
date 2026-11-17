import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OIL_MAP_LIMITS,
  type OilMapLayout,
  type OilMapListItem,
  type OilMapResponse,
} from '@memequiz/shared';
import { randomInt } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import type { ParticipantIdentity } from '../participant/participant.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { OilMapEvents } from './oil-map.events';

type Owner = Pick<ParticipantIdentity, 'source' | 'externalId'>;

// без похожих символов (0/O, 1/l/I): код из ссылки удобно продиктовать
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 10;

function newMapId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

const ownerWhere = (owner: Owner) => ({ ownerSource: owner.source, ownerId: owner.externalId });

// картинку тянем только в getImage
const WITHOUT_IMAGE = { omit: { image: true }, include: { holders: true } } as const;
type MapRow = Prisma.OilMapGetPayload<typeof WITHOUT_IMAGE>;

function toResponse(map: MapRow, owner: Owner): OilMapResponse {
  const days: Record<string, string>[] = Array.from({ length: map.days }, () => ({}));
  for (const h of map.holders) {
    const day = days[h.day - 1];
    if (day) day[h.pointId] = h.allianceId;
  }
  return {
    id: map.id,
    layout: map.layout as OilMapLayout,
    days,
    version: map.version,
    imageVersion: map.imageType ? map.imageVersion : 0,
    isOwner: map.ownerSource === owner.source && map.ownerId === owner.externalId,
    updatedAt: map.updatedAt.toISOString(),
  };
}

@Injectable()
export class OilMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OilMapEvents,
  ) {}

  async list(owner: Owner): Promise<OilMapListItem[]> {
    const maps = await this.prisma.oilMap.findMany({
      where: ownerWhere(owner),
      select: { id: true, name: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return maps.map((m) => ({ ...m, updatedAt: m.updatedAt.toISOString() }));
  }

  async get(id: string, owner: Owner): Promise<OilMapResponse> {
    const map = await this.prisma.oilMap.findUnique({ where: { id }, ...WITHOUT_IMAGE });
    if (!map) throw new NotFoundException('Карта не найдена');
    return toResponse(map, owner);
  }

  async assertExists(id: string): Promise<void> {
    const map = await this.prisma.oilMap.findUnique({ where: { id }, select: { id: true } });
    if (!map) throw new NotFoundException('Карта не найдена');
  }

  async create(owner: Owner, layout: OilMapLayout, from?: string): Promise<OilMapResponse> {
    const count = await this.prisma.oilMap.count({ where: ownerWhere(owner) });
    if (count >= OIL_MAP_LIMITS.maps) {
      throw new BadRequestException(`Не больше ${OIL_MAP_LIMITS.maps} карт: удали старые`);
    }

    // основа — любая карта по ссылке: раскладка и фон у неё и так открыты всем
    const base = from
      ? await this.prisma.oilMap.findUnique({
          where: { id: from },
          select: { layout: true, image: true, imageType: true },
        })
      : null;
    if (from && !base) throw new NotFoundException('Карта-основа не найдена');
    const finalLayout = base ? { ...(base.layout as OilMapLayout), name: layout.name } : layout;

    const map = await this.prisma.oilMap.create({
      data: {
        id: newMapId(),
        ownerSource: owner.source,
        ownerId: owner.externalId,
        name: finalLayout.name,
        layout: finalLayout as Prisma.InputJsonObject,
        ...(base?.image && base.imageType
          ? { image: base.image, imageType: base.imageType, imageVersion: 1 }
          : {}),
      },
      ...WITHOUT_IMAGE,
    });
    return toResponse(map, owner);
  }

  /**
   * Сохранение раскладки с оптимистичной блокировкой: version — с какой версии начинали править.
   * Если карту успели сохранить с другого устройства, отвечаем 409 и ничего не перетираем.
   */
  async updateLayout(
    id: string,
    owner: Owner,
    version: number,
    layout: OilMapLayout,
  ): Promise<OilMapResponse> {
    await this.assertOwner(id, owner);
    const pointIds = layout.points.map((p) => p.id);
    const allianceIds = layout.alliances.map((a) => a.id);

    const map = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.oilMap.updateMany({
        where: { id, version },
        data: {
          name: layout.name,
          layout: layout as Prisma.InputJsonObject,
          version: { increment: 1 },
        },
      });
      if (!count) throw new ConflictException('Карта уже изменилась с другого устройства');
      // держатели удалённых точек и союзов больше не нужны
      await tx.oilMapHolder.deleteMany({
        where: {
          mapId: id,
          OR: [{ pointId: { notIn: pointIds } }, { allianceId: { notIn: allianceIds } }],
        },
      });
      return tx.oilMap.findUniqueOrThrow({ where: { id }, ...WITHOUT_IMAGE });
    });

    this.events.emit(id, { type: 'layout', version: map.version });
    return toResponse(map, owner);
  }

  // держателя отмечает любой со ссылкой; одна строка на точку — разные точки не конфликтуют
  async setHolder(
    id: string,
    day: number,
    pointId: string,
    holder: string | null,
    by: string | null,
  ): Promise<void> {
    const map = await this.prisma.oilMap.findUnique({
      where: { id },
      select: { layout: true, days: true },
    });
    if (!map) throw new NotFoundException('Карта не найдена');
    if (day > map.days) throw new NotFoundException('Такого дня уже нет на карте');
    const layout = map.layout as OilMapLayout;
    if (!layout.points.some((p) => p.id === pointId)) {
      throw new NotFoundException('Этой точки уже нет на карте');
    }
    if (holder && !layout.alliances.some((a) => a.id === holder)) {
      throw new BadRequestException('Такого союза уже нет на карте');
    }

    if (holder) {
      await this.prisma.oilMapHolder.upsert({
        where: { mapId_day_pointId: { mapId: id, day, pointId } },
        create: { mapId: id, day, pointId, allianceId: holder, updatedBy: by },
        update: { allianceId: holder, updatedBy: by },
      });
    } else {
      await this.prisma.oilMapHolder.deleteMany({ where: { mapId: id, day, pointId } });
    }
    this.events.emit(id, {
      type: 'holder',
      day,
      pointId,
      holder,
      by,
      at: new Date().toISOString(),
    });
  }

  async clearHolders(id: string, owner: Owner, day: number): Promise<void> {
    await this.assertOwner(id, owner);
    await this.prisma.oilMapHolder.deleteMany({ where: { mapId: id, day } });
    await this.bumpVersion(id);
  }

  // новый день начинается с расстановки последнего: обычно точки остаются у тех же союзов
  async addDay(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const map = await tx.oilMap.findUnique({ where: { id }, select: { days: true } });
      if (!map) throw new NotFoundException('Карта не найдена');
      if (map.days >= OIL_MAP_LIMITS.days) {
        throw new BadRequestException(`Не больше ${OIL_MAP_LIMITS.days} дней на карте`);
      }
      // условие на days: два одновременных «новый день» не создадут дубль
      const { count } = await tx.oilMap.updateMany({
        where: { id, days: map.days },
        data: { days: { increment: 1 } },
      });
      if (!count) throw new ConflictException('День уже добавили — обнови карту');
      const last = await tx.oilMapHolder.findMany({ where: { mapId: id, day: map.days } });
      await tx.oilMapHolder.createMany({
        data: last.map((h) => ({
          mapId: id,
          day: map.days + 1,
          pointId: h.pointId,
          allianceId: h.allianceId,
          updatedBy: h.updatedBy,
        })),
      });
    });
    await this.bumpVersion(id);
  }

  async removeLastDay(id: string, owner: Owner): Promise<void> {
    await this.assertOwner(id, owner);
    await this.prisma.$transaction(async (tx) => {
      const map = await tx.oilMap.findUniqueOrThrow({ where: { id }, select: { days: true } });
      if (map.days <= 1) throw new BadRequestException('Единственный день не удалить');
      await tx.oilMapHolder.deleteMany({ where: { mapId: id, day: map.days } });
      await tx.oilMap.update({ where: { id }, data: { days: map.days - 1 } });
    });
    await this.bumpVersion(id);
  }

  // как после сохранения раскладки: клиенты перечитают карту целиком
  private async bumpVersion(id: string): Promise<void> {
    const map = await this.prisma.oilMap.update({
      where: { id },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    this.events.emit(id, { type: 'layout', version: map.version });
  }

  /*
   * Версия фона только растёт (и при удалении): иначе после «убрать → поставить новый»
   * ссылка ?v= совпала бы со старой и браузер показал бы закэшированную картинку.
   */
  async setImage(id: string, owner: Owner, image: Buffer | null, type: string | null) {
    await this.assertOwner(id, owner);
    const map = await this.prisma.oilMap.update({
      where: { id },
      data: {
        image: image ? new Uint8Array(image) : null,
        imageType: image ? type : null,
        imageVersion: { increment: 1 },
      },
      select: { imageVersion: true },
    });
    this.events.emit(id, { type: 'image', imageVersion: image ? map.imageVersion : 0 });
  }

  async getImage(id: string): Promise<{ data: Buffer; type: string }> {
    const map = await this.prisma.oilMap.findUnique({
      where: { id },
      select: { image: true, imageType: true },
    });
    if (!map?.image || !map.imageType) throw new NotFoundException('Фона нет');
    return { data: Buffer.from(map.image), type: map.imageType };
  }

  async delete(id: string, owner: Owner): Promise<void> {
    await this.assertOwner(id, owner);
    await this.prisma.oilMap.delete({ where: { id } });
    this.events.close(id);
  }

  private async assertOwner(id: string, owner: Owner): Promise<void> {
    const map = await this.prisma.oilMap.findUnique({
      where: { id },
      select: { ownerSource: true, ownerId: true },
    });
    if (!map) throw new NotFoundException('Карта не найдена');
    if (map.ownerSource !== owner.source || map.ownerId !== owner.externalId) {
      throw new ForbiddenException('Менять карту может только её создатель');
    }
  }
}
