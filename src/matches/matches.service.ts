import { Injectable} from '@nestjs/common';
import axios, { AxiosError } from "axios";
import dayjs from "dayjs";
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from '../entities/match.entity';
import { UserParams } from '../users/params/UserParams';
import { uuid } from '../shared/types/uuid';
import { LeagueMatchParams } from './params/LeagueMatchParams';
import { LeagueUserParams } from '../leagues/params/LeagueUserParams';

@Injectable()
export class MatchesService {
  constructor(@InjectRepository(Match) private matchRepository: Repository<Match>) {}

  async createMatch(leagueId: uuid, dto: CreateMatchDto, leagueIdx: number, homeTeamIdx: number, phoneNumber: string): Promise<Match> {
    const match: Match = this.matchRepository.create({
      matchDate: dto.matchDate,
      userReadableKey: this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx),
      stadium: dto.stadium,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      refereeId: dto.refereeId,
      observerId: dto.observerId,
      leagueId: leagueId,
      observerSmsId: await this.sendSMS(dto.matchDate, this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx), phoneNumber),
    });

    return this.matchRepository.save(match);
  }

  getUserReadableKey(dtoDate: Date, leagueIdx: number, homeTeamIdx: number) {
    dtoDate = new Date(dtoDate);
    /*
     *  + 1 because JavaScript's Date is a copy of Java's java.util.Date
     */
    const day: String = String(dtoDate.getDay() + 1).slice(-2);
    const month: String = String(dtoDate.getMonth() + 1).slice(-2);
    const year: String = String(dtoDate.getFullYear()).slice(-2);

    return day.padStart(2, '0') +
      month.padStart(2, '0') +
      year.padStart(2, '0') +
      String(leagueIdx + 1).padStart(2, '0') +
      String(homeTeamIdx + 1).padStart(2, '0');
  }

  async getAllMatches(): Promise<Match[]> {
    return this.matchRepository.find();
  }

  async getByLeague(leagueId: uuid): Promise<Match[]> {
    return this.matchRepository.find({ where: { leagueId: leagueId } });
  }

  async getById(matchId: uuid): Promise<Match> {
    return this.matchRepository.findOne({ where: { id: matchId } });
  }

  async updateMatch(params: LeagueMatchParams, dto: UpdateMatchDto, leagueIdx: number, homeTeamIdx: number, phoneNumber: string): Promise<Match> {
    await this.cancelSMS(dto.observerSmsId)

    await this.matchRepository.update(params.matchId, {
      matchDate: dto.matchDate,
      userReadableKey: this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx),
      stadium: dto.stadium,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      refereeId: dto.refereeId,
      observerId: dto.observerId,
      observerSmsId: await this.sendSMS(dto.matchDate, this.getUserReadableKey(dto.matchDate, leagueIdx, homeTeamIdx), phoneNumber)
    });
    return this.getById(params.matchId);
  }

  async removeMatch(params: LeagueMatchParams): Promise<Match> {
    const match: Match = await this.getById(params.matchId);
    await this.matchRepository.delete(params.matchId);
    return match;
  }

  async getUserMatches(params: UserParams): Promise<Match[]> {
    return this.matchRepository.find({
      where: [
        { refereeId: params.userId },
        { observerId: params.userId }
      ]
    });
  }

  async getUserLeagueMatches(params: LeagueUserParams): Promise<Match[]> {
    return this.matchRepository.find({
      where: [
        { refereeId: params.userId, leagueId: params.leagueId },
        { observerId: params.userId, leagueId: params.leagueId }
      ]
    });
  }

  async updateGrade(params: LeagueMatchParams, dto: UpdateMatchDto): Promise<Match> {
    const match: Match = await this.getById(params.matchId);
    match.refereeGrade = dto.refereeGrade;
    match.refereeGradeDate = new Date();
    await this.matchRepository.save(match);
    return match;
  }

  async sendSMS(dtoDate: Date, messageKey: string, phoneNumber: string): Promise<string>{
    try{
      const response = await axios.post("https://api2.smsplanet.pl/sms", {
        key : process.env.SMS_API_KEY,
        password : process.env.SMS_PASSWORD,
        from : process.env.SMS_NUMBER,
        to : phoneNumber,
        msg : `Nowa obsada, mecz ${messageKey}, ${dayjs(dtoDate).format('DD-MM-YYYY HH:mm:ss')}. Po zakończeniu spotkania wyślij sms o treści: ID_meczu#ocena/ocena`,
        date : dayjs(dtoDate).subtract(1, 'day').format('DD-MM-YYYY HH:mm:ss')
      });

      return response.data.messageId.toSting();
    }
    
    catch (error) {
      if (axios.isAxiosError(error)) {
        console.log(error.response.status)
        console.log(error.response.data)
      }
      console.log("Cancel message error.")
    }
  }

  async cancelSMS(smsId : string){
    var smsIdInt: number = +smsId;
    try {
      axios.post("https://api2.smsplanet.pl/cancelMessage", {
      key : process.env.SMS_API_KEY,
      password : process.env.SMS_PASSWORD,
      messageId : smsIdInt,
      });
    }
    catch (error) {
      if (axios.isAxiosError(error)) {
        console.log(error.response.status)
        console.log(error.response.data)
      }
      console.log("Cancel message error.")
    }
  }
}
