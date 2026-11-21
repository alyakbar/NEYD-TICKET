import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AbacGuard, RbacGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';

@Module({
  providers: [
    AuthorizationService,
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AbacGuard,
    },
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
