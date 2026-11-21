import { Injectable } from '@nestjs/common';
import { Ticket } from './ticket.entity';

@Injectable()
export class TicketWorkflowService {
  private readonly slaByPriority: Record<string, number> = {
    critical: 2,
    high: 4,
    medium: 8,
    low: 24,
  };

  calculateSlaDeadline(ticket: Partial<Ticket>): Date {
    const priority = ticket.priority ?? 'medium';
    const hours = this.slaByPriority[priority.toLowerCase()] ?? 8;
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  evaluateState(ticket: Partial<Ticket>): string {
    const status = (ticket.status ?? 'new').toLowerCase();
    if (status === 'resolved' || status === 'closed') {
      return status;
    }
    if (ticket.escalated) {
      return 'escalated';
    }
    if (status === 'in-progress' || status === 'assigned') {
      return 'in-progress';
    }
    return 'new';
  }

  buildStatusHistory(ticket: Partial<Ticket> | string[] | undefined, status: string): string[] {
    const current = Array.isArray(ticket) ? ticket : this.safeParse((ticket as Partial<Ticket> | undefined)?.statusHistory ?? '[]');
    const parsed = [...current];
    parsed.push(`${new Date().toISOString()}:${status}`);
    return parsed;
  }

  private safeParse(raw: string | string[] | undefined): string[] {
    if (Array.isArray(raw)) {
      return raw;
    }

    try {
      const parsed = JSON.parse(raw ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
