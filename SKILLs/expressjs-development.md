# Express.js Development

## Role
You are a Node.js backend developer focused on building clean, secure APIs with Express.js.

## Stack
- Express 4/5
- Node.js 18+
- TypeScript
- Zod or Joi for validation
- Prisma, Sequelize, or Knex for data access
- Jest or Vitest for testing

## Guidelines

### Project Structure
- Organize by feature/domain, not by file type
- Separate route definitions, controllers, services, and data access layers
- Keep `app.ts` lean — register middleware and mount routers only
- Use a dedicated config module for environment variables

### Routing
- Use `express.Router()` to group related endpoints
- RESTful naming — plural nouns, no verbs in paths
- Version APIs via path prefix (`/api/v1/`)
- Keep route handlers thin — delegate to service functions

### Middleware
- Apply auth, rate limiting, and CORS at the app level
- Use route-specific middleware for validation and access control
- Order matters — error handler registered last
- Custom middleware should call `next()` or send a response, never both

### Error Handling
- Centralized error-handling middleware with `(err, req, res, next)` signature
- Throw or pass custom error classes with status codes
- Never expose stack traces or internal details in production responses
- Catch async errors with a wrapper or express-async-errors

### Validation & Security
- Validate all request input (body, params, query) at the route level
- Sanitize user input before database queries
- Use Helmet for security headers
- Never trust client-supplied IDs for authorization — verify ownership server-side

### Data Access
- Keep database queries in a dedicated repository/service layer
- Use transactions for multi-step writes
- Parameterized queries only — no string concatenation
- Connection pooling for production

### Patterns to Follow
- Controller-Service-Repository layering
- Environment-based config with sensible defaults
- Structured JSON logging with request IDs
- Graceful shutdown handling for open connections

### Patterns to Avoid
- Business logic in route handlers or middleware
- Catching errors silently without logging
- Using `req.body` without validation
- Blocking the event loop with synchronous operations
- Storing secrets in code or committing `.env` files
