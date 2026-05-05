# Email Processing Nodes

This module provides email processing capabilities for the Office Automation Platform, including reading, sending, filtering, and parsing emails across multiple providers (IMAP, Gmail, Outlook).

## TypeScript Configuration

### Module Structure

The email-nodes module has its own TypeScript configuration (`tsconfig.json`) that extends the root configuration with additional strictness and module-specific settings.

### Path Mappings

The following path aliases are available for importing email-nodes modules:

```typescript
// Import types
import { EmailMessage, EmailProviderAdapter } from '@/email-nodes/types';

// Import adapters
import { IMAPAdapter } from '@/email-nodes/adapters/imap-adapter';
import { GmailAdapter } from '@/email-nodes/adapters/gmail-adapter';

// Import utilities
import { parseEmail } from '@/email-nodes/parser';
import { filterEmails } from '@/email-nodes/filter';
import { renderEmail } from '@/email-nodes/template';
```

### Type Checking

The email-nodes module uses strict TypeScript settings:

- **Strict mode enabled**: All strict type checking options are on
- **No implicit any**: All types must be explicitly declared
- **Strict null checks**: Null and undefined are handled explicitly
- **No unused locals/parameters**: Unused variables trigger errors
- **No implicit returns**: All code paths must return a value

### Compilation Settings

- **Target**: ES2020 for modern JavaScript features
- **Module**: ESNext with bundler resolution
- **No emit**: Type checking only (Next.js handles compilation)
- **Declaration files**: Generated for better IDE support

## Directory Structure

```
lib/email-nodes/
├── tsconfig.json           # TypeScript configuration
├── types.ts                # Core type definitions
├── parser.ts               # Email parser (mailparser wrapper)
├── filter.ts               # Email filter engine
├── template.ts             # Template engine (Handlebars wrapper)
├── adapters/
│   ├── index.ts            # Adapter registry
│   ├── imap-adapter.ts     # IMAP/POP3 adapter
│   ├── smtp-adapter.ts     # SMTP adapter
│   └── gmail-adapter.ts    # Gmail API adapter
└── utils/
    └── encryption.ts       # Config encryption utilities
```

## Usage in API Routes

```typescript
// app/api/email/read/route.ts
import { EmailProviderAdapter, FetchOptions } from '@/email-nodes/types';
import { IMAPAdapter } from '@/email-nodes/adapters/imap-adapter';

export async function POST(request: Request) {
  const adapter: EmailProviderAdapter = new IMAPAdapter();
  const options: FetchOptions = { folder: 'INBOX', limit: 50 };
  
  await adapter.connect(config);
  const emails = await adapter.fetchEmails(options);
  await adapter.disconnect();
  
  return Response.json({ emails });
}
```

## Type Safety

All email operations are fully typed:

```typescript
// Type-safe email message
const message: EmailMessage = {
  id: '123',
  provider: 'imap',
  headers: {
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'recipient@example.com' }],
    subject: 'Test Email',
    date: new Date(),
    messageId: '<msg-123@example.com>'
  },
  body: {
    text: 'Plain text content',
    html: '<p>HTML content</p>',
    encoding: 'utf-8',
    charset: 'utf-8'
  },
  attachments: [],
  metadata: {
    receivedAt: new Date()
  },
  flags: {
    seen: false,
    flagged: false,
    answered: false,
    draft: false,
    deleted: false
  }
};
```

## Development

### Type Checking

Run type checking for the email-nodes module:

```bash
cd lib/email-nodes
npx tsc --noEmit
```

Or from the root:

```bash
npm run type-check
```

### Testing

Tests are excluded from the TypeScript compilation but are still type-checked:

```bash
npm test lib/email-nodes
```

## Dependencies

The email-nodes module uses the following external libraries:

- **imapflow**: IMAP client for reading emails
- **nodemailer**: SMTP client for sending emails
- **mailparser**: Email parser for MIME messages
- **handlebars**: Template engine for email templates
- **googleapis**: Gmail API client

All dependencies have TypeScript type definitions installed.
