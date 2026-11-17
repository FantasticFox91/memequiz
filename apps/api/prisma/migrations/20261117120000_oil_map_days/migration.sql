-- Дни на карте нефти: держатели хранятся отдельно на каждый день, старые отметки — день 1
ALTER TABLE "oil_maps" ADD COLUMN "days" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "oil_map_holders" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "oil_map_holders" DROP CONSTRAINT "oil_map_holders_pkey";
ALTER TABLE "oil_map_holders" ADD CONSTRAINT "oil_map_holders_pkey" PRIMARY KEY ("map_id", "day", "point_id");
