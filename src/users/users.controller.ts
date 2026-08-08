import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KybStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto.js';
import { UpdateDeveloperProfileDto } from './dto/update-developer-profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list all users' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  findAll(@Query() pagination: PaginationDto, @Query('role') role?: UserRole) {
    return this.usersService.findAll(pagination, role);
  }

  // ─── Self ─────────────────────────────────────────────────────────────────
  // Everything below with a literal first segment (me, developers, ...) must
  // stay above ':id' — Nest matches routes in declaration order, and ':id' is
  // an unconstrained single-segment wildcard that will otherwise swallow any
  // literal route added after it. This bit a real deploy once already: the
  // public developer directory landed below ':id' and every request came back
  // 401, because it was being handled by the ADMIN-only findOne() below
  // instead of the @Public() handler that was actually declared for it.

  @Get('me')
  @ApiOperation({ summary: 'Get own user record (any authenticated role)' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.findOne(user.id);
  }

  @Patch('developers/:profileId/kyb')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: update developer KYB status' })
  updateKybStatus(
    @Param('profileId') profileId: string,
    @Body('status') status: KybStatus,
  ) {
    return this.usersService.updateKybStatus(profileId, status);
  }

  // ─── Developer self-service ───────────────────────────────────────────────

  @Get('developers/me')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: get own company profile' })
  getMyDeveloperProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.getMyDeveloperProfile(user.id);
  }

  @Patch('developers/me')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: update own company profile' })
  updateMyDeveloperProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateDeveloperProfileDto,
  ) {
    return this.usersService.updateMyDeveloperProfile(user.id, dto);
  }

  @Post('developers/me/onboarding')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: submit the onboarding wizard for review' })
  submitOnboarding(
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitOnboardingDto,
  ) {
    return this.usersService.submitOnboarding(user.id, dto);
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  @Public()
  @Get('developers')
  @ApiOperation({
    summary: 'Public: directory of KYB-approved developers with at least one live listing',
  })
  listPublicDevelopers(@Query() pagination: PaginationDto) {
    return this.usersService.listPublicDevelopers(pagination);
  }

  @Public()
  @Get('developers/id/:profileId')
  @ApiOperation({
    summary: 'Public: developer profile by profile id, with active properties',
  })
  getPublicDeveloperProfile(@Param('profileId') profileId: string) {
    return this.usersService.getPublicDeveloperProfile(profileId);
  }

  @Public()
  @Get('developers/:userId/profile')
  @ApiOperation({ summary: 'Public: get developer profile (with active properties)' })
  getDeveloperProfile(@Param('userId') userId: string) {
    return this.usersService.getDeveloperProfileByUserId(userId);
  }

  // ─── Admin: by id ───────────────────────────────────────────────────────────
  // ':id' is an unconstrained single-segment wildcard — it matches the literal
  // word "developers" just as readily as a real id. (path-to-regexp 8, which
  // this Nest/Express version uses, removed inline :id(regex) constraints
  // entirely — there is no way to make the route itself reject non-id text.)
  // The only real defence is declaration order: every literal route above
  // this one must stay above it, or it gets silently swallowed here instead —
  // exactly what happened to the public developer directory before this fix,
  // where every request 401'd because it was hitting this ADMIN-only handler.
  // If you add a new top-level literal route to this controller, it MUST go
  // above this line.

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: enable or disable a user account' })
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.usersService.setActive(id, isActive);
  }
}
