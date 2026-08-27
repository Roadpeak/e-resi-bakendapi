import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CreateTagDto,
  CreateWaypointDto,
  UpdateWaypointDto,
  UpsertTwinDto,
} from './dto/twin.dto.js';
import { TwinsService } from './twins.service.js';

@ApiTags('Digital twins')
@Controller('properties/:slug/twin')
export class TwinsController {
  constructor(private readonly service: TwinsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: every 3D model for a property, with stops and tags' })
  list(@Param('slug') slug: string) {
    return this.service.list(slug);
  }

  /**
   * Buffered through the API rather than presigned direct to storage, because
   * the file has to be parsed before it is accepted — a corrupt or mislabelled
   * model that reaches storage is one a buyer discovers as an empty viewer.
   * The 300 MB ceiling is a working file's worth of headroom; the published
   * budget is far below it.
   */
  @Post('mesh')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Admin: upload a .glb model for a property' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 300 * 1024 * 1024 } }))
  uploadMesh(
    @Param('slug') slug: string,
    @CurrentUser() user: { role: UserRole },
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
    @Query('kind') kind?: 'mesh' | 'proxy',
    /** Replaces this model rather than adding another. */
    @Query('twinId') twinId?: string,
    @Query('label') label?: string,
    @Query('twinKind') twinKind?: string,
  ) {
    return this.service.uploadMesh(slug, user.role, file, {
      kind: kind === 'proxy' ? 'proxy' : 'mesh',
      twinId,
      label,
      twinKind,
    });
  }

  @Patch(':twinId')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: label, kind, scale, floors and capture details' })
  update(
    @Param('twinId') twinId: string,
    @CurrentUser() user: { role: UserRole },
    @Body() dto: UpsertTwinDto,
  ) {
    return this.service.update(twinId, user.role, dto);
  }

  @Delete(':twinId')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove one model' })
  remove(@Param('twinId') twinId: string, @CurrentUser() user: { role: UserRole }) {
    return this.service.remove(twinId, user.role);
  }

  @Post(':twinId/waypoints')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a stop to the guided tour' })
  addWaypoint(
    @Param('twinId') twinId: string,
    @CurrentUser() user: { role: UserRole },
    @Body() dto: CreateWaypointDto,
  ) {
    return this.service.addWaypoint(twinId, user.role, dto);
  }

  @Patch('waypoints/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: edit a stop (moving it clears its panorama)' })
  updateWaypoint(
    @Param('id') id: string,
    @CurrentUser() user: { role: UserRole },
    @Body() dto: UpdateWaypointDto,
  ) {
    return this.service.updateWaypoint(id, user.role, dto);
  }

  @Patch(':twinId/waypoints/order')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: reorder the stops' })
  reorderWaypoints(
    @Param('twinId') twinId: string,
    @CurrentUser() user: { role: UserRole },
    @Body() body: { ids: string[] },
  ) {
    return this.service.reorderWaypoints(twinId, user.role, body.ids ?? []);
  }

  @Delete('waypoints/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a stop' })
  removeWaypoint(@Param('id') id: string, @CurrentUser() user: { role: UserRole }) {
    return this.service.removeWaypoint(id, user.role);
  }

  /**
   * Long-running by nature — around twenty-five seconds per stop, in a browser.
   * Kept synchronous because it is an admin action taken once after placing the
   * stops, and an author watching it finish is better served than one polling a
   * job they have no other reason to care about.
   */
  @Post(':twinId/panoramas')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: render a 360° view from every stop' })
  bakePanoramas(
    @Param('twinId') twinId: string,
    @CurrentUser() user: { role: UserRole },
    @Query('stale') stale?: string,
  ) {
    return this.service.bakePanoramas(twinId, user.role, { stale: stale === 'true' });
  }

  @Post(':twinId/tags')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: pin a tag in the model' })
  addTag(
    @Param('twinId') twinId: string,
    @CurrentUser() user: { role: UserRole },
    @Body() dto: CreateTagDto,
  ) {
    return this.service.addTag(twinId, user.role, dto);
  }

  @Delete('tags/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a tag' })
  removeTag(@Param('id') id: string, @CurrentUser() user: { role: UserRole }) {
    return this.service.removeTag(id, user.role);
  }
}
