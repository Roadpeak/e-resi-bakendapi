import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { LeadsService } from './leads.service.js';

/** A staff request carries the employer's id and the member's own identity (see jwt.strategy). */
type Actor = {
  id: string;
  firstName: string;
  lastName: string;
  staff?: { userId: string; firstName: string; lastName: string };
};

@ApiTags('Leads')
@ApiBearerAuth()
@Roles(UserRole.DEVELOPER, UserRole.AGENT, UserRole.ADMIN)
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Developer: every lead — automatic, from agents, and added by the team' })
  list(@CurrentUser() user: Actor) {
    return this.service.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Developer: add a lead by hand' })
  create(@CurrentUser() user: Actor, @Body() dto: CreateLeadDto) {
    const author = user.staff
      ? { id: user.staff.userId, name: `${user.staff.firstName} ${user.staff.lastName}`.trim() }
      : { id: user.id, name: `${user.firstName} ${user.lastName}`.trim() };
    return this.service.create(user.id, author, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Developer: update a hand-added lead' })
  update(@CurrentUser() user: Actor, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Developer: delete a hand-added lead' })
  remove(@CurrentUser() user: Actor, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
