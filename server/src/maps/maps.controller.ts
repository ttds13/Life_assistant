import { Controller, Get, Inject, Query } from '@nestjs/common'
import { GeocodeDto, PlaceSuggestionsDto, ReverseGeocodeDto } from './dto/map-query.dto'
import { MapsService } from './maps.service'

@Controller('maps')
export class MapsController {
  constructor(@Inject(MapsService) private readonly mapsService: MapsService) {}

  @Get('geocode')
  geocode(@Query() query: GeocodeDto) {
    return this.mapsService.geocode(query.address, query.city)
  }

  @Get('reverse-geocode')
  reverseGeocode(@Query() query: ReverseGeocodeDto) {
    return this.mapsService.reverseGeocode(query.latitude, query.longitude)
  }

  @Get('place-suggestions')
  placeSuggestions(@Query() query: PlaceSuggestionsDto) {
    return this.mapsService.placeSuggestions(query.keyword, query.city)
  }
}
