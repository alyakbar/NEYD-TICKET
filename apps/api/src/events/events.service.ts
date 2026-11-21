import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './event.entity';
import { normalizeEventPosterUrl } from './event-poster-url';

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
    const event = this.eventsRepository.create({
      slug,
      title,
      date: payload.date?.trim() || null,
      location: payload.location?.trim() || null,
      priceKsh: payload.priceKsh,
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

  private async ensureUniqueSlug(slug: string, exceptId?: string) {
    const existing = await this.eventsRepository.findOneBy({ slug });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('An event with this URL slug already exists.');
    }
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
