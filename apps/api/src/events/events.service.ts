import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './event.entity';
import { normalizeEventPosterUrl } from './event-poster-url';
import { DEFAULT_EVENT_TICKET_OPTIONS, EventTicketOption } from './event-ticket-options';

export class EventTicketOptionDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(250000)
  priceKsh?: number | null;

  @IsBoolean()
  requiresChildDetails: boolean;

  @IsOptional()
  @IsIn(['per_person', 'family_bundle'])
  pricingMode?: 'per_person' | 'family_bundle';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  peoplePerTicket?: number;
}

export class CreateEventDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(255)
  slug: string;

  @IsString()
  @Length(3, 255)
  title: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  date?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsInt()
  @Min(1)
  @Max(250000)
  priceKsh: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EventTicketOptionDto)
  ticketOptions?: EventTicketOptionDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2048)
  posterUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  highlights?: string[];
}

export class UpdateEventDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(255)
  slug?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(3, 255)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  date?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  location?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(250000)
  priceKsh?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EventTicketOptionDto)
  ticketOptions?: EventTicketOptionDto[];

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2048)
  posterUrl?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  highlights?: string[];
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
  ) {}

  async findAll() {
    return this.eventsRepository.find({
      where: { isArchived: false },
      order: { date: 'ASC' },
    });
  }

  findAllForAdmin() {
    return this.eventsRepository.find({ order: { date: 'ASC' } });
  }

  async findBySlug(slug: string) {
    return this.eventsRepository.findOne({ where: { slug, isArchived: false } });
  }

  async findById(id: string) {
    return this.eventsRepository.findOne({ where: { id } });
  }

  async create(payload: CreateEventDto) {
    const slug = payload.slug.trim().toLowerCase();
    const title = payload.title.trim();
    if (title.length < 3) throw new BadRequestException('Event title must contain at least 3 characters.');
    await this.ensureUniqueSlug(slug);
    const ticketOptions = this.cleanTicketOptions(payload.ticketOptions, payload.priceKsh);
    const event = this.eventsRepository.create({
      slug,
      title,
      date: payload.date?.trim() || null,
      location: payload.location?.trim() || null,
      priceKsh: getLegacyPrice(ticketOptions, payload.priceKsh),
      ticketOptions,
      description: payload.description?.trim() || null,
      posterUrl: normalizeEventPosterUrl(payload.posterUrl),
      highlights: cleanHighlights(payload.highlights),
      isArchived: false,
    });
    return this.saveWithUniqueSlugHandling(event);
  }

  async update(id: string, payload: UpdateEventDto) {
    const event = await this.eventsRepository.findOneBy({ id });
    if (!event) throw new NotFoundException(`Event ${id} was not found.`);

    if (payload.slug !== undefined) {
      const slug = payload.slug.trim().toLowerCase();
      await this.ensureUniqueSlug(slug, id);
      event.slug = slug;
    }
    if (payload.title !== undefined) {
      const title = payload.title.trim();
      if (title.length < 3) throw new BadRequestException('Event title must contain at least 3 characters.');
      event.title = title;
    }
    if (payload.date !== undefined) event.date = payload.date.trim() || null;
    if (payload.location !== undefined) event.location = payload.location.trim() || null;
    if (payload.priceKsh !== undefined) event.priceKsh = payload.priceKsh;
    if (payload.ticketOptions !== undefined) {
      event.ticketOptions = this.cleanTicketOptions(payload.ticketOptions, event.priceKsh);
      event.priceKsh = getLegacyPrice(event.ticketOptions, event.priceKsh);
    } else if (payload.priceKsh !== undefined) {
      const options = event.ticketOptions ?? [];
      const generalAdmission = options.find((option) => normalizeName(option.name) === 'general admission');
      if (generalAdmission) {
        generalAdmission.priceKsh = payload.priceKsh;
        event.ticketOptions = options;
      } else {
        event.ticketOptions = [{
          name: 'General Admission',
          priceKsh: payload.priceKsh,
          requiresChildDetails: false,
          pricingMode: 'per_person',
          peoplePerTicket: 1,
        }];
      }
    }
    if (payload.description !== undefined) event.description = payload.description.trim() || null;
    if (payload.posterUrl !== undefined) event.posterUrl = normalizeEventPosterUrl(payload.posterUrl);
    if (payload.highlights !== undefined) event.highlights = cleanHighlights(payload.highlights);

    return this.saveWithUniqueSlugHandling(event);
  }

  async archive(id: string) {
    const event = await this.eventsRepository.findOneBy({ id });
    if (!event) throw new NotFoundException(`Event ${id} was not found.`);
    event.isArchived = true;
    return this.eventsRepository.save(event);
  }

  async restore(id: string) {
    const event = await this.eventsRepository.findOneBy({ id });
    if (!event) throw new NotFoundException(`Event ${id} was not found.`);
    event.isArchived = false;
    return this.eventsRepository.save(event);
  }

  async delete(id: string) {
    const event = await this.eventsRepository.findOneBy({ id });
    if (!event) throw new NotFoundException(`Event ${id} was not found.`);

    const registrationCount = await this.eventsRepository
      .createQueryBuilder('event')
      .leftJoin('event.registrations', 'registration')
      .where('event.id = :id', { id })
      .select('COUNT(registration.id)', 'count')
      .getRawOne<{ count: string }>();

    if (Number(registrationCount?.count ?? 0) > 0) {
      throw new ConflictException('This event has registrations and cannot be deleted. Archive it to preserve participant and payment history.');
    }

    try {
      const result = await this.eventsRepository.delete({ id });
      if (!result.affected) throw new NotFoundException(`Event ${id} was not found.`);
      return { id, deleted: true };
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('This event has registrations and cannot be deleted. Archive it to preserve participant and payment history.');
      }
      throw error;
    }
  }

  private async ensureUniqueSlug(slug: string, exceptId?: string) {
    const existing = await this.eventsRepository.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('An event with this URL slug already exists.');
    }
  }

  private cleanTicketOptions(options: EventTicketOptionDto[] | undefined, fallbackPrice: number): EventTicketOption[] {
    const ticketOptions = (options === undefined
      ? DEFAULT_EVENT_TICKET_OPTIONS.map((option) => ({
          ...option,
          priceKsh: option.name === 'General Admission' ? fallbackPrice : null,
        }))
      : options
    ).map((option) => ({
      name: option.name.trim(),
      priceKsh: option.priceKsh ?? null,
      requiresChildDetails: option.requiresChildDetails,
      pricingMode: option.pricingMode ?? 'per_person',
      peoplePerTicket: option.peoplePerTicket ?? 1,
    }));

    if (ticketOptions.some((option) => !option.name)) {
      throw new BadRequestException('Ticket type names cannot be empty.');
    }
    if (ticketOptions.some((option) => normalizeName(option.name) === 'parent + child')) {
      throw new BadRequestException('Parent + Child tickets are no longer available. Set separate Parent and Child ticket types instead.');
    }
    if (ticketOptions.length === 0) {
      throw new BadRequestException('An event must have at least one ticket type.');
    }
    if (new Set(ticketOptions.map((option) => normalizeName(option.name))).size !== ticketOptions.length) {
      throw new BadRequestException('Ticket type names must be unique.');
    }
    if (!ticketOptions.some((option) => option.priceKsh !== null)) {
      throw new BadRequestException('Set a price for at least one ticket type.');
    }

    return ticketOptions;
  }

  private async saveWithUniqueSlugHandling(event: EventEntity) {
    try {
      return await this.eventsRepository.save(event);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new ConflictException('An event with this URL slug already exists.');
      }
      throw error;
    }
  }
}

function cleanHighlights(highlights?: string[]): string[] {
  return (highlights ?? []).map((highlight) => highlight.trim()).filter(Boolean);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function getLegacyPrice(ticketOptions: EventTicketOption[], fallbackPrice: number): number {
  const generalAdmission = ticketOptions.find((option) => normalizeName(option.name) === 'general admission');
  return generalAdmission?.priceKsh ?? ticketOptions.find((option) => option.priceKsh !== null)?.priceKsh ?? fallbackPrice;
}

function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { code?: string; driverError?: { code?: string } };
  return record.code === '23503' || record.driverError?.code === '23503';
}
