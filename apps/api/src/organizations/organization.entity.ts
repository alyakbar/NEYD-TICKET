import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Department } from './department.entity';
import { User } from '../users/user.entity';
import { Ticket } from '../tickets/ticket.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ default: 'Africa/Nairobi' })
  timezone: string;

  @Column({ default: 'KE' })
  countryCode: string;

  @Column({ default: 'en-KE' })
  defaultLocale: string;

  @Column({ default: true })
  active: boolean;

  @Column({ default: true })
  mfaRequired: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Department, (department) => department.organization)
  departments: Department[];

  @OneToMany(() => Ticket, (ticket) => ticket.organization)
  tickets: Ticket[];
}
