import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EventEntity } from '../events/event.entity';

@Entity('event_registrations')
export class EventRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  company: string;

  @Column({ nullable: true })
  role: string;

  @Column({ default: 'General Admission' })
  ticketType: string;

  @Column({ type: 'text', nullable: true })
  expectations: string;

  @Column({ type: 'text', nullable: true })
  dietaryRequirements: string;

  @Column({ default: false })
  agree: boolean;

  @Column({ length: 16, default: 'unpaid' })
  paymentStatus: string;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  ticketCode?: string;

  @Column({ length: 16, default: 'not_sent' })
  ticketEmailStatus: string;

  @Column({ type: 'timestamptz', nullable: true })
  ticketEmailAttemptedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ticketEmailSentAt?: Date;

  @Column({ type: 'text', nullable: true })
  ticketEmailError?: string | null;

  @ManyToOne(() => EventEntity, (event) => event.registrations, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  @CreateDateColumn()
  createdAt: Date;
}
