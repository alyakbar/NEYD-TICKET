import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../events/event.entity';
import { EventRegistration } from './event-registration.entity';

export class CreateEventRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventSlug?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventTitle?: string;

  @IsString()
  @Length(2, 120)
  fullName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(7, 25)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ticketType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expectations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dietaryRequirements?: string;

  @IsBoolean()
  agree: boolean;
}

export class UpdateEventRegistrationDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(7, 25)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  company?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  role?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 80)
  ticketType?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(4000)
  expectations?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  dietaryRequirements?: string;
}

@Injectable()
export class EventRegistrationsService {
  constructor(
    @InjectRepository(EventRegistration)
    private readonly registrationsRepository: Repository<EventRegistration>,
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
  ) {}

  async findAll() {
    const registrations = await this.registrationsRepository.find({
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });
    return registrations.map((registration) => this.adminView(registration));
  }

  count() {
    return this.registrationsRepository.count();
  }

  async update(id: string, payload: UpdateEventRegistrationDto) {
    const registration = await this.registrationsRepository.findOne({
      where: { id },
      relations: ['event'],
    });
    if (!registration) {
      throw new NotFoundException(`Event registration ${id} was not found.`);
    }

    if (payload.fullName !== undefined) registration.fullName = payload.fullName.trim();
    if (payload.email !== undefined) registration.email = payload.email.trim().toLowerCase();
    if (payload.phone !== undefined) registration.phone = payload.phone.trim();
    if (payload.company !== undefined) registration.company = payload.company.trim();
    if (payload.role !== undefined) registration.role = payload.role.trim();
    if (payload.ticketType !== undefined) registration.ticketType = payload.ticketType.trim();
    if (payload.expectations !== undefined) registration.expectations = payload.expectations.trim();
    if (payload.dietaryRequirements !== undefined) registration.dietaryRequirements = payload.dietaryRequirements.trim();

    const updated = await this.registrationsRepository.save(registration);
    return this.adminView(updated);
  }

  async create(payload: CreateEventRegistrationDto) {
    const fullName = payload.fullName?.trim();
    const email = payload.email?.trim().toLowerCase();
    const phone = payload.phone?.trim();

    if (!fullName || !email || !phone) {
      throw new BadRequestException('Full name, email and phone are required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required.');
    }
    if (!payload.eventSlug && !payload.eventId) {
      throw new BadRequestException('An event must be selected for registration.');
    }
    if (payload.agree !== true) {
      throw new BadRequestException('You must accept the event update confirmation to complete registration.');
    }

    try {
      const event = payload.eventId
        ? await this.eventsRepository.findOne({ where: { id: payload.eventId } })
        : await this.eventsRepository.findOne({ where: { slug: payload.eventSlug } });

      if (!event) {
        throw new BadRequestException('The selected event does not exist.');
      }
      if (event.isArchived) {
        throw new BadRequestException('This event is archived and is no longer accepting registrations.');
      }

      const registration = this.registrationsRepository.create({
        fullName,
        email,
        phone,
        company: payload.company?.trim(),
        role: payload.role?.trim(),
        ticketType: payload.ticketType ?? 'General Admission',
        expectations: payload.expectations?.trim(),
        dietaryRequirements: payload.dietaryRequirements?.trim(),
        agree: true,
        event,
      });

      return await this.registrationsRepository.save(registration);
    } catch (error: any) {
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        throw new BadRequestException('The event system needs its database tables created first. Run the database migration.');
      }
      throw error;
    }
  }

  private adminView(registration: EventRegistration) {
    return {
      id: registration.id,
      fullName: registration.fullName,
      email: registration.email,
      phone: registration.phone,
      company: registration.company,
      role: registration.role,
      ticketType: registration.ticketType,
      expectations: registration.expectations,
      dietaryRequirements: registration.dietaryRequirements,
      paymentStatus: registration.paymentStatus,
      ticketCode: registration.ticketCode,
      ticketEmailStatus: registration.ticketEmailStatus,
      createdAt: registration.createdAt,
      event: registration.event
        ? {
            id: registration.event.id,
            slug: registration.event.slug,
            title: registration.event.title,
            date: registration.event.date,
            location: registration.event.location,
          }
        : null,
    };
  }
}
