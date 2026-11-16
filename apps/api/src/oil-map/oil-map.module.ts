import { Module } from '@nestjs/common';
import { OilMapController } from './oil-map.controller';
import { OilMapEvents } from './oil-map.events';
import { OilMapService } from './oil-map.service';

@Module({
  controllers: [OilMapController],
  providers: [OilMapService, OilMapEvents],
})
export class OilMapModule {}
