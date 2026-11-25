import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EventRegistration } from '../event-registrations/event-registration.entity';
import type { EventTicketOption } from './event-ticket-options';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  date: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ default: 0 })
  priceKsh: number;

  @Column({ type: 'simple-json', nullable: true })
  ticketOptions: EventTicketOption[] | null;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ name: 'poster_url', type: 'text', nullable: true })
  posterUrl: string | null;

  @Column({ type: 'simple-json', nullable: true })
  highlights: string[] | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => EventRegistration, (registration) => registration.event)
  registrations: EventRegistration[];
}
