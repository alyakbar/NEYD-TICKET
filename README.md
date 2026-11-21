# NEYD Ticketing Platform

NEYD is a TypeScript monorepo with a NestJS API, Next.js service desk dashboard, PostgreSQL migrations, M-Pesa Daraja checkout, and AWS ECS deployment scaffolding.

## What is implemented

- Public ticket and purchase intake: customers enter their contact details and do not need an account or sign in.
- Administrator attendee view for event registrations, with authorized editing of attendee contact and registration details.
- Administrator event management for creating, editing, archiving, and restoring public events.
- M-Pesa Daraja STK Push flow with server-side KES pricing, payment records, callback handling, and payment status.
- Event registration with a unique ticket code and QR-code email after confirmed payment.
- Operator dashboard for viewing tickets, approving paid requests, and assigning approved tickets to operators.
- JWT-protected operator APIs with RBAC permissions and organization-scoped ticket access.
- PostgreSQL migrations and repeatable NEYD organization, department, and operator seed data.
- GitHub Actions image build/deploy for API and dashboard on ECS Fargate, with migrations run before rollout.
- Terraform for ECR, ECS, HTTPS ALB, Route 53, and Secrets Manager access.

## Local development

```bash
npm ci
cp .env.example .env.local
npm run build
npm run dev --workspace @neyd/api
```

In another terminal:

```bash
npm run dev --workspace @neyd/web
```

The public request landing page is at http://localhost:3000, checkout is at http://localhost:3000/request, operator dashboard at http://localhost:3000/admin, the API at http://localhost:3001, and Swagger at http://localhost:3001/docs. Without `DATABASE_URL`, the API uses an in-memory SQLite database; its data is discarded when it restarts. PostgreSQL uses migrations and never runs TypeORM schema synchronization.

Set `JWT_SECRET` to a unique random value before using operator login. Example:

```bash
openssl rand -hex 32
```

## Public purchase and payment

The customer checkout is available at `/request`. It is public and does not ask customers to create an account. It creates a ticket in `awaiting-payment` status and starts an STK Push using the selected item code. A successful Daraja callback moves that ticket to `new`; failed or pending payments do not enter the operator approval queue.

The API exposes:

- `GET /api/payments/catalog` — publishes configured items and their KES prices.
- `POST /api/tickets` — creates a public request and captures requestor details.
- `POST /api/payments/stk-push` — accepts a ticket ID, Kenyan phone number, and catalog item code. It does not accept a client-supplied amount.
- `POST /api/payments/event-stk-push` — accepts an event registration ID and charges the price stored on that event in PostgreSQL.
- `GET /api/payments/event-registration/:registrationId/status` — returns the latest payment status for the registration, including subsequent attempts.
- `POST /api/payments/:id/reconcile` — asks Daraja to verify a pending STK transaction if its callback has not arrived.
- `POST /api/payments/callback/:token` — receives Daraja results; the callback token must match `MPESA_CALLBACK_TOKEN`.
- `GET /api/payments/:id/status` — returns the payment state and receipt.
- `POST /api/payments/:id/ticket-email/retry` — retries delivery of a failed event ticket email after payment confirmation.
- `GET /api/event-registrations/count` — returns the public registration total without attendee details.
- `GET /api/event-registrations` — lists registrations for signed-in administrators with event and ticket details.
- `PATCH /api/event-registrations/:id` — updates attendee contact and registration details; payment status, ticket code, and event assignment are not editable.
- `GET /api/events` — lists public, non-archived events.
- `GET /api/events/admin` — lists all events, including archived ones, for signed-in administrators.
- `POST /api/events` and `PATCH /api/events/:id` — create and update events.
- `PATCH /api/events/:id/archive` and `PATCH /api/events/:id/restore` — hide or republish events without deleting attendee registrations or payment history.

Event customers register at `/register`. After saving the registration, the web app starts an STK Push using the event's server-side database price and the phone number from the registration. The attendee page displays the latest payment status for that registration, including retries. A successful callback marks the registration as paid; an unsuccessful callback marks it failed. While a checkout remains pending, the registration page automatically checks Daraja after one minute, then backs off up to five minutes between checks; the API also rate-limits duplicate queries. If Daraja explicitly reports that the checkout does not exist, the payment and registration are marked failed so the user can safely review the result and retry; temporary Daraja availability errors remain pending and are retried automatically. Event payments do not use `MPESA_CATALOG_JSON`.

Configure `MPESA_ENVIRONMENT=sandbox` and the Daraja consumer key, consumer secret, shortcode, passkey, public HTTPS callback base URL, and a long random callback token in `.env.local` or deployment secrets. The callback base URL must end with `/api/payments/callback`; the API appends the token path segment. A local API needs an HTTPS tunnel or deployed URL for Safaricom to reach its callback. Never commit credentials or paste them into source files. Set `MPESA_CATALOG_JSON` to a JSON array with your actual `/request` prices, for example:

```json
[
  { "code": "hardware-request", "label": "Hardware request", "amountKsh": 0 }
]
```

Replace `0` with the actual whole-KES price before enabling checkout; zero is intentionally rejected by the API. No real price or Safaricom credential is included in the repository. Use sandbox credentials and a sandbox-accepted catalog first, then switch to live credentials only after Safaricom approval and a verified HTTPS callback.

Once Daraja confirms an event payment, the API issues a unique ticket code and emails the attendee a formatted event summary and a PDF ticket with the attendee and event details plus an embedded QR code through SMTP using Nodemailer. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `EVENT_TICKET_FROM` in `.env.local` or deployment secrets; if your mail provider requires authentication, also set both `SMTP_USER` and `SMTP_PASS`. Use port 465 with `SMTP_SECURE=true`, or port 587 with `SMTP_SECURE=false` (STARTTLS is required). Obtain the SMTP server and login details from your domain email provider; do not commit credentials. The API does not probe SMTP at startup; it connects only when sending a paid ticket or retrying a failed delivery. An SMTP `sent` status means the mail server accepted the message, not that it reached the inbox. The success page displays the ticket code and email status, with a retry option if delivery fails. Apply PostgreSQL migration `005_event_registration_tickets.sql` before using ticket delivery; the deployment workflow runs migrations automatically.

## Operator access and admin dashboard

The dashboard home page is for operators and requires a seeded operator account. Public customers use `/request` without signing in. Ticket approval and reassignment endpoints require a signed JWT and the role permission; spoofable role headers are not accepted.

Seed PostgreSQL data only after applying migrations. Set unique operator passwords of at least 12 characters:

```bash
DATABASE_URL='postgres://...' npm run db:migrate
DATABASE_URL='postgres://...' INITIAL_ADMIN_PASSWORD='replace-with-a-unique-secret' npm run db:seed
```

The seed creates `admin@neyd.local`, `manager@neyd.local`, `agent@neyd.local`, the NEYD Kenya organization, and Information Technology, Finance, and Human Resources departments. Optional `INITIAL_MANAGER_PASSWORD` and `INITIAL_AGENT_PASSWORD` values can also be supplied to provision those seeded operators. Password values are hashed with scrypt and are never logged.

## PostgreSQL

Migration files are in `apps/api/migrations/postgresql`. Local API, web, and database configuration comes from the repository-root `.env.local` only; `.env.example` is a template and is not loaded by the application. Environment variables already supplied by the shell or deployment platform take precedence over `.env.local`. Run `npm run db:migrate` after building the API; the migration runner tracks applied files in `schema_migrations`. `npm run db:seed` is repeatable and updates the passwords supplied to the seed command. Set `DATABASE_SSL=false` only for a local PostgreSQL instance without TLS; hosted PostgreSQL connections use TLS by default. Protect the seed command and its password values.

Event administration migrations `006_event_archiving.sql` and `007_event_highlights_json.sql` add archive state and portable highlight storage. Archived events are hidden from public listings but retain registrations and payment history.
Event administrators can set a poster by uploading it through the configured hosting provider and pasting its public HTTPS image URL from `hosting.alsawwirhub.com` into the event form. Poster URLs are shown in the public event listing, registration details, success page, ticket email, and PDF ticket. The API rejects non-HTTPS, off-host, credentialed, and query-bearing poster URLs; use a public URL, not a private or signed link. Apply migration `008_event_poster_url.sql` to add poster storage.
Use public PNG or JPEG poster images no larger than 4 MB if you want the poster embedded in the emailed PDF ticket; PDF poster retrieval is limited to the configured hosting hostname and times out after eight seconds. Set `API_SERVER_URL` to the absolute API base URL (`http://localhost:3001/api` for local development). The ECS web task uses the API domain automatically for server-rendered event listings; browser API requests use same-origin `/api`. After changing Terraform, apply the infrastructure changes and deploy the updated ECS task definition so the web container receives `API_SERVER_URL`.

## AWS and GitHub Actions deployment

Terraform expects existing public/private VPC subnets, a PostgreSQL database, an issued ACM certificate, a Route 53 hosted zone, and an AWS Secrets Manager JSON secret. It creates ECR repositories, ECS services, HTTPS routing, and the task execution permissions.

1. Create a Secrets Manager JSON secret with `DATABASE_URL`, `JWT_SECRET`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_TOKEN`, `MPESA_CATALOG_JSON`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EVENT_TICKET_FROM`.
2. Provide `terraform.tfvars` values for `aws_region`, `vpc_id`, `public_subnets`, `private_subnets`, `application_secret_arn`, `api_domain`, `route53_zone_id`, `acm_certificate_arn`, `web_origin`, `github_owner`, and `github_repository`. Start with `mpesa_environment = "sandbox"` and `initial_desired_count = 0`. Terraform creates a GitHub OIDC provider; if the AWS account already has one for GitHub Actions, import that provider into state before applying.
3. Apply Terraform. The initial ECS desired count is zero so ECS does not try to pull images before the first workflow run.
4. Configure GitHub repository variables `AWS_REGION`, `ECR_API_REPOSITORY` (`neyd-api` by default), `ECR_WEB_REPOSITORY` (`neyd-web` by default), `ECS_SUBNET_IDS` (comma-separated private subnet IDs), and `ECS_SECURITY_GROUP` (Terraform output `ecs_security_group_id`).
5. Add the GitHub secret `AWS_DEPLOY_ROLE_ARN` using the Terraform output of the same name. The OIDC trust is restricted to the configured repository's `main` branch.
6. Run the `Build and deploy to ECS` workflow. It builds and pushes immutable commit-tagged API and web images, runs PostgreSQL migrations in a Fargate task, then deploys both services.
7. Seed the production database once using a controlled one-off API task with `INITIAL_ADMIN_PASSWORD` supplied as a temporary environment override. Do not store that bootstrap password in the permanent task definition or source control.

The ALB routes `/api/*` to NestJS and all other paths to the Next.js dashboard; HTTP redirects to HTTPS. The web and API are available at `https://api_domain`. Ensure the private subnets can reach ECR and Safaricom (through NAT or VPC endpoints where applicable), and the ECS task security group can connect to PostgreSQL.

## Vercel services deployment

The repository includes a root [vercel.json](/home/non/projects/NEYD_TICKECT/vercel.json) with separate `api` and `web` services. `/api/*` is routed to the NestJS service and all other paths to Next.js. The web service receives the API service's internal base URL through `API_SERVICE_URL`; browser requests continue to use same-origin `/api`.

Before deploying, configure production secrets and environment variables in the Vercel project, including `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, and the Daraja/SMTP variables documented above. Do not set `API_SERVICE_URL` manually because Vercel injects it through the service binding.

## Local Docker builds

From the repository root:

```bash
docker build -f apps/api/Dockerfile -t neyd-api .
docker build -f apps/web/Dockerfile -t neyd-web .
```
