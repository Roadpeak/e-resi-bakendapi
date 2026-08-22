import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateCinematicSceneDto } from './dto/create-cinematic-scene.dto.js';
import { CreateFloorPlanDto } from './dto/create-floor-plan.dto.js';
import { CreateTourSceneDto, CreateTourSectionDto } from './dto/create-tour-section.dto.js';
import { ToursService } from './tours.service.js';

@ApiTags('Tours')
@Controller('properties/:slug/tours')
export class ToursController {
  constructor(private readonly service: ToursService) {}

  // ─── Cinematic ────────────────────────────────────────────────────────────

  @Public()
  @Get('cinematic')
  @ApiOperation({ summary: 'Public: list cinematic scenes for a property' })
  listCinematic(@Param('slug') slug: string) {
    return this.service.listCinematicScenes(slug);
  }

  @Post('cinematic')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: add a cinematic scene' })
  addCinematic(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateCinematicSceneDto,
  ) {
    return this.service.addCinematicScene(slug, user.id, user.role, dto);
  }

  @Delete('cinematic/:id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: remove a cinematic scene' })
  removeCinematic(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeCinematicScene(id, user.id, user.role);
  }

  // ─── 3D Tour ──────────────────────────────────────────────────────────────

  @Public()
  @Get('3d')
  @ApiOperation({ summary: 'Public: get 3D tour sections + scenes for a property' })
  list3D(@Param('slug') slug: string) {
    return this.service.list3DTour(slug);
  }

  /**
   * 3D and VR are staff-only from here down.
   *
   * Both need a capture rig — a scanner or a 360° camera — and an upload from
   * anything else succeeds while producing something broken: a warped headset
   * scene, or a tour of nothing. That fails the worst way, looking finished to
   * whoever uploaded it and wrong to the buyer. Cinematic stays open to
   * developers, because an ordinary film is something they can genuinely make.
   *
   * Enforced here as well as hidden in the dashboard: a cached page or a
   * direct call would otherwise still write.
   */
  @Post('3d/sections')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a 3D tour section' })
  addSection(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateTourSectionDto,
  ) {
    return this.service.addTourSection(slug, user.id, user.role, dto);
  }

  @Post('3d/sections/:sectionId/scenes')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a scene to a 3D tour section' })
  addScene(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateTourSceneDto,
  ) {
    return this.service.addTourScene(sectionId, user.id, user.role, dto);
  }

  @Delete('3d/sections/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a 3D tour section (and its scenes)' })
  removeSection(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeTourSection(id, user.id, user.role);
  }

  @Delete('3d/scenes/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a single 3D tour scene' })
  remove3DScene(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove3DScene(id, user.id, user.role);
  }

  // ─── VR Tour ──────────────────────────────────────────────────────────────

  @Public()
  @Get('vr')
  @ApiOperation({ summary: 'Public: list VR tour scenes for a property' })
  listVR(@Param('slug') slug: string) {
    return this.service.listVRTour(slug);
  }

  @Post('vr')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a VR scene' })
  addVRScene(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateTourSceneDto,
  ) {
    return this.service.addVRScene(slug, user.id, user.role, dto);
  }

  @Delete('vr/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a VR scene' })
  removeVRScene(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeVRScene(id, user.id, user.role);
  }

  // ─── Floor Plans ──────────────────────────────────────────────────────────

  @Public()
  @Get('floor-plans')
  @ApiOperation({ summary: 'Public: list floor plans for a property' })
  listFloorPlans(@Param('slug') slug: string) {
    return this.service.listFloorPlans(slug);
  }

  @Post('floor-plans')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: add a floor plan' })
  addFloorPlan(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateFloorPlanDto,
  ) {
    return this.service.addFloorPlan(slug, user.id, user.role, dto);
  }

  @Delete('floor-plans/:id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: remove a floor plan' })
  removeFloorPlan(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeFloorPlan(id, user.id, user.role);
  }
}
