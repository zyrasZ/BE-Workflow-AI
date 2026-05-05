# Email Processing Nodes - Developer Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Adding a New Provider Adapter](#adding-a-new-provider-adapter)
5. [Adding New Template Helpers](#adding-new-template-helpers)
6. [Database Schema](#database-schema)
7. [Encryption System](#encryption-system)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Contributing](#contributing)

---

## Architecture Overview

The Email Processing Nodes feature follows a layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     API Layer                            │
│  (Next.js API Routes - /api/email/*)                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Business Logic Layer                    │
│  (Email Nodes, Filters, Parser, Template Engine)       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Provider Adapter Layer                  │
│  (IMAP, Gmail, Outlook, SMTP Adapters)                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Data Access Layer                      │
│  (Supabase Client, Database Operations)                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Database Layer                        │
│  (PostgreSQL with RLS Policies)                         │
└─────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Provider Abstraction**: Unified interface for all email providers
2. **Security First**: Encryption for credentials, RLS for data access
3. **Async Processing**: Non-blocking operations for scalability
4. **Error Resilience**: Comprehensive error handling and retry logic
5. **Type Safety**: Full TypeScript support with strict typing

---

## Project Structure

```
sourse/Back-end/
├── app/api/email/                    # API routes
│   ├── accounts/                     # Email accounts CRUD
│   │   ├── route.ts                  # GET, POST
│   │   └── [id]/route.ts             # GET, PATCH, DELETE
│   ├── templates/                    # Email templates CRUD
│   │   └── route.ts                  # GET, POST, PATCH, DELETE
│   ├── read/                         # Email reading endpoint
│   ├── send/                         # Email sending endpoint
│   ├── parse/                        # Email parsing endpoint
│   └── filter/                       # Email filtering endpoint
│
├── lib/email-nodes/                  # Core email processing logic
│   ├── types.ts                      # TypeScript type definitions
│   ├── parser.ts                     # Email parser implementation
│   ├── filter.ts                     # Email filter implementation
│   ├── template.ts                   # Template engine implementation
│   │
│   ├── adapters/                     # Provider adapters
│   │   ├── imap.ts                   # IMAP adapter
│   │   ├── gmail.ts                  # Gmail API adapter
│   │   ├── outlook.ts                # Outlook API adapter
│   │   └── smtp.ts                   # SMTP adapter
│   │
│   ├── utils/                        # Utility functions
│   │   ├── encryption.ts             # AES-256-GCM encryption
│   │   ├── validation.ts             # Input validation
│   │   └── rate-limiter.ts           # Rate limiting
│   │
│   ├── docs/                         # Documentation
│   │   ├── API_DOCUMENTATION.md      # API reference
│   │   ├── USER_GUIDE.md             # User guide
│   │   └── DEVELOPER_GUIDE.md        # This file
│   │
│   └── __tests__/                    # Tests
│       ├── parser.test.ts
│       ├── filter.test.ts
│       ├── template.test.ts
│       └── encryption.test.ts
│
├── SQL/                              # Database migrations
│   └── email-schema.sql              # Email tables schema
│
└── .env.example                      # Environment variables template
```

---

## Core Components

### 1. Email Parser

**Location:** `lib/email-nodes/parser.ts`

**Purpose:** Parse raw email data into structured `EmailMessage` objects.

**Key Features:**
- MIME parsing
- Header extraction
- Body parsing (text and HTML)
- Attachment extraction
- Encoding/decoding (base64, quoted-printable)

**Usage Example:**

```typescript
import { EmailParser } from '@/lib/email-nodes/parser';

const parser = new EmailParser();
const emailMessage = await parser.parse(rawEmail);

console.log(emailMessage.headers.subject);
console.log(emailMessage.body.text);
console.log(emailMessage.attachments.length);
```

### 2. Email Filter

**Location:** `lib/email-nodes/filter.ts`

**Purpose:** Filter emails based on criteria.

**Key Features:**
- Multiple filter types (sender, subject, date, attachment, content)
- AND/OR logic
- Regex pattern matching
- Provider-specific filters (labels, categories)

**Usage Example:**

```typescript
import { EmailFilter } from '@/lib/email-nodes/filter';

const filter = new EmailFilter({
  rules: [
    { field: 'from', operator: 'contains', value: '@example.com' },
    { field: 'subject', operator: 'matches', value: 'Invoice #\\d+' }
  ],
  logic: 'AND'
});

const result = filter.execute(emails);
console.log(result.matched); // Emails that match
console.log(result.unmatched); // Emails that don't match
```

### 3. Template Engine

**Location:** `lib/email-nodes/template.ts`

**Purpose:** Render email templates with dynamic data.

**Key Features:**
- Variable substitution
- Conditional blocks
- Loops
- Helper functions
- XSS sanitization

**Usage Example:**

```typescript
import { EmailTemplateEngine } from '@/lib/email-nodes/template';

const engine = new EmailTemplateEngine();

const template = 'Hello {{user_name}}, your order #{{order_id}} is ready!';
const data = { user_name: 'John', order_id: '12345' };

const rendered = engine.render(template, data);
// Output: "Hello John, your order #12345 is ready!"
```

### 4. Provider Adapters

**Location:** `lib/email-nodes/adapters/`

**Purpose:** Abstract provider-specific implementations.

**Interface:**

```typescript
interface EmailProviderAdapter {
  connect(config: ProviderConfig): Promise<void>;
  disconnect(): Promise<void>;
  fetchEmails(options: FetchOptions): Promise<EmailMessage[]>;
  fetchEmail(id: string): Promise<EmailMessage>;
  sendEmail(email: OutgoingEmail): Promise<SendResult>;
  getRateLimits(): RateLimitInfo;
}
```

**Available Adapters:**
- `IMAPAdapter` - IMAP protocol
- `GmailAdapter` - Gmail API
- `OutlookAdapter` - Microsoft Graph API
- `SMTPAdapter` - SMTP protocol

---

## Adding a New Provider Adapter

Follow these steps to add support for a new email provider:

### Step 1: Create Adapter File

Create a new file in `lib/email-nodes/adapters/`:

```typescript
// lib/email-nodes/adapters/my-provider.ts

import { EmailProviderAdapter, ProviderConfig, EmailMessage, OutgoingEmail, SendResult, FetchOptions, RateLimitInfo } from '../types';

export class MyProviderAdapter implements EmailProviderAdapter {
  private connection: any;
  private config: ProviderConfig;
  
  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    // Implement connection logic
    // Example: Initialize API client, authenticate, etc.
  }
  
  async disconnect(): Promise<void> {
    // Implement disconnection logic
    // Example: Close connections, cleanup resources
  }
  
  async fetchEmails(options: FetchOptions): Promise<EmailMessage[]> {
    // Implement email fetching logic
    // Example: Call provider API, parse response, return EmailMessage[]
    return [];
  }
  
  async fetchEmail(id: string): Promise<EmailMessage> {
    // Implement single email fetching logic
    // Example: Call provider API with email ID, parse response
    throw new Error('Not implemented');
  }
  
  async sendEmail(email: OutgoingEmail): Promise<SendResult> {
    // Implement email sending logic
    // Example: Construct message, call provider API, return result
    return {
      success: false,
      timestamp: new Date(),
      provider: 'my-provider'
    };
  }
  
  getRateLimits(): RateLimitInfo {
    // Return provider's rate limit information
    return {
      limit: 100,
      remaining: 100,
      resetTime: new Date(Date.now() + 3600000)
    };
  }
}
```

### Step 2: Update Types

Add your provider to the provider type in `lib/email-nodes/types.ts`:

```typescript
export interface ProviderConfig {
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook' | 'smtp' | 'my-provider';
  // ... rest of config
}
```

### Step 3: Register Adapter

Create a factory function to instantiate adapters:

```typescript
// lib/email-nodes/adapters/index.ts

import { IMAPAdapter } from './imap';
import { GmailAdapter } from './gmail';
import { OutlookAdapter } from './outlook';
import { SMTPAdapter } from './smtp';
import { MyProviderAdapter } from './my-provider';
import { EmailProviderAdapter, ProviderConfig } from '../types';

export function createAdapter(config: ProviderConfig): EmailProviderAdapter {
  switch (config.provider) {
    case 'imap':
      return new IMAPAdapter();
    case 'gmail':
      return new GmailAdapter();
    case 'outlook':
      return new OutlookAdapter();
    case 'smtp':
      return new SMTPAdapter();
    case 'my-provider':
      return new MyProviderAdapter();
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

### Step 4: Update Database Schema

Add your provider to the database constraint:

```sql
ALTER TABLE email_accounts 
DROP CONSTRAINT IF EXISTS email_accounts_provider_check;

ALTER TABLE email_accounts 
ADD CONSTRAINT email_accounts_provider_check 
CHECK (provider IN ('imap', 'pop3', 'gmail', 'outlook', 'smtp', 'my-provider'));
```

### Step 5: Update API Validation

Update validation in API routes to accept the new provider:

```typescript
// app/api/email/accounts/route.ts

const validProviders = ['imap', 'pop3', 'gmail', 'outlook', 'smtp', 'my-provider'];
if (!validProviders.includes(body.provider)) {
  return NextResponse.json(
    { error: 'Validation error', message: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
    { status: 400 }
  );
}
```

### Step 6: Write Tests

Create tests for your adapter:

```typescript
// lib/email-nodes/__tests__/my-provider.test.ts

import { MyProviderAdapter } from '../adapters/my-provider';

describe('MyProviderAdapter', () => {
  let adapter: MyProviderAdapter;
  
  beforeEach(() => {
    adapter = new MyProviderAdapter();
  });
  
  it('should connect successfully', async () => {
    await expect(adapter.connect(mockConfig)).resolves.not.toThrow();
  });
  
  it('should fetch emails', async () => {
    await adapter.connect(mockConfig);
    const emails = await adapter.fetchEmails({ limit: 10 });
    expect(Array.isArray(emails)).toBe(true);
  });
  
  // Add more tests...
});
```

### Step 7: Document Provider

Add documentation for your provider:

1. Update `USER_GUIDE.md` with setup instructions
2. Update `API_DOCUMENTATION.md` with config format
3. Add example code snippets

---

## Adding New Template Helpers

Template helpers are functions that can be used in email templates.

### Step 1: Define Helper Function

Add your helper to `lib/email-nodes/template.ts`:

```typescript
// lib/email-nodes/template.ts

export class EmailTemplateEngine {
  private helpers: Map<string, HelperFunction>;
  
  constructor() {
    this.helpers = new Map();
    this.registerDefaultHelpers();
  }
  
  private registerDefaultHelpers(): void {
    // Existing helpers...
    
    // Add your new helper
    this.registerHelper('myHelper', (value: any, options: any) => {
      // Implement helper logic
      return transformedValue;
    });
  }
  
  registerHelper(name: string, fn: HelperFunction): void {
    this.helpers.set(name, fn);
  }
}
```

### Step 2: Example Helpers

Here are some example helper implementations:

#### Format Currency

```typescript
this.registerHelper('formatCurrency', (value: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(value);
});
```

**Usage in template:**
```
Total: {{formatCurrency total_amount "USD"}}
```

#### Truncate Text

```typescript
this.registerHelper('truncate', (text: string, length: number = 50) => {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
});
```

**Usage in template:**
```
{{truncate description 100}}
```

#### Format Relative Time

```typescript
this.registerHelper('timeAgo', (date: Date | string) => {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
});
```

**Usage in template:**
```
Posted {{timeAgo created_at}}
```

### Step 3: Write Tests

Test your helper function:

```typescript
// lib/email-nodes/__tests__/template.test.ts

describe('Template Helpers', () => {
  let engine: EmailTemplateEngine;
  
  beforeEach(() => {
    engine = new EmailTemplateEngine();
  });
  
  it('should format currency', () => {
    const template = '{{formatCurrency amount "USD"}}';
    const result = engine.render(template, { amount: 1234.56 });
    expect(result).toBe('$1,234.56');
  });
  
  // Add more tests...
});
```

### Step 4: Document Helper

Add documentation to `USER_GUIDE.md`:

```markdown
#### myHelper

Description of what the helper does.

**Syntax:**
```
{{myHelper value param1 param2}}
```

**Parameters:**
- `value` - The value to transform
- `param1` - First parameter
- `param2` - Second parameter

**Example:**
```
{{myHelper user_name "uppercase"}}
```
```

---

## Database Schema

### Tables

#### email_accounts

Stores email account configurations with encrypted credentials.

```sql
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  encrypted_config TEXT NOT NULL,
  encryption_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email_address, provider)
);
```

#### email_templates

Stores email templates for sending emails.

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(500) NOT NULL,
  body_text TEXT,
  body_html TEXT,
  body_type VARCHAR(20) NOT NULL DEFAULT 'both',
  variables JSONB DEFAULT '[]'::jsonb,
  category VARCHAR(100),
  tags TEXT[],
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
```

#### email_logs

Stores logs of email operations.

```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  operation VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  email_from VARCHAR(255),
  email_to TEXT[],
  email_subject VARCHAR(500),
  message_id VARCHAR(255),
  thread_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  error_code VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only access their own data:

```sql
-- Example policy for email_accounts
CREATE POLICY "Users can view own email accounts"
  ON email_accounts
  FOR SELECT
  USING (auth.uid() = user_id);
```

### Migrations

To run the migration:

```bash
# Using Supabase CLI
supabase db push

# Or execute SQL directly
psql -h your-host -U your-user -d your-database -f SQL/email-schema.sql
```

---

## Encryption System

### Overview

The encryption system uses AES-256-GCM (Galois/Counter Mode) for encrypting sensitive email credentials.

**Key Features:**
- 256-bit encryption key
- Authenticated encryption (prevents tampering)
- Unique IV (Initialization Vector) for each encryption
- Authentication tag for integrity verification

### Configuration

Set the encryption key in your environment:

```bash
# Generate a key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
EMAIL_ENCRYPTION_KEY=your-generated-key-here
```

### Usage

```typescript
import { encryptConfig, decryptConfig } from '@/lib/email-nodes/utils/encryption';

// Encrypt
const config = {
  username: 'user@example.com',
  password: 'secret123',
  host: 'imap.gmail.com',
  port: 993
};

const encrypted = encryptConfig(config);
// {
//   encrypted: 'base64-encrypted-data',
//   iv: 'base64-iv',
//   authTag: 'base64-auth-tag',
//   algorithm: 'aes-256-gcm'
// }

// Decrypt
const decrypted = decryptConfig(encrypted);
// { username: 'user@example.com', password: 'secret123', ... }
```

### Security Best Practices

1. **Key Management:**
   - Store encryption key in environment variables
   - Never commit keys to version control
   - Rotate keys periodically
   - Use different keys for dev/staging/production

2. **Key Rotation:**
   ```typescript
   // When rotating keys:
   // 1. Decrypt all configs with old key
   // 2. Update EMAIL_ENCRYPTION_KEY
   // 3. Re-encrypt all configs with new key
   ```

3. **Logging:**
   - Never log decrypted credentials
   - Use `redactSensitiveFields()` before logging
   - Log encryption/decryption errors without exposing data

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test parser.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Test Structure

```typescript
// lib/email-nodes/__tests__/example.test.ts

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });
  
  afterEach(() => {
    // Cleanup after each test
  });
  
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = functionToTest(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Testing Best Practices

1. **Unit Tests:**
   - Test individual functions in isolation
   - Mock external dependencies
   - Cover edge cases and error conditions

2. **Integration Tests:**
   - Test component interactions
   - Use test database or mock services
   - Test API endpoints end-to-end

3. **Property-Based Tests:**
   - Use `fast-check` for property testing
   - Test universal properties across many inputs
   - See design document for defined properties

### Example Tests

```typescript
// Parser test
describe('EmailParser', () => {
  it('should parse email headers', () => {
    const rawEmail = createMockEmail();
    const parsed = parser.parse(rawEmail);
    
    expect(parsed.headers.from).toBeDefined();
    expect(parsed.headers.subject).toBeDefined();
  });
});

// Encryption test
describe('Encryption', () => {
  it('should encrypt and decrypt correctly', () => {
    const data = { password: 'secret' };
    const encrypted = encryptConfig(data);
    const decrypted = decryptConfig(encrypted);
    
    expect(decrypted).toEqual(data);
  });
});
```

---

## Deployment

### Environment Variables

Required environment variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Encryption
EMAIL_ENCRYPTION_KEY=your-256-bit-key

# AI APIs (optional)
GOOGLE_AI_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
OPENAI_API_KEY=your-openai-key

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
```

### Deployment Steps

1. **Database Migration:**
   ```bash
   # Run migration on production database
   supabase db push --linked
   ```

2. **Environment Setup:**
   ```bash
   # Set environment variables in your hosting platform
   # (Vercel, Netlify, AWS, etc.)
   ```

3. **Build Application:**
   ```bash
   npm run build
   ```

4. **Deploy:**
   ```bash
   # Deploy to your hosting platform
   vercel deploy --prod
   # or
   npm run deploy
   ```

### Post-Deployment Checklist

- [ ] Verify database migration completed
- [ ] Test API endpoints
- [ ] Verify encryption/decryption works
- [ ] Test OAuth flows (Gmail, Outlook)
- [ ] Check error logging
- [ ] Monitor performance metrics
- [ ] Test email sending/receiving
- [ ] Verify RLS policies are active

---

## Contributing

### Code Style

Follow the project's TypeScript and ESLint configuration:

```bash
# Lint code
npm run lint

# Format code
npm run format
```

### Pull Request Process

1. **Create Feature Branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes:**
   - Write code
   - Add tests
   - Update documentation

3. **Test:**
   ```bash
   npm test
   npm run lint
   ```

4. **Commit:**
   ```bash
   git commit -m "feat: add new feature"
   ```

5. **Push and Create PR:**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Format

Follow conventional commits:

```
feat: add new feature
fix: fix bug
docs: update documentation
test: add tests
refactor: refactor code
chore: update dependencies
```

---

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [User Guide](./USER_GUIDE.md)
- [Design Document](../.kiro/specs/email-processing-nodes/design.md)
- [Requirements Document](../.kiro/specs/email-processing-nodes/requirements.md)

---

## Support

For development questions:
- Review existing code and tests
- Check documentation
- Ask in developer chat
- Create an issue with details

Happy coding! 🚀
