import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from './user.entity';
import { hashPassword } from '../auth/password.util';
import { DEFAULT_ROLE_PERMISSIONS } from '../authorization/authorization.constants';

interface UserOperatorContext {
  role: string;
  organizationId: string | null;
}

const ROLE_LEVEL: Record<string, number> = {
  'super-administrator': 100,
  'organization-admin': 80,
  'it-director': 70,
  'it-support-manager': 60,
  'department-head': 50,
  'it-support-agent': 30,
  auditor: 20,
  'standard-employee': 10,
  'read-only-user': 5,
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async findAll(operator: UserOperatorContext): Promise<User[]> {
    if (operator.role === 'super-administrator') {
      return this.usersRepository.find({ relations: ['organization'], order: { createdAt: 'DESC' } });
    }
    if (!operator.organizationId) {
      throw new ForbiddenException('Operator is not assigned to an organization.');
    }
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.organization', 'organization')
      .where('organization.id = :organizationId', { organizationId: operator.organizationId })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.organization', 'organization')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async setPasswordHash(email: string, passwordHash: string): Promise<void> {
    const result = await this.usersRepository.update({ email }, { passwordHash });
    if (!result.affected) {
      throw new NotFoundException(`User ${email} was not found.`);
    }
  }

  async findOne(id: string, operator: UserOperatorContext): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['organization'],
    });

    if (!user) {
      throw new NotFoundException(`User ${id} was not found.`);
    }
    if (operator.role !== 'super-administrator' && user.organization?.id !== operator.organizationId) {
      throw new ForbiddenException('The requested user is outside your organization.');
    }

    return user;
  }

  async create(payload: {
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    accountType?: string;
    organization?: { id: string };
    password: string;
    phone?: string;
  }, operator: UserOperatorContext): Promise<User> {
    if (typeof payload.password !== 'string' || payload.password.length < 12) {
      throw new BadRequestException('A user password of at least 12 characters is required.');
    }
    const role = payload.role ?? 'standard-employee';
    const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS];
    if (!rolePermissions) {
      throw new BadRequestException('The selected user role is not recognized.');
    }
    if (operator.role !== 'super-administrator' && ROLE_LEVEL[role] >= ROLE_LEVEL[operator.role]) {
      throw new ForbiddenException('You cannot create a user with an equal or higher privilege level.');
    }
    if (operator.role !== 'super-administrator' && !operator.organizationId) {
      throw new ForbiddenException('Operator is not assigned to an organization.');
    }
    if (operator.organizationId && payload.organization?.id && payload.organization.id !== operator.organizationId) {
      throw new ForbiddenException('You can only create users in your own organization.');
    }
    const organizationId = operator.role === 'super-administrator'
      ? payload.organization?.id
      : operator.organizationId;
    const organization = organizationId
      ? await this.organizationsRepository.findOneBy({ id: organizationId })
      : null;
    if (organizationId && !organization) {
      throw new BadRequestException('The selected organization does not exist.');
    }

    const user = this.usersRepository.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      role,
      accountType: payload.accountType ?? 'employee',
      passwordHash: hashPassword(payload.password),
      phone: payload.phone,
      status: 'active',
      emailVerified: true,
      active: true,
      organization: organization ?? undefined,
    });

    const savedUser = await this.usersRepository.save(user);
    savedUser.passwordHash = undefined;
    return savedUser;
  }
}
