import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitsService } from './units.service.js';

@ApiTags('Units')
@Controller('properties/:slug/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: list all units for a property' })
  findAll(@Param('slug') slug: string) {
    return this.unitsService.findAll(slug);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public: get unit detail' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: add unit to property' })
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateUnitDto,
  ) {
    return this.unitsService.create(slug, user.id, user.role, dto);
  }

  @Patch(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: update a unit' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdateUnitDto,
  ) {
    return this.unitsService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: delete a unit' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.unitsService.remove(id, user.id, user.role);
  }
}
