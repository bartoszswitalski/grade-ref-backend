import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from '../types/role';
import { uuid } from '../types/uuid';
import { UserParams } from './params/UserParams';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private usersRepository: Repository<User>) {}

  async getAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async getAllByRole(role: Role): Promise<User[]> {
    return this.usersRepository.find({ where: { role: role } });
  }

  async getByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { email: email } });
  }

  async getById(id: uuid): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { id: id } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const newUser = this.usersRepository.create({
      email: dto.email,
      role: dto.role,
      phoneNumber: dto.phoneNumber,
      firstName: dto.firstName,
      lastName: dto.lastName
    });
    return this.usersRepository.save(newUser);
  }

  async update(params: UserParams, dto: UpdateUserDto) {
    await this.usersRepository.update(params.userId, {
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      firstName: dto.firstName,
      lastName: dto.lastName
    });
    return this.getById(params.userId);
  }

  async remove(params: UserParams) {
    const user: User = await this.getById(params.userId);
    await this.usersRepository.delete(params.userId);
    return user;
  }
}
