import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { DEFAULT_ROLE_PERMISSIONS } from '../authorization/authorization.constants';
import { User } from '../users/user.entity';
import { Ticket } from './ticket.entity';
import { TicketWorkflowService } from './ticket-workflow.service';

export interface OperatorContext {
  role: string;
  organizationId: string | null;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly workflowService: TicketWorkflowService,
  ) {}

  async findAll(operator: OperatorContext): Promise<Ticket[]> {
    const query = this.ticketsRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.organization', 'organization')
      .orderBy('ticket.createdAt', 'DESC');

    if (operator.role !== 'super-administrator') {
      if (!operator.organizationId) {
        throw new ForbiddenException('Operator is not assigned to an organization.');
      }
      query.andWhere('organization.id = :organizationId', { organizationId: operator.organizationId });
    }

    return query.getMany();
  }

  async create(payload: {
    title: string;
    description: string;
    priority?: string;
    category?: string;
    requesterName?: string;
    requesterEmail?: string;
    phone?: string;
    department?: string;
    serviceArea?: string;
    organization?: { id: string };
    purchaseType?: string;
    hardware?: string;
  }): Promise<Ticket> {
    if (!payload.title?.trim() || !payload.description?.trim()) {
      throw new BadRequestException('Ticket title and description are required.');
    }
    const requesterName = payload.requesterName?.trim();
    const requesterEmail = payload.requesterEmail?.trim().toLowerCase();
    if (!requesterName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail ?? '')) {
      throw new BadRequestException('A requestor name and valid email address are required.');
    }

    const priority = (payload.priority ?? 'medium').toLowerCase();
    const slaHours = { critical: 2, high: 4, medium: 8, low: 24 }[priority] ?? 8;
    if (payload.organization?.id && !isUUID(payload.organization.id)) {
      throw new BadRequestException('The selected organization ID is invalid.');
    }
    const organization = payload.organization?.id
      ? await this.organizationsRepository.findOneBy({ id: payload.organization.id })
      : null;
    if (payload.organization?.id && !organization) {
      throw new BadRequestException('The selected organization does not exist.');
    }

    const ticket = this.ticketsRepository.create({
      title: payload.title,
      description: payload.description,
      priority,
      severity: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'medium',
      category: payload.category ?? 'general',
      assignee: 'unassigned',
      requesterName,
      requesterEmail,
      phone: payload.phone?.trim(),
      department: payload.department?.trim(),
      purchaseType: payload.purchaseType?.trim(),
      hardware: payload.hardware?.trim(),
      serviceArea: payload.serviceArea ?? payload.department ?? 'it-service',
      status: 'awaiting-payment',
      slaHours,
      slaDeadline: this.workflowService.calculateSlaDeadline({ priority }),
      firstResponseAt: new Date(),
      statusHistory: this.workflowService.buildStatusHistory([], 'awaiting-payment'),
      escalated: false,
      organization: organization ?? undefined,
    });

    return this.ticketsRepository.save(ticket);
  }

  async approve(id: string, operator: OperatorContext): Promise<Ticket> {
    const ticket = await this.findForOperator(id, operator);
    if (ticket.status === 'approved') {
      return ticket;
    }
    if (ticket.status !== 'new') {
      throw new ConflictException(`A ticket in status "${ticket.status}" cannot be approved.`);
    }

    ticket.status = 'approved';
    ticket.statusHistory = this.workflowService.buildStatusHistory(ticket, ticket.status);
    return this.ticketsRepository.save(ticket);
  }

  async assign(id: string, assigneeEmail: string, operator: OperatorContext): Promise<Ticket> {
    const email = assigneeEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid assignee email address is required.');
    }

    const ticket = await this.findForOperator(id, operator);
    const assignee = await this.usersRepository.findOne({
      where: { email, active: true },
      relations: ['organization'],
    });
    const assigneePermissions = DEFAULT_ROLE_PERMISSIONS[assignee?.role as keyof typeof DEFAULT_ROLE_PERMISSIONS] as readonly string[] | undefined;
    if (!assignee || !assigneePermissions?.includes('tickets:assign')) {
      throw new BadRequestException('The assignee must be an active ticket operator.');
    }
    if (!assignee.organization) {
      throw new BadRequestException('The assignee must belong to an organization.');
    }
    if (!ticket.organization && operator.role === 'super-administrator') {
      ticket.organization = assignee.organization;
    } else if (ticket.organization?.id !== assignee.organization?.id) {
      throw new BadRequestException('Tickets can only be assigned to an operator in the same organization.');
    }

    ticket.assignee = assignee.email;
    if (ticket.status === 'approved') {
      ticket.status = 'assigned';
      ticket.statusHistory = this.workflowService.buildStatusHistory(ticket, ticket.status);
    } else if (ticket.status !== 'assigned' && ticket.status !== 'in-progress') {
      throw new ConflictException('Approve the ticket before assigning an operator.');
    }
    return this.ticketsRepository.save(ticket);
  }

  private async findForOperator(id: string, operator: OperatorContext): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findOne({ where: { id }, relations: ['organization'] });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} was not found.`);
    }
    if (operator.role !== 'super-administrator' && (!operator.organizationId || ticket.organization?.id !== operator.organizationId)) {
      throw new ForbiddenException('The requested ticket is outside your organization.');
    }
    return ticket;
  }
}
