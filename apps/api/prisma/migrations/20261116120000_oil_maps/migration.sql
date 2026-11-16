-- Общие карты нефти (/map): раскладка у владельца, держатели точек — отдельными строками
-- CreateTable
CREATE TABLE "oil_maps" (
    "id" TEXT NOT NULL,
    "owner_source" "ParticipantSource" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "image" BYTEA,
    "image_type" TEXT,
    "image_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oil_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oil_map_holders" (
    "map_id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "alliance_id" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oil_map_holders_pkey" PRIMARY KEY ("map_id","point_id")
);

-- CreateIndex
CREATE INDEX "oil_maps_owner_source_owner_id_idx" ON "oil_maps"("owner_source", "owner_id");

-- AddForeignKey
ALTER TABLE "oil_map_holders" ADD CONSTRAINT "oil_map_holders_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "oil_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

