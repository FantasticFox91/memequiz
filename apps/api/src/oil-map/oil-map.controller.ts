import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  OIL_MAP_IMAGE_TYPES,
  type OilMapListItem,
  type OilMapResponse,
  normalizeNickname,
  oilHolderUpdateSchema,
  oilMapCreateSchema,
  oilMapIdSchema,
  oilMapUpdateSchema,
} from '@memequiz/shared';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OIL_MAP_CREATE_LIMITS, OIL_MAP_IMAGE_LIMITS } from '../common/throttling';
import { createZodDto } from '../common/zod-validation.pipe';
import { CurrentParticipant } from '../participant/current-participant.decorator';
import { isNicknameAllowed } from '../participant/nickname-filter';
import type { ParticipantIdentity } from '../participant/participant.resolver';
import { OilMapEvents } from './oil-map.events';
import { OilMapService } from './oil-map.service';

class CreateDto extends createZodDto(oilMapCreateSchema) {}
class UpdateDto extends createZodDto(oilMapUpdateSchema) {}
class HolderDto extends createZodDto(oilHolderUpdateSchema) {}

const POINT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// неизвестный формат id — та же 404, что и для несуществующей карты
function mapId(raw: string): string {
  if (!oilMapIdSchema.safeParse(raw).success) throw new NotFoundException('Карта не найдена');
  return raw;
}

// ник для ленты изменений: в Telegram из профиля, на сайте — присланный, если приличный
function author(identity: ParticipantIdentity, by: string | undefined): string | null {
  if (identity.fixedNickname) return identity.fixedNickname;
  const nickname = by ? normalizeNickname(by) : '';
  return nickname && isNicknameAllowed(nickname) ? nickname : null;
}

@Controller('oil-maps')
export class OilMapController {
  constructor(
    private readonly maps: OilMapService,
    private readonly events: OilMapEvents,
  ) {}

  @Get()
  list(@CurrentParticipant() identity: ParticipantIdentity): Promise<OilMapListItem[]> {
    return this.maps.list(identity);
  }

  @Post()
  @Throttle(OIL_MAP_CREATE_LIMITS)
  create(
    @Body() body: CreateDto,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<OilMapResponse> {
    return this.maps.create(identity, body.layout);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<OilMapResponse> {
    return this.maps.get(mapId(id), identity);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateDto,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<OilMapResponse> {
    return this.maps.updateLayout(mapId(id), identity, body.version, body.layout);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @Param('id') id: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    return this.maps.delete(mapId(id), identity);
  }

  @Put(':id/holders/:pointId')
  @HttpCode(204)
  setHolder(
    @Param('id') id: string,
    @Param('pointId') pointId: string,
    @Body() body: HolderDto,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    if (!POINT_ID_RE.test(pointId)) throw new NotFoundException('Этой точки уже нет на карте');
    return this.maps.setHolder(mapId(id), pointId, body.holder, author(identity, body.by));
  }

  @Delete(':id/holders')
  @HttpCode(204)
  clearHolders(
    @Param('id') id: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    return this.maps.clearHolders(mapId(id), identity);
  }

  // тело — сами байты картинки (Content-Type: image/jpeg|png|webp), raw-парсер в main.ts
  @Put(':id/image')
  @HttpCode(204)
  @Throttle(OIL_MAP_IMAGE_LIMITS)
  setImage(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    const type = req.headers['content-type']?.split(';')[0]?.trim() ?? '';
    const body: unknown = req.body;
    if (!(OIL_MAP_IMAGE_TYPES as readonly string[]).includes(type) || !Buffer.isBuffer(body)) {
      throw new BadRequestException('Нужна картинка JPEG, PNG или WebP');
    }
    if (!body.length) throw new BadRequestException('Пустая картинка');
    return this.maps.setImage(mapId(id), identity, body, type);
  }

  @Delete(':id/image')
  @HttpCode(204)
  removeImage(
    @Param('id') id: string,
    @CurrentParticipant() identity: ParticipantIdentity,
  ): Promise<void> {
    return this.maps.setImage(mapId(id), identity, null, null);
  }

  // ссылка всегда с ?v=<imageVersion>: новая картинка — новая ссылка, кэшируем навсегда
  @Get(':id/image')
  async getImage(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const image = await this.maps.getImage(mapId(id));
    res
      .type(image.type)
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.data);
  }

  @Get(':id/events')
  async stream(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const map = mapId(id);
    await this.maps.assertExists(map);
    this.events.subscribe(map, res);
  }
}
