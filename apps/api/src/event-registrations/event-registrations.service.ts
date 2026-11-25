import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../events/event.entity';
import { calculateTicketLineTotal, findEventTicketOption } from '../events/event-ticket-options';
import { EventRegistration } from './event-registration.entity';

export class RegistrationChildDetailsDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsInt()
  @Min(0)
  @Max(17)
  age: number;
}

export class RegistrationTicketSelectionDto {
  @IsString()
  @Length(1, 80)
  ticketType: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RegistrationChildDetailsDto)
  childDetails?: RegistrationChildDetailsDto[];
}

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
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RegistrationTicketSelectionDto)
  ticketSelections?: RegistrationTicketSelectionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  childName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(17)
  childAge?: number;

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
  @MaxLength(255)
  ticketType?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  childName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(17)
  childAge?: number;

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
    if (payload.childName !== undefined) registration.childName = payload.childName.trim() || null;
    if (payload.childAge !== undefined) registration.childAge = payload.childAge;
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

      const requestedSelections = payload.ticketSelections !== undefined
        ? payload.ticketSelections
        : [{
            ticketType: payload.ticketType?.trim() || 'General Admission',
            quantity: 1,
            childDetails: payload.childName && payload.childAge !== undefined
              ? [{ name: payload.childName.trim(), age: payload.childAge }]
              : [],
          }];
      if (!payload.ticketSelections && ((payload.childName && payload.childAge === undefined) || (!payload.childName && payload.childAge !== undefined))) {
        throw new BadRequestException('Provide both child name and age.');
      }
      const ticketSelections = requestedSelections.map((selection) => {
        const ticketOption = findEventTicketOption(event, selection.ticketType);
        if (!ticketOption || ticketOption.priceKsh === null) {
          throw new BadRequestException(`Ticket type "${selection.ticketType}" is not available for this event.`);
        }
        const childDetails = (selection.childDetails ?? []).map((child) => ({
          name: child.name.trim(),
          age: child.age,
        }));
        if (childDetails.some((child) => !child.name)) {
          throw new BadRequestException('Child names cannot be empty.');
        }
        if (ticketOption.requiresChildDetails && childDetails.length !== selection.quantity) {
          throw new BadRequestException(
            `Enter child name and age for each ${ticketOption.name} ticket (${selection.quantity} required).`,
          );
        }
        if (!ticketOption.requiresChildDetails && childDetails.length > 0) {
          throw new BadRequestException(`${ticketOption.name} tickets do not collect child details.`);
        }
        return {
          ticketType: ticketOption.name,
          quantity: selection.quantity,
          unitPriceKsh: ticketOption.priceKsh,
          lineTotalKsh: calculateTicketLineTotal(ticketOption, selection.quantity),
          pricingMode: ticketOption.pricingMode,
          childDetails,
        };
      });
      if (ticketSelections.length === 0) {
        throw new BadRequestException('Select at least one ticket type.');
      }
      const amountKsh = ticketSelections.reduce((total, selection) => total + selection.lineTotalKsh, 0);
      if (!Number.isInteger(amountKsh) || amountKsh < 1 || amountKsh > 250000) {
        throw new BadRequestException('The total ticket price must be a whole KES amount between 1 and 250,000.');
      }
      const child = ticketSelections.flatMap((selection) => selection.childDetails)[0];
      const ticketType = ticketSelections
        .map((selection) => selection.quantity > 1
          ? `${selection.ticketType} × ${selection.quantity}`
          : selection.ticketType)
        .join(', ')
        .slice(0, 255);

      const registration = this.registrationsRepository.create({
        fullName,
        email,
        phone,
        company: payload.company?.trim(),
        role: payload.role?.trim(),
        ticketType,
        ticketSelections,
        amountKsh,
        childName: child?.name ?? null,
        childAge: child?.age ?? null,
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
      ticketSelections: registration.ticketSelections,
      amountKsh: registration.amountKsh,
      childName: registration.childName,
      childAge: registration.childAge,
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
            ticketOptions: registration.event.ticketOptions,
          }
        : null,
    };
  }
}
