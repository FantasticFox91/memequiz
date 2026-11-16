import { z } from 'zod';

/*
 * Общие карты нефти (/map). Раскладку (точки, связи, союзы) меняет только владелец,
 * держателей точек отмечает любой, у кого есть ссылка. Изменения расходятся по SSE.
 */

export const OIL_MAP_LIMITS = {
  points: 500,
  links: 1500,
  alliances: 16,
  // карт у одного владельца
  maps: 30,
  // фон-скриншот, байт
  image: 3 * 1024 * 1024,
} as const;

export const OIL_MAP_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// id точек и союзов генерирует клиент
const localIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'id: латиница, цифры, _ и -');

// id карты он же код в ссылке /map?id=
export const oilMapIdSchema = z.string().regex(/^[A-Za-z0-9]{10}$/);

export const oilPointTypeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', '★']);
export type OilPointType = z.infer<typeof oilPointTypeSchema>;

const coordSchema = z.number().min(0).max(100);

export const oilMapPointSchema = z.object({
  id: localIdSchema,
  type: oilPointTypeSchema,
  // позиция в процентах от размеров карты
  x: coordSchema,
  y: coordSchema,
  // сколько очков точка даёт держателю к сбросу
  reward: z.int().min(0).max(1_000_000),
  name: z.string().max(20),
});

export const oilAllianceSchema = z.object({
  id: localIdSchema,
  name: z.string().max(24),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const oilMapLayoutSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    // ширина / высота карты: берётся из фона, без него 1
    aspect: z.number().min(0.1).max(10),
    points: z.array(oilMapPointSchema).max(OIL_MAP_LIMITS.points),
    links: z.array(z.tuple([localIdSchema, localIdSchema])).max(OIL_MAP_LIMITS.links),
    alliances: z.array(oilAllianceSchema).min(1).max(OIL_MAP_LIMITS.alliances),
  })
  .superRefine((layout, ctx) => {
    const pointIds = new Set(layout.points.map((p) => p.id));
    if (pointIds.size !== layout.points.length) {
      ctx.addIssue({ code: 'custom', path: ['points'], message: 'id точек повторяются' });
    }
    if (new Set(layout.alliances.map((a) => a.id)).size !== layout.alliances.length) {
      ctx.addIssue({ code: 'custom', path: ['alliances'], message: 'id союзов повторяются' });
    }
    if (layout.links.some(([a, b]) => a === b || !pointIds.has(a) || !pointIds.has(b))) {
      ctx.addIssue({ code: 'custom', path: ['links'], message: 'связь с несуществующей точкой' });
    }
  });

export type OilMapPoint = z.infer<typeof oilMapPointSchema>;
export type OilAlliance = z.infer<typeof oilAllianceSchema>;
export type OilMapLayout = z.infer<typeof oilMapLayoutSchema>;

// POST /api/oil-maps
export const oilMapCreateSchema = z.object({ layout: oilMapLayoutSchema });

// PUT /api/oil-maps/:id — version: с какой версии начинали править; устарела → 409
export const oilMapUpdateSchema = z.object({
  version: z.int().min(1),
  layout: oilMapLayoutSchema,
});

// PUT /api/oil-maps/:id/holders/:pointId — holder: id союза, null — точка свободна.
// by: ник для ленты изменений на сайте; в Telegram берётся из профиля
export const oilHolderUpdateSchema = z.object({
  holder: localIdSchema.nullable(),
  by: z.string().max(24).optional(),
});

// GET /api/oil-maps/:id
export interface OilMapResponse {
  id: string;
  layout: OilMapLayout;
  // точка → союз
  holders: Record<string, string>;
  version: number;
  // 0 — фона нет; иначе версия для ссылки GET /api/oil-maps/:id/image?v=
  imageVersion: number;
  isOwner: boolean;
  updatedAt: string;
}

// GET /api/oil-maps — карты, которые создал текущий участник
export interface OilMapListItem {
  id: string;
  name: string;
  updatedAt: string;
}

// GET /api/oil-maps/:id/events — SSE, по одному JSON в data
export type OilMapEvent =
  | { type: 'holder'; pointId: string; holder: string | null; by: string | null; at: string }
  | { type: 'layout'; version: number }
  | { type: 'image'; imageVersion: number }
  | { type: 'presence'; online: number }
  | { type: 'deleted' };
