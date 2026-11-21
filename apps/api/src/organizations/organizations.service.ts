import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';

interface OrganizationOperatorContext {
  role: string;
  organizationId: string | null;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async findAll(operator: OrganizationOperatorContext): Promise<Organization[]> {
    if (operator.role === 'super-administrator') {
      return this.organizationsRepository.find({ relations: ['departments'] });
    }
    if (!operator.organizationId) {
      throw new ForbiddenException('Operator is not assigned to an organization.');
    }
    return this.organizationsRepository.find({
      where: { id: operator.organizationId },
      relations: ['departments'],
    });
  }

  async findPublic() {
    const organizations = await this.organizationsRepository.find({
      select: { id: true, name: true, slug: true },
      where: { active: true },
      order: { name: 'ASC' },
    });
    return organizations.map(({ id, name, slug }) => ({ id, name, slug }));
  }

  async create(payload: { name: string; slug: string; code?: string; timezone?: string; countryCode?: string }): Promise<Organization> {
    const organization = this.organizationsRepository.create({
      code: payload.code ?? payload.slug.toUpperCase(),
      name: payload.name,
      slug: payload.slug,
      timezone: payload.timezone ?? 'Africa/Nairobi',
      countryCode: payload.countryCode ?? 'KE',
      defaultLocale: 'en-KE',
      active: true,
      mfaRequired: true,
    });

    return this.organizationsRepository.save(organization);
  }
}
