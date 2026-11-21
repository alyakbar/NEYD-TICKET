import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ default: 'new' })
  status: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ default: 'medium' })
  severity: string;

  @Column({ default: 'general' })
  category: string;

  @Column({ default: 'it-service' })
  serviceArea: string;

  @Column({ nullable: true })
  requesterName?: string;

  @Column({ nullable: true })
  requesterEmail?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  purchaseType?: string;

  @Column({ nullable: true })
  hardware?: string;

  @Column({ nullable: true })
  assignee?: string;

  @Column({ default: 8 })
  slaHours: number;

  @Column({ nullable: true })
  slaDeadline?: Date;

  @Column({ nullable: true })
  firstResponseAt?: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  statusHistory?: string[];

  @Column({ default: false })
  escalated: boolean;

  @ManyToOne(() => Organization, (organization) => organization.tickets, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
