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

  @Column({ name: 'child_name', type: 'varchar', length: 120, nullable: true })
  childName: string | null;

  @Column({ name: 'child_age', type: 'integer', nullable: true })
  childAge: number | null;

  @Column({ name: 'ticket_selections', type: 'simple-json', nullable: true })
  ticketSelections: {
    ticketType: string;
    quantity: number;
    unitPriceKsh: number;
    lineTotalKsh: number;
    pricingMode: 'per_person' | 'family_bundle';
    childDetails: { name: string; age: number }[];
  }[] | null;

  @Column({ name: 'amount_ksh', type: 'integer', nullable: true })
  amountKsh: number | null;

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

  @ManyToOne(() => EventEntity, (event) => event.registrations, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  @CreateDateColumn()
  createdAt: Date;
}
