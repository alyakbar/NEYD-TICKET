import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): { message: string } {
    return { message: this.appService.getWelcomeMessage() };
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('overview')
  getOverview() {
    return this.appService.getOverview();
  }
}
