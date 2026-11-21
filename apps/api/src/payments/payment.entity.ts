import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { EventRegistration } from '../event-registrations/event-registration.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: Ticket;

  @ManyToOne(() => EventRegistration, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'event_registration_id' })
  eventRegistration?: EventRegistration;

  @Column({ length: 64 })
  catalogItem: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountKsh: string;

  @Column({ length: 16, default: 'KES' })
  currency: string;

  @Column({ length: 16, default: 'pending' })
  status: string;

  @Column({ length: 32 })
  phoneNumber: string;

  @Column({ length: 128, nullable: true })
  merchantRequestId?: string;

  @Column({ length: 128, nullable: true, unique: true })
  checkoutRequestId?: string;

  @Column({ length: 64, nullable: true })
  mpesaReceiptNumber?: string;

  @Column({ type: 'integer', nullable: true })
  resultCode?: number;

  @Column({ type: 'text', nullable: true })
  resultDescription?: string;

  @Column({ type: 'text', nullable: true })
  callbackData?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
