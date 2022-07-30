import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Match } from '../../entities/match.entity';
import { uuid } from '../../shared/constants/uuid.constant';
import { LeagueMatchParams } from './params/LeagueMatchParams';
import { LeagueUserParams } from '../leagues/params/LeagueUserParams';
import { AxiosResponse } from '@nestjs/terminus/dist/health-indicator/http/axios.interfaces';
import { User } from '../../entities/user.entity';
import { GradeMessage } from './dto/update-grade-sms.dto';
import { getNotNull } from '../../shared/getters';
import { Team } from '../../entities/team.entity';
import { validateEntryTime } from '../../shared/validators';
import { ReportType } from './constants/matches.constants';
import { ActionType, GradeFilePermissions } from '../users/constants/users.constants';
import { ReportFieldNames } from './constants/reports.constants';
import { MatchInfo } from './types/match-info.type';

const SMS_API = 'https://api2.smsplanet.pl';
export const DTO_DATETIME_FORMAT = 'YYYY-MM-DDTHH:mm';
const SMS_API_DATETIME_FORMAT = 'DD-MM-YYYY HH:mm:ss';

const MATCH_PROPS_COUNT = 7;
const DELIMITER = ';';

export const MATCH_DURATION = 2;
export const GRADE_ENTRY_TIME_WINDOW = 2 + MATCH_DURATION;
export const OVERALL_GRADE_ENTRY_TIME_WINDOW = 48 + MATCH_DURATION;

@Injectable()
export class MatchesService {
  constructor(@InjectRepository(Match) private matchRepository: Repository<Match>) {}

  async createMatch(
    leagueId: uuid,
    dto: CreateMatchDto,
    leagueIdx: number,
    homeTeamIdx: number,
    observerPhoneNumber: string,
  ): Promise<Match> {
    await this.validateMatch(dto);
    const matchKey: string = this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx);
    const observerSmsId: string = await this.scheduleSms(dto.matchDate, matchKey, observerPhoneNumber);

    const match: Match = this.matchRepository.create({
      matchDate: dto.matchDate,
      userReadableKey: this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx),
      stadium: dto.stadium,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      refereeId: dto.refereeId,
      observerId: dto.observerId,
      leagueId: leagueId,
      observerSmsId: observerSmsId,
    });
    return this.matchRepository.save(match);
  }

  getUserReadableKey(dtoDate: Date, leagueIdx: number, homeTeamIdx: number) {
    dtoDate = new Date(dtoDate);
    /*
     *  + 1 because JavaScript's Date is a copy of Java's java.util.Date
     */
    const day: string = String(dtoDate.getUTCDate()).slice(-2);
    const month: string = String(dtoDate.getUTCMonth() + 1).slice(-2);
    const year: string = String(dtoDate.getUTCFullYear()).slice(-2);
    return (
      day.padStart(2, '0') +
      month.padStart(2, '0') +
      year.padStart(2, '0') +
      String(leagueIdx + 1).padStart(2, '0') +
      String(homeTeamIdx + 1).padStart(2, '0')
    );
  }

  async getAllMatches(): Promise<Match[]> {
    return this.matchRepository.find();
  }

  async getByLeague(leagueId: uuid): Promise<Match[]> {
    return this.matchRepository.find({
      where: { leagueId: leagueId },
      order: { matchDate: 'DESC' },
    });
  }

  async getById(matchId: uuid): Promise<Match | undefined> {
    return this.matchRepository.findOne({ where: { id: matchId } });
  }

  async getByUserReadableKey(key: string): Promise<Match | undefined> {
    return this.matchRepository.findOne({ where: { userReadableKey: key } });
  }

  async updateMatch(
    params: LeagueMatchParams,
    dto: UpdateMatchDto,
    leagueIdx: number,
    homeTeamIdx: number,
    observerPhoneNumber: string,
  ): Promise<Match> {
    await this.validateMatch(dto, params.matchId);
    const match: Match = getNotNull(await this.getById(params.matchId));
    await this.cancelSMS(match.observerSmsId);
    const matchKey: string = this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx);
    const observerSmsId: string = await this.scheduleSms(dto.matchDate, matchKey, observerPhoneNumber);

    await this.matchRepository.update(params.matchId, {
      matchDate: dto.matchDate,
      userReadableKey: this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx),
      stadium: dto.stadium,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      refereeId: dto.refereeId,
      observerId: dto.observerId,
      observerSmsId: observerSmsId,
    });
    return this.getById(params.matchId);
  }

  async removeMatch(params: LeagueMatchParams, phoneNumber: string): Promise<Match> {
    const match: Match = getNotNull(await this.getById(params.matchId));
    await this.cancelSMS(match.observerSmsId);
    await this.sendOneWaySms(phoneNumber, `Match #${match.userReadableKey} has been canceled.`);
    await this.matchRepository.delete(params.matchId);
    return match;
  }

  async getUserLeagueMatches(params: LeagueUserParams): Promise<Match[]> {
    return this.matchRepository.find({
      where: [
        { refereeId: params.userId, leagueId: params.leagueId },
        { observerId: params.userId, leagueId: params.leagueId },
      ],
      order: { matchDate: 'DESC' },
    });
  }

  async updateGrade(params: LeagueMatchParams, dto: Partial<UpdateMatchDto>): Promise<Match> {
    const match: Match = getNotNull(await this.getById(params.matchId));
    if (match.refereeGrade) {
      validateEntryTime(match.matchDate, GRADE_ENTRY_TIME_WINDOW);
    }
    match.refereeGrade = dto.refereeGrade;
    match.refereeGradeDate = new Date();
    await this.matchRepository.save(match);
    return match;
  }

  async updateOverallGrade(params: LeagueMatchParams, dto: Partial<UpdateMatchDto>): Promise<Match> {
    const match: Match = getNotNull(await this.getById(params.matchId));
    if (match.overallGrade) {
      validateEntryTime(match.matchDate, OVERALL_GRADE_ENTRY_TIME_WINDOW);
    }
    match.overallGrade = dto.overallGrade;
    match.overallGradeDate = new Date();
    await this.matchRepository.save(match);
    return match;
  }

  async updateRefereeNote(params: LeagueMatchParams, dto: Partial<UpdateMatchDto>): Promise<Match> {
    const match: Match = getNotNull(await this.getById(params.matchId));
    match.refereeNote = dto.refereeNote;
    await this.matchRepository.save(match);
    return match;
  }

  async updateGradeSms(gradeMessage: GradeMessage, observer: User): Promise<void> {
    if (!(await this.requireSmsValid(gradeMessage.msg, observer.phoneNumber))) {
      return;
    }

    const matchKey: string = gradeMessage.msg.split('#')[0];
    const match: Match | undefined = await this.getByUserReadableKey(matchKey);

    if (!(await this.requireSmsMatchKeyValid(match, observer.phoneNumber))) {
      return;
    }

    if (!(await this.requireSmsGradeValid(gradeMessage.msg, observer.phoneNumber))) {
      return;
    }

    match.refereeGrade = +gradeMessage.msg.split('#')[1].split('/')[0];
    match.refereeGradeDate = new Date();
    await this.matchRepository.save(match);
    await this.sendOneWaySms(observer.phoneNumber, `Grade for match ${match.userReadableKey} has been entered.`);
  }

  async requireSmsValid(smsText: string, phoneNumber: string): Promise<boolean> {
    let smsElems: string[];

    try {
      smsElems = smsText.split('#');
    } catch (_e) {
      await this.sendOneWaySms(phoneNumber, 'Invalid sms format.');
      return false;
    }

    if (smsElems.length !== 2) {
      await this.sendOneWaySms(phoneNumber, 'Invalid sms format.');
      return false;
    }

    const matchKey: string = smsElems[0];

    if (!matchKey) {
      await this.sendOneWaySms(phoneNumber, `Invalid match key.`);
      return false;
    }

    let gradeElems: string[];
    try {
      gradeElems = smsElems[1].split('/');
    } catch (_e) {
      await this.sendOneWaySms(phoneNumber, 'Invalid sms grade format.');
      return false;
    }

    if (gradeElems.length !== 2) {
      await this.sendOneWaySms(phoneNumber, 'Invalid sms grade format.');
      return false;
    }

    const grade: number = +gradeElems[0];
    if (isNaN(grade)) {
      await this.sendOneWaySms(phoneNumber, `Invalid grade.`);
      return false;
    }
    return true;
  }

  async requireSmsMatchKeyValid(match: Match | undefined, phoneNumber: string): Promise<boolean> {
    if (!match) {
      await this.sendOneWaySms(phoneNumber, `Invalid match key.`);
      return false;
    }

    if (match.refereeGrade) {
      await this.sendOneWaySms(phoneNumber, `Grade has already been entered.`);
      return false;
    }

    if (dayjs().isBefore(dayjs(match.matchDate).add(MATCH_DURATION, 'hour'))) {
      await this.sendOneWaySms(phoneNumber, `Cannot enter a grade before match end.`);
      return false;
    }
    return true;
  }

  async requireSmsGradeValid(smsText: string, phoneNumber: string): Promise<boolean> {
    let grade: number;
    try {
      grade = +smsText.split('#')[1].split('/')[0];
    } catch (_e) {
      await this.sendOneWaySms(phoneNumber, `Invalid sms grade format.`);
      return false;
    }

    if (isNaN(grade)) {
      await this.sendOneWaySms(phoneNumber, `Invalid grade.`);
      return false;
    }
    return true;
  }

  async validateMatch(dto: CreateMatchDto, existingId?: uuid) {
    const matchDate: Dayjs = dayjs(dto.matchDate);

    const existingMatch: Match | undefined = await this.matchRepository.findOne({
      where: [
        {
          matchDate: Between(matchDate.startOf('day').toDate(), matchDate.endOf('day').toDate()),
          homeTeamId: In([dto.homeTeamId, dto.awayTeamId]),
        },
        {
          matchDate: Between(matchDate.startOf('day').toDate(), matchDate.endOf('day').toDate()),
          awayTeamId: In([dto.homeTeamId, dto.awayTeamId]),
        },
      ],
    });

    if (dto.homeTeamId === dto.awayTeamId) {
      throw new HttpException(`Home team same as away team`, HttpStatus.BAD_REQUEST);
    }

    if (existingMatch && existingMatch.id !== existingId) {
      throw new HttpException(`One of the teams already has a match at that day`, HttpStatus.BAD_REQUEST);
    }
  }

  async scheduleSms(dtoDate: Date, messageKey: string, phoneNumber: string): Promise<string> {
    const matchDate: string = dayjs(dtoDate, DTO_DATETIME_FORMAT).format(SMS_API_DATETIME_FORMAT);
    const sendDate: string = dayjs(dtoDate, DTO_DATETIME_FORMAT).subtract(1, 'day').format(SMS_API_DATETIME_FORMAT);

    const response: AxiosResponse = await axios.post(
      `${SMS_API}/sms`,
      {},
      {
        params: {
          key: process.env.SMS_API_KEY,
          password: process.env.SMS_PASSWORD,
          from: process.env.SMS_NUMBER,
          to: phoneNumber,
          msg: `Nowa obsada, mecz ${messageKey}, ${matchDate}. Po zakończeniu spotkania wyślij sms o treści: ID_meczu#ocena/ocena`,
          date: sendDate,
        },
      },
    );
    Logger.log('Response: ' + response.status, 'Schedule SMS');
    if (response.status != HttpStatus.OK) {
      throw new ServiceUnavailableException('SMS API error: ', response.data);
    }

    return response.data.messageId.toString();
  }

  async cancelSMS(smsId: string): Promise<void> {
    const smsIdInt: number = +smsId;

    const response = await axios.post(
      `${SMS_API}/cancelMessage`,
      {},
      {
        params: {
          key: process.env.SMS_API_KEY,
          password: process.env.SMS_PASSWORD,
          messageId: smsIdInt,
        },
      },
    );
    Logger.log('Response: ' + response.status, 'Cancel SMS');
    if (response.status != HttpStatus.OK) {
      throw new ServiceUnavailableException('SMS API error: ', response.data);
    }
  }

  async sendOneWaySms(recipient: string, message: string): Promise<void> {
    const response: AxiosResponse = await axios.post(
      `${SMS_API}/sms`,
      {},
      {
        params: {
          key: process.env.SMS_API_KEY,
          password: process.env.SMS_PASSWORD,
          from: process.env.SMS_SENDER,
          to: recipient,
          msg: message,
        },
      },
    );
    Logger.log('Send to: ' + recipient + ' Msg: ' + message + ' Response: ' + response.status, 'Send one-way SMS');
    if (response.status != HttpStatus.OK) {
      throw new ServiceUnavailableException('SMS API error: ', response.data);
    }
  }

  async validateMatches(
    csv: string,
    leagueId: uuid,
    teams: Team[],
    referees: User[],
    observers: User[],
  ): Promise<void> {
    const { teamsDict, refereesDict, observersDict } = this.getMaps(teams, referees, observers);

    const matchesEntries: string[] = csv.split(/\r?\n|\r/);
    matchesEntries.forEach((matchEntry, lineIndex) => {
      const matchProps: string[] = matchEntry.split(DELIMITER);
      if (matchProps.length != MATCH_PROPS_COUNT) {
        throw new HttpException(`Invalid number of match props in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      const [homeTeamName, awayTeamName, date, time, stadium, refereeName, observerName] = matchProps;

      if (!teamsDict[homeTeamName]) {
        throw new HttpException(`Home team not found in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      if (!teamsDict[awayTeamName]) {
        throw new HttpException(`Away team not found in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      if (!refereesDict[refereeName]) {
        throw new HttpException(`Referee not found in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      if (!observersDict[observerName]) {
        throw new HttpException(`Observer not found in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      let dateTime: Dayjs;
      try {
        dateTime = dayjs(`${date}T${time}`, DTO_DATETIME_FORMAT);
      } catch (_e) {
        throw new HttpException(`Invalid date/time in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      if (dateTime.isBefore(dayjs())) {
        throw new HttpException(`Match date/time is from the past in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }

      if (!stadium) {
        throw new HttpException(`Stadium not found in line ${lineIndex}.`, HttpStatus.BAD_REQUEST);
      }
    });
  }

  async getFileMatchesDtos(
    csv: string,
    leagueId: uuid,
    teams: Team[],
    referees: User[],
    observers: User[],
  ): Promise<CreateMatchDto[]> {
    const { teamsDict, refereesDict, observersDict } = this.getMaps(teams, referees, observers);

    const matchesEntries: string[] = csv.split(/\r?\n|\r/);
    const dtos: CreateMatchDto[] = [];

    matchesEntries.forEach((matchEntry: string) => {
      const matchProps: string[] = matchEntry.split(DELIMITER);
      const [homeTeamName, awayTeamName, date, time, matchStadium, refereeName, observerName] = matchProps;
      dtos.push({
        matchDate: dayjs(`${date}T${time}`, DTO_DATETIME_FORMAT).toDate(),
        stadium: matchStadium,
        homeTeamId: teamsDict[homeTeamName].id,
        awayTeamId: teamsDict[awayTeamName].id,
        refereeId: refereesDict[refereeName].id,
        observerId: observersDict[observerName].id,
      } as CreateMatchDto);
    });
    return dtos;
  }

  getMaps(teams: Team[], referees: User[], observers: User[]) {
    const teamsDict: { [key: string]: Team } = {};
    const refereesDict: { [key: string]: User } = {};
    const observersDict: { [key: string]: User } = {};

    teams.forEach((team: Team) => (teamsDict[team.name] = team));
    referees.forEach((referee: User) => (refereesDict[referee.lastName] = referee));
    observers.forEach((observer: User) => (observersDict[observer.lastName] = observer));

    return { teamsDict, refereesDict, observersDict };
  }

  async validateUserLeagueRemoval(params: LeagueUserParams) {
    const foundMatches: Match[] = await this.matchRepository.find({
      where: [
        {
          leagueId: params.leagueId,
          refereeId: params.userId,
        },
        {
          leagueId: params.leagueId,
          observerId: params.userId,
        },
      ],
    });

    if (foundMatches.length) {
      throw new HttpException(`This user is assigned to some matches from this league.`, HttpStatus.BAD_REQUEST);
    }
  }

  public async updateReportData(matchId: uuid, reportType: ReportType, key: string): Promise<Match> {
    const match = getNotNull(await this.getById(matchId));

    const reportFieldName = ReportFieldNames[reportType];
    match[reportFieldName] = key;

    return this.matchRepository.save(match);
  }

  public async getKeyForReport(matchId: uuid, reportType: ReportType): Promise<string> {
    const match = getNotNull(await this.getById(matchId));

    const reportFieldName = ReportFieldNames[reportType];
    return match[reportFieldName];
  }

  public async removeReport(matchId: uuid, reportType: ReportType): Promise<Match> {
    const match = getNotNull(await this.getById(matchId));

    const reportFieldName = ReportFieldNames[reportType];
    match[reportFieldName] = null;

    return this.matchRepository.save(match);
  }

  public validateUserAction(user: User, reportType: ReportType, actionType: ActionType) {
    if (!GradeFilePermissions[user.role][actionType].has(reportType)) {
      throw new HttpException(`User does not have sufficient permissions.`, HttpStatus.FORBIDDEN);
    }
  }

  public getMatchInfo(
    match: Match,
    referees: { [key: uuid]: User },
    observers: { [key: uuid]: User },
    hideObserver = false,
  ): MatchInfo {
    const referee = referees[match.refereeId];
    const observer = observers[match.observerId];

    const refereeFullName = `${referee.firstName} ${referee.lastName}`;
    const observerFullName = `${observer.firstName} ${observer.lastName}`;

    const matchIsUpcoming = dayjs(match.matchDate).isAfter(dayjs());

    return {
      id: match.id,
      userReadableKey: match.userReadableKey,
      matchDate: match.matchDate,
      stadium: match.stadium,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      referee: refereeFullName,
      observer: hideObserver && matchIsUpcoming ? 'hidden' : observerFullName,
      leagueId: match.leagueId,
      refereeGrade: match.refereeGrade,
      refereeGradeDate: match.refereeGradeDate,
      refereeNote: match.refereeNote,
      overallGrade: match.overallGrade,
      overallGradeDate: match.overallGradeDate,
      observerReportKey: match.observerReportKey,
      mentorReportKey: match.mentorReportKey,
      tvReportKey: match.tvReportKey,
    };
  }

  public validateMatchNotUpcoming(match: Match) {
    if (dayjs(match.matchDate).isAfter(dayjs())) {
      throw new HttpException(`Match is upcoming.`, HttpStatus.BAD_REQUEST);
    }
  }
}