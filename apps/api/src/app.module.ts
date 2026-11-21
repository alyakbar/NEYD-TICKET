import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { Organization } from './organizations/organization.entity';
import { Department } from './organizations/department.entity';
import { User } from './users/user.entity';
import { Ticket } from './tickets/ticket.entity';
import { AuthorizationModule } from './authorization/authorization.module';
import { Payment } from './payments/payment.entity';
import { SnakeNamingStrategy } from './database/snake-naming.strategy';
import { PaymentsModule } from './payments/payments.module';
import { EventsModule } from './events/events.module';
import { EventRegistrationsModule } from './event-registrations/event-registrations.module';
import { EventEntity } from './events/event.entity';
import { EventRegistration } from './event-registrations/event-registration.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '../../../.env.local'),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const databaseUrl = process.env.DATABASE_URL;

        if (process.env.NODE_ENV === 'production' && !databaseUrl) {
          console.error('Production startup configuration: DATABASE_URL is missing.');
          throw new Error('DATABASE_URL must be configured in production.');
        }
        if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
          console.error('Production startup configuration: JWT_SECRET is missing.');
          throw new Error('JWT_SECRET must be configured in production.');
        }

        if (databaseUrl) {
          return {
            type: 'postgres' as const,
            url: databaseUrl,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
            synchronize: false,
            logging: false,
            extra: {
              max: Number(process.env.DB_POOL_MAX ?? 20),
              min: Number(process.env.DB_POOL_MIN ?? 2),
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 5000,
            },
            entities: [Organization, Department, User, Ticket, Payment, EventEntity, EventRegistration],
            autoLoadEntities: true,
            namingStrategy: new SnakeNamingStrategy(),
          };
        }

        return {
          type: 'sqlite' as const,
          database: ':memory:',
          synchronize: true,
          logging: false,
          entities: [Organization, Department, User, Ticket, Payment, EventEntity, EventRegistration],
          dropSchema: true,
          namingStrategy: new SnakeNamingStrategy(),
        };
      },
    }),
    HealthModule,
    AuthorizationModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    TicketsModule,
    PaymentsModule,
    EventsModule,
    EventRegistrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
