/**
 * Node Registry - Auto-registration of all built-in nodes
 * 
 * This module imports and registers all core logic nodes with the node registry.
 * When this module is imported, all nodes are automatically registered and available for use.
 * 
 * Requirement 20: Node Registry SHALL maintain a list of all available node types with their metadata
 */

import { nodeRegistry } from '../registry';

// Import all node classes
import { IfElseNode } from './if-else-node';
import { SwitchNode } from './switch-node';
import { SetVariableNode } from './set-variable-node';
import { CodeNode } from './code-node';
import { DataMapperNode } from './data-mapper-node';
import { LoopNode } from './loop-node';
import { DelayNode } from './delay-node';
import { MergeNode } from './merge-node';
import { SendEmailNode } from './send-email-node';
import { ReadEmailNode } from './read-email-node';
import { EmailFilterNode } from './email-filter-node';
import { EmailTemplateNode } from './email-template-node';
import { AIChatNode } from './ai-chat-node';
import { AIClassifierNode } from './ai-classifier-node';

/**
 * Register all built-in core logic nodes
 * 
 * This function is called automatically when this module is imported.
 * It registers all node types with their metadata.
 * 
 * Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)
 */
function registerCoreNodes(): void {
  // Register If/Else Node
  nodeRegistry.register('if-else', new IfElseNode(), {
    type: 'if-else',
    name: 'If/Else Branch',
    category: 'logic',
    description: 'Route execution based on conditional expressions',
    configSchema: {
      type: 'object',
      required: ['condition'],
      properties: {
        condition: {
          type: 'string',
          description: 'Condition expression to evaluate (e.g., "{{variables.score > 80}}")',
        },
        trueNodeId: {
          type: 'string',
          description: 'Node ID to execute when condition is true',
        },
        falseNodeId: {
          type: 'string',
          description: 'Node ID to execute when condition is false',
        },
      },
    },
    isSystem: true,
  });

  // Register Switch Node
  nodeRegistry.register('switch', new SwitchNode(), {
    type: 'switch',
    name: 'Switch/Router',
    category: 'logic',
    description: 'Route execution to different branches based on data values',
    configSchema: {
      type: 'object',
      required: ['inputPath', 'cases'],
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to extract value from input (e.g., "customer.type")',
        },
        cases: {
          type: 'array',
          description: 'Array of case definitions',
          items: {
            type: 'object',
            required: ['matchType', 'nodeId'],
            properties: {
              matchType: {
                type: 'string',
                enum: ['exact', 'pattern', 'range'],
                description: 'Type of match to perform',
              },
              value: {
                description: 'Value to match (for exact match)',
              },
              pattern: {
                type: 'string',
                description: 'Pattern to match (for pattern match)',
              },
              range: {
                type: 'object',
                description: 'Range definition (for range match)',
                properties: {
                  min: { type: 'number' },
                  max: { type: 'number' },
                },
              },
              nodeId: {
                type: 'string',
                description: 'Node ID to execute when this case matches',
              },
            },
          },
        },
        defaultNodeId: {
          type: 'string',
          description: 'Node ID to execute when no cases match',
        },
      },
    },
    isSystem: true,
  });

  // Register Set Variable Node
  nodeRegistry.register('set-variable', new SetVariableNode(), {
    type: 'set-variable',
    name: 'Set Variable',
    category: 'data',
    description: 'Initialize and assign values to variables',
    configSchema: {
      type: 'object',
      required: ['variableName', 'valueExpression'],
      properties: {
        variableName: {
          type: 'string',
          description: 'Name of the variable to set (alphanumeric and underscore only)',
          pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
        },
        valueExpression: {
          type: 'string',
          description: 'Expression to evaluate for the value (e.g., "{{variables.price * 1.1}}")',
        },
      },
    },
    isSystem: true,
  });

  // Register Code Node
  nodeRegistry.register('code', new CodeNode(), {
    type: 'code',
    name: 'Code/Function',
    category: 'data',
    description: 'Execute custom JavaScript code in a sandboxed environment',
    configSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
          default: 30000,
          minimum: 1,
        },
      },
    },
    isSystem: true,
  });

  // Register Data Mapper Node
  nodeRegistry.register('data-mapper', new DataMapperNode(), {
    type: 'data-mapper',
    name: 'Data Mapper',
    category: 'data',
    description: 'Transform data from one format to another using field mapping rules',
    configSchema: {
      type: 'object',
      required: ['mappings'],
      properties: {
        mappings: {
          type: 'array',
          description: 'Array of field mapping rules',
          items: {
            type: 'object',
            required: ['source', 'target'],
            properties: {
              source: {
                type: 'string',
                description: 'Source field path (e.g., "user.email")',
              },
              target: {
                type: 'string',
                description: 'Target field path (e.g., "contact.emailAddress")',
              },
              transform: {
                type: 'string',
                enum: ['uppercase', 'lowercase', 'trim', 'formatDate'],
                description: 'Optional transformation function',
              },
              defaultValue: {
                description: 'Default value if source is missing',
              },
            },
          },
        },
        inputSchema: {
          type: 'object',
          description: 'Optional input schema definition',
        },
        outputSchema: {
          type: 'object',
          description: 'Optional output schema definition',
        },
      },
    },
    isSystem: true,
  });

  // Register Loop Node
  nodeRegistry.register('loop', new LoopNode(), {
    type: 'loop',
    name: 'Loop/Iterator',
    category: 'logic',
    description: 'Iterate through arrays and process each item',
    configSchema: {
      type: 'object',
      properties: {
        arrayPath: {
          type: 'string',
          description: 'Path to array in input (default: "items")',
          default: 'items',
        },
        subworkflowNodeId: {
          type: 'string',
          description: 'Node ID to execute for each item',
        },
        breakCondition: {
          type: 'string',
          description: 'Optional expression to break early',
        },
        parallel: {
          type: 'boolean',
          description: 'Whether to execute iterations in parallel',
          default: false,
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum number of iterations',
          default: 10000,
          minimum: 1,
        },
        continueOnError: {
          type: 'boolean',
          description: 'Whether to continue on iteration failure',
          default: false,
        },
      },
    },
    isSystem: true,
  });

  // Register Delay Node
  nodeRegistry.register('delay', new DelayNode(), {
    type: 'delay',
    name: 'Delay/Wait',
    category: 'logic',
    description: 'Pause workflow execution for a specified duration',
    configSchema: {
      type: 'object',
      required: ['duration'],
      properties: {
        duration: {
          description: 'Duration value (number or expression)',
        },
        unit: {
          type: 'string',
          enum: ['seconds', 'minutes', 'hours'],
          description: 'Time unit',
          default: 'seconds',
        },
      },
    },
    isSystem: true,
  });

  // Register Merge Node
  nodeRegistry.register('merge', new MergeNode(), {
    type: 'merge',
    name: 'Merge',
    category: 'logic',
    description: 'Combine results from multiple parallel branches',
    configSchema: {
      type: 'object',
      required: ['inputNodeIds'],
      properties: {
        inputNodeIds: {
          type: 'array',
          description: 'Array of node IDs to wait for',
          items: {
            type: 'string',
          },
          minItems: 2,
        },
        strategy: {
          type: 'string',
          enum: ['object', 'array', 'custom'],
          description: 'Merge strategy',
          default: 'object',
        },
        continueOnError: {
          type: 'boolean',
          description: 'Whether to continue if any input branch fails',
          default: false,
        },
      },
    },
    isSystem: true,
  });

  // Register Send Email Node
  nodeRegistry.register('send-email', new SendEmailNode(), {
    type: 'send-email',
    name: 'Send Email',
    category: 'action',
    description: 'Send emails via configured email provider (SMTP/Gmail/Outlook)',
    configSchema: {
      type: 'object',
      required: ['provider', 'config', 'to'],
      properties: {
        provider: {
          type: 'string',
          enum: ['smtp', 'gmail', 'outlook'],
          description: 'Email provider type',
        },
        config: {
          type: 'object',
          description: 'Provider configuration (credentials, host, port, etc.)',
          required: ['provider', 'credentials'],
          properties: {
            provider: {
              type: 'string',
              enum: ['smtp', 'gmail', 'outlook'],
            },
            credentials: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['password', 'oauth2'],
                },
                username: { type: 'string' },
                password: { type: 'string' },
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
              },
            },
            host: { type: 'string', description: 'SMTP host (required for SMTP)' },
            port: { type: 'number', description: 'SMTP port (required for SMTP)' },
            secure: { type: 'boolean', description: 'Use SSL/TLS' },
          },
        },
        to: {
          description: 'Recipient addresses (array of EmailAddress or expression)',
        },
        cc: {
          description: 'CC addresses (optional, array of EmailAddress or expression)',
        },
        bcc: {
          description: 'BCC addresses (optional, array of EmailAddress or expression)',
        },
        subject: {
          type: 'string',
          description: 'Email subject (string or expression)',
        },
        body: {
          description: 'Email body content (object with text/html or expression)',
        },
        attachments: {
          description: 'File attachments (optional, array or expression)',
        },
        template: {
          type: 'object',
          description: 'Email template configuration (optional)',
          properties: {
            subject: { type: 'string', description: 'Template subject with {{variables}}' },
            body: { type: 'string', description: 'Template body with {{variables}}' },
            bodyType: {
              type: 'string',
              enum: ['text', 'html', 'both'],
              description: 'Body type',
              default: 'html',
            },
            data: {
              description: 'Template data for variable substitution',
            },
          },
        },
        inReplyTo: {
          type: 'string',
          description: 'Message ID to reply to (optional)',
        },
        references: {
          type: 'array',
          description: 'Array of message IDs for threading (optional)',
          items: { type: 'string' },
        },
      },
    },
    isSystem: true,
  });

  // Register Read Email Node
  nodeRegistry.register('read-email', new ReadEmailNode(), {
    type: 'read-email',
    name: 'Read Email',
    category: 'action',
    description: 'Fetch emails from configured email provider (IMAP/Gmail/Outlook) with filtering and pagination',
    configSchema: {
      type: 'object',
      required: ['provider', 'config'],
      properties: {
        provider: {
          type: 'string',
          enum: ['imap', 'gmail', 'outlook'],
          description: 'Email provider type',
        },
        config: {
          type: 'object',
          description: 'Provider configuration (credentials, host, port, etc.)',
          required: ['provider', 'credentials'],
          properties: {
            provider: {
              type: 'string',
              enum: ['imap', 'gmail', 'outlook'],
            },
            credentials: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['password', 'oauth2'],
                },
                username: { type: 'string' },
                password: { type: 'string' },
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
              },
            },
            host: { type: 'string', description: 'IMAP host (required for IMAP)' },
            port: { type: 'number', description: 'IMAP port (required for IMAP)' },
            secure: { type: 'boolean', description: 'Use SSL/TLS' },
          },
        },
        folder: {
          type: 'string',
          description: 'Mailbox folder name (default: INBOX)',
          default: 'INBOX',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'Fetch only unread emails',
        },
        dateRange: {
          description: 'Filter by date range (object with start/end or expression)',
        },
        sender: {
          type: 'string',
          description: 'Filter by sender address or pattern (string or regex)',
        },
        subject: {
          type: 'string',
          description: 'Filter by subject pattern (string or regex)',
        },
        hasAttachment: {
          type: 'boolean',
          description: 'Filter emails with attachments',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to retrieve (default: 10, max: 100)',
          default: 10,
          minimum: 1,
          maximum: 100,
        },
        offset: {
          type: 'number',
          description: 'Number of emails to skip for pagination',
          minimum: 0,
        },
      },
    },
    isSystem: true,
  });

  // Register Email Filter Node
  nodeRegistry.register('email-filter', new EmailFilterNode(), {
    type: 'email-filter',
    name: 'Email Filter',
    category: 'action',
    description: 'Filter emails based on criteria (sender, recipient, subject, body, date, read status) with AND/OR logic',
    configSchema: {
      type: 'object',
      required: ['filterConfig'],
      properties: {
        filterConfig: {
          type: 'object',
          description: 'Filter configuration with logic operator and rules',
          required: ['logic', 'rules'],
          properties: {
            logic: {
              type: 'string',
              enum: ['AND', 'OR'],
              description: 'Logic operator for combining rules (AND: all rules must match, OR: at least one rule must match)',
            },
            rules: {
              type: 'array',
              description: 'Array of filter rules',
              minItems: 1,
              items: {
                type: 'object',
                required: ['field', 'operator', 'value'],
                properties: {
                  field: {
                    type: 'string',
                    enum: ['from', 'to', 'subject', 'body', 'date', 'attachment', 'label', 'category', 'flag', 'isUnread'],
                    description: 'Email field to filter on',
                  },
                  operator: {
                    type: 'string',
                    enum: ['equals', 'contains', 'startsWith', 'endsWith', 'matches', 'before', 'after', 'between'],
                    description: 'Comparison operator',
                  },
                  value: {
                    description: 'Value to match against (type depends on field and operator)',
                  },
                },
              },
            },
          },
        },
      },
    },
    inputSchema: {
      type: 'object',
      description: 'Input must contain an array of email objects',
      properties: {
        emails: {
          type: 'array',
          description: 'Array of EmailMessage objects to filter',
          items: {
            type: 'object',
            description: 'EmailMessage object with id, headers, body, attachments, metadata, flags',
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['matched', 'unmatched', 'matchedCount', 'unmatchedCount', 'totalCount', 'timestamp'],
      properties: {
        matched: {
          type: 'array',
          description: 'Array of emails that match the filter criteria',
          items: {
            type: 'object',
            description: 'EmailMessage object',
          },
        },
        unmatched: {
          type: 'array',
          description: 'Array of emails that do not match the filter criteria',
          items: {
            type: 'object',
            description: 'EmailMessage object',
          },
        },
        matchedCount: {
          type: 'number',
          description: 'Number of matched emails',
        },
        unmatchedCount: {
          type: 'number',
          description: 'Number of unmatched emails',
        },
        totalCount: {
          type: 'number',
          description: 'Total number of emails processed',
        },
        timestamp: {
          type: 'string',
          description: 'ISO timestamp of when filtering was performed',
        },
        filterConfig: {
          type: 'object',
          description: 'Summary of filter configuration used',
          properties: {
            logic: {
              type: 'string',
              description: 'Logic operator used (AND or OR)',
            },
            ruleCount: {
              type: 'number',
              description: 'Number of rules applied',
            },
          },
        },
      },
    },
    isSystem: true,
  });

  // Register Email Template Node
  nodeRegistry.register('email-template', new EmailTemplateNode(), {
    type: 'email-template',
    name: 'Email Template',
    category: 'action',
    description: 'Render email templates with dynamic data using Handlebars template engine',
    configSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'Template identifier to load from database (optional, mutually exclusive with template)',
        },
        template: {
          type: 'object',
          description: 'Inline template definition (optional, mutually exclusive with templateId)',
          required: ['subject', 'body', 'bodyType'],
          properties: {
            subject: {
              type: 'string',
              description: 'Template subject with {{variables}}',
            },
            body: {
              type: 'string',
              description: 'Template body with {{variables}}',
            },
            bodyType: {
              type: 'string',
              enum: ['text', 'html', 'both'],
              description: 'Body type',
              default: 'html',
            },
          },
        },
        data: {
          type: 'object',
          description: 'Data object with variable values (optional, uses context if not provided)',
        },
        failOnMissingVariable: {
          type: 'boolean',
          description: 'Whether to fail when a variable is missing (default: false)',
          default: false,
        },
      },
      oneOf: [
        { required: ['templateId'] },
        { required: ['template'] },
      ],
    },
    inputSchema: {
      type: 'object',
      description: 'Input data from previous nodes (accessible via expressions)',
    },
    outputSchema: {
      type: 'object',
      required: ['subject', 'bodyType', 'timestamp'],
      properties: {
        subject: {
          type: 'string',
          description: 'Rendered email subject',
        },
        text: {
          type: 'string',
          description: 'Rendered plain text body (if bodyType is text or both)',
        },
        html: {
          type: 'string',
          description: 'Rendered HTML body (if bodyType is html or both)',
        },
        bodyType: {
          type: 'string',
          enum: ['text', 'html', 'both'],
          description: 'Body type of the rendered template',
        },
        timestamp: {
          type: 'string',
          description: 'ISO timestamp of when template was rendered',
        },
        templateId: {
          type: 'string',
          description: 'Template ID if loaded from database',
        },
        variablesUsed: {
          type: 'array',
          description: 'List of variable names used in rendering',
          items: {
            type: 'string',
          },
        },
      },
    },
    isSystem: true,
  });

  // Register AI Chat Node
  nodeRegistry.register('ai-chat', new AIChatNode(), {
    type: 'ai-chat',
    name: 'AI Chat',
    category: 'action',
    description: 'Call AI services (Gemini, Groq, OpenAI) to process text and generate responses',
    configSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: {
          type: 'string',
          description: 'Text prompt to send to AI (string or expression with {{variables}})',
        },
        provider: {
          type: 'string',
          enum: ['gemini', 'groq', 'openai'],
          description: 'AI provider selection (default: gemini)',
          default: 'gemini',
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-1, default: provider default)',
          minimum: 0,
          maximum: 1,
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens to generate (1-4000)',
          minimum: 1,
          maximum: 4000,
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional system prompt for context',
        },
      },
    },
    inputSchema: {
      type: 'object',
      description: 'Input data from previous nodes (accessible via expressions)',
    },
    outputSchema: {
      type: 'object',
      required: ['response', 'usage', 'metadata', 'rateLimit'],
      properties: {
        response: {
          type: 'string',
          description: 'AI-generated response text',
        },
        usage: {
          type: 'object',
          description: 'Token usage statistics',
          properties: {
            prompt_tokens: { type: 'number' },
            completion_tokens: { type: 'number' },
            total_tokens: { type: 'number' },
          },
        },
        metadata: {
          type: 'object',
          description: 'Response metadata',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            duration: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        rateLimit: {
          type: 'object',
          description: 'Rate limit information',
          properties: {
            remaining: { type: 'number' },
            resetAt: { type: 'string' },
          },
        },
      },
    },
    isSystem: true,
  });

  // Register AI Classifier Node
  nodeRegistry.register('ai-classifier', new AIClassifierNode(), {
    type: 'ai-classifier',
    name: 'AI Classifier',
    category: 'action',
    description: 'Classify text into categories using AI services (Gemini, Groq, OpenAI)',
    configSchema: {
      type: 'object',
      required: ['inputText', 'categories'],
      properties: {
        inputText: {
          type: 'string',
          description: 'Text to classify (string or expression with {{variables}})',
        },
        categories: {
          type: 'array',
          description: 'Array of category labels',
          items: {
            type: 'string',
          },
          minItems: 1,
          maxItems: 50,
        },
        provider: {
          type: 'string',
          enum: ['gemini', 'groq', 'openai'],
          description: 'AI provider selection (default: gemini)',
          default: 'gemini',
        },
        multiLabel: {
          type: 'boolean',
          description: 'Allow multiple categories to be selected (default: false)',
          default: false,
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-1, default: 0.1 for deterministic classification)',
          minimum: 0,
          maximum: 1,
          default: 0.1,
        },
        systemPrompt: {
          type: 'string',
          description: 'Optional system prompt for context',
        },
      },
    },
    inputSchema: {
      type: 'object',
      description: 'Input data from previous nodes (accessible via expressions)',
    },
    outputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Selected category (single-label classification)',
        },
        categories: {
          type: 'array',
          description: 'Selected categories (multi-label classification)',
          items: {
            type: 'string',
          },
        },
        confidence: {
          type: 'number',
          description: 'Confidence score (0-1) if provided by AI',
        },
        multiLabel: {
          type: 'boolean',
          description: 'Whether multi-label classification was used',
        },
        rawResponse: {
          type: 'string',
          description: 'Raw AI response text',
        },
        usage: {
          type: 'object',
          description: 'Token usage statistics',
          properties: {
            prompt_tokens: { type: 'number' },
            completion_tokens: { type: 'number' },
            total_tokens: { type: 'number' },
          },
        },
        metadata: {
          type: 'object',
          description: 'Response metadata',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            duration: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        rateLimit: {
          type: 'object',
          description: 'Rate limit information',
          properties: {
            remaining: { type: 'number' },
            resetAt: { type: 'string' },
          },
        },
      },
    },
    isSystem: true,
  });
}

// Auto-register all nodes when this module is imported
registerCoreNodes();

// Export node classes for direct use if needed
export {
  IfElseNode,
  SwitchNode,
  SetVariableNode,
  CodeNode,
  DataMapperNode,
  LoopNode,
  DelayNode,
  MergeNode,
  SendEmailNode,
  ReadEmailNode,
  EmailFilterNode,
  EmailTemplateNode,
  AIChatNode,
  AIClassifierNode,
};
