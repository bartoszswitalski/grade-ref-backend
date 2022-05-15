import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../shared/types/role';
import { UserParams } from './params/UserParams';
import { UpdateUserDto } from './dto/update-user.dto';
import { LeagueParams } from '../leagues/params/LeagueParams';
import { LeagueUserParams } from '../leagues/params/LeagueUserParams';
import { LeaguesService } from '../leagues/leagues.service';
import { OwnerGuard } from '../shared/guards/owner.guard';
import { LeagueAdminGuard } from '../shared/guards/league-admin.guard';
import { AdminGuard } from '../shared/guards/admin.guard';

@ApiTags('users')
@Controller('')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService,
              private readonly leaguesService: LeaguesService) {}

  @Get('users')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiOperation({ summary: 'Get all users' })
  async getAll(): Promise<User[]> {
    return this.usersService.getAll();
  }

  @Get('users/referees')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get all referees' })
  async getAllReferees(): Promise<User[]> {
    return this.usersService.getAllByRole(Role.Referee);
  }

  @Get('users/observers')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get all observers' })
  async getAllObservers(): Promise<User[]> {
    return this.usersService.getAllByRole(Role.Observer);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiOperation({ summary: 'Create user' })
  async create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }

  @Put('users/:userId')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiOperation({ summary: 'Update user' })
  async update(@Param() params: UserParams, @Body() dto: UpdateUserDto): Promise<User> {
    return this.usersService.update(params, dto);
  }

  @Delete('users/:userId')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param() params: UserParams): Promise<User> {
    return this.usersService.remove(params);
  }

  @Get('leagues/:leagueId/referees')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Get referees assigned to a league' })
  async getReferees(@Param() params: LeagueParams): Promise<User[]> {
    return this.leaguesService.getLeagueReferees(params.leagueId);
  }

  @Get('leagues/:leagueId/observers')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Get observers assigned to a league' })
  async getObservers(@Param() params: LeagueParams): Promise<User[]> {
    return this.leaguesService.getLeagueObservers(params.leagueId);
  }

  @Get('leagues/:leagueId/admins')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Get league admins' })
  async getAdmins(@Param() params: LeagueParams): Promise<User[]> {
    return this.leaguesService.getLeagueAdmins(params.leagueId);
  }

  @Post('leagues/:leagueId/referees/:userId')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Assign referee to a league' })
  async assignReferee(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.assignRefereeToLeague(params, user);
  }

  @Post('leagues/:leagueId/observers/:userId')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Assign observer to a league' })
  async assignObserver(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.assignObserverToLeague(params, user);
  }

  @Post('leagues/:leagueId/admins/:userId')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiOperation({ summary: 'Add user as league admin' })
  async assignAdmin(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.assignAdminToLeague(params, user);
  }

  @Delete('leagues/:leagueId/referees/:userId')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Unassign referee from a league' })
  async unassignReferee(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.removeRefereeFromLeague(params, user);
  }

  @Delete('leagues/:leagueId/observers/:userId')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Unassign observer from a league' })
  async unassignObserver(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.removeObserverFromLeague(params, user);
  }

  @Delete('leagues/:leagueId/admins/:userId')
  @UseGuards(JwtAuthGuard, LeagueAdminGuard)
  @ApiOperation({ summary: 'Unassign league admin' })
  async unassignAdmin(@Param() params: LeagueUserParams): Promise<User[]> {
    const user: User = await this.usersService.getById(params.userId);
    return this.leaguesService.removeAdminFromLeague(params, user);
  }
}
