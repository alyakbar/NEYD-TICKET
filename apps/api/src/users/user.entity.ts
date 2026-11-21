import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  employeeId?: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'password_hash', nullable: true, select: false })
  passwordHash?: string;

  @Column({ nullable: true })
  role?: string;

  @Column({ default: 'employee' })
  accountType: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ default: 'en-KE' })
  locale: string;

  @Column({ nullable: true })
  lastLoginAt?: Date;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, (organization) => organization.users, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization: Organization;
}
