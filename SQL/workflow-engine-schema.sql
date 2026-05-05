-- Workflow Engine Database Schema
-- 
-- This migration adds tables for the workflow automation system:
-- - node_types: Registry of available node types with schemas
-- - trigger_configs: Trigger configurations for workflows
-- - execution_logs: Detailed logs of node executions
-- 
-- Requirements: 20 (Node Registry), 22 (Trigger Manager), 24 (Execution History)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- node_types: Registry of available node types
-- ============================================================================
-- 
-- Requirement 20: Node Registry SHALL store node metadata
-- Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)

CREATE TABLE IF NOT EXISTS node_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Node type identifier (unique, used in workflow definitions)
  type TEXT UNIQUE NOT NULL,
  
  -- Human-readable node name
  name TEXT NOT NULL,
  
  -- Node category for organization
  -- 'logic': Control flow nodes (if-else, switch, loop)
  -- 'data': Data transformation nodes (set variable, code, mapper)
  -- 'trigger': Workflow trigger nodes
  -- 'action': Action nodes (email, AI, HTTP)
  category TEXT NOT NULL CHECK (category IN ('logic', 'data', 'trigger', 'action')),
  
  -- Node description
  description TEXT,
  
  -- JSON Schema for node configuration
  -- Defines what configuration options the node accepts
  config_schema JSONB NOT NULL DEFAULT '{}',
  
  -- JSON Schema for node input
  -- Defines what input data the node expects
  input_schema JSONB,
  
  -- JSON Schema for node output
  -- Defines what output data the node produces
  output_schema JSONB,
  
  -- Whether this is a system node (built-in) or custom node
  is_system BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for node_types
CREATE INDEX IF NOT EXISTS idx_node_types_category ON node_types(category);
CREATE INDEX IF NOT EXISTS idx_node_types_is_system ON node_types(is_system);

-- ============================================================================
-- trigger_configs: Trigger configurations for workflows
-- ============================================================================
-- 
-- Requirement 22: Trigger Manager SHALL maintain a registry of all active triggers

CREATE TABLE IF NOT EXISTS trigger_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Workflow this trigger belongs to
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Trigger type
  -- 'manual': User-initiated execution
  -- 'schedule': Cron-based scheduling
  -- 'email': Email arrival trigger
  -- 'webhook': HTTP webhook trigger
  type TEXT NOT NULL CHECK (type IN ('manual', 'schedule', 'email', 'webhook')),
  
  -- Trigger-specific configuration
  -- For 'schedule': { cronExpression: string, timezone?: string }
  -- For 'email': { emailAccountId: string, filters: EmailFilterRules }
  -- For 'webhook': { secret?: string, authType?: 'none' | 'apiKey' | 'signature' }
  -- For 'manual': {} (no config needed)
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Whether the trigger is currently active
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamp of last trigger activation
  last_triggered_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for trigger_configs
CREATE INDEX IF NOT EXISTS idx_trigger_configs_workflow ON trigger_configs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_trigger_configs_type ON trigger_configs(type);
CREATE INDEX IF NOT EXISTS idx_trigger_configs_is_active ON trigger_configs(is_active);

-- ============================================================================
-- execution_logs: Detailed logs of node executions
-- ============================================================================
-- 
-- Requirement 24: System SHALL store individual node execution results and timings

CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Execution this log belongs to
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  
  -- Node ID that was executed (from workflow definition)
  node_id TEXT NOT NULL,
  
  -- Node type
  node_type TEXT NOT NULL,
  
  -- Node execution status
  -- 'running': Node is currently executing
  -- 'completed': Node completed successfully
  -- 'failed': Node execution failed
  -- 'skipped': Node was skipped due to error handling
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  
  -- Input data received by the node
  input JSONB,
  
  -- Output data produced by the node
  output JSONB,
  
  -- Error message if node failed
  error TEXT,
  
  -- Execution duration in milliseconds
  duration_ms INTEGER,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for execution_logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution ON execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_node ON execution_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_status ON execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_execution_logs_started_at ON execution_logs(started_at DESC);

-- ============================================================================
-- Insert built-in node types
-- ============================================================================
-- 
-- Requirement 20: Node Registry SHALL maintain a list of all available node types

-- Logic Nodes
INSERT INTO node_types (type, name, category, description, config_schema, is_system) VALUES
(
  'if-else',
  'If/Else Branch',
  'logic',
  'Route execution based on a condition expression',
  '{
    "type": "object",
    "required": ["condition"],
    "properties": {
      "condition": {
        "type": "string",
        "description": "Condition expression to evaluate (e.g., {{variables.score > 80}})"
      }
    }
  }',
  true
),
(
  'switch',
  'Switch/Router',
  'logic',
  'Route execution to different branches based on data values',
  '{
    "type": "object",
    "required": ["inputField", "cases"],
    "properties": {
      "inputField": {
        "type": "string",
        "description": "Field path to extract value from (e.g., variables.type)"
      },
      "cases": {
        "type": "array",
        "description": "Array of case definitions",
        "items": {
          "type": "object",
          "required": ["condition", "value"],
          "properties": {
            "condition": {
              "type": "string",
              "enum": ["equals", "contains", "startsWith", "endsWith", "regex"],
              "description": "Comparison operator"
            },
            "value": {
              "description": "Value to compare against"
            }
          }
        }
      },
      "defaultCase": {
        "type": "boolean",
        "description": "Whether to include a default case"
      }
    }
  }',
  true
),
(
  'loop',
  'Loop/Iterator',
  'logic',
  'Iterate through an array and process each item',
  '{
    "type": "object",
    "required": ["arrayPath"],
    "properties": {
      "arrayPath": {
        "type": "string",
        "description": "Path to array in context (e.g., variables.items)"
      },
      "parallel": {
        "type": "boolean",
        "description": "Execute iterations in parallel",
        "default": false
      },
      "breakCondition": {
        "type": "string",
        "description": "Optional condition to break loop early"
      }
    }
  }',
  true
),
(
  'delay',
  'Delay/Wait',
  'logic',
  'Pause workflow execution for a specified duration',
  '{
    "type": "object",
    "required": ["duration", "unit"],
    "properties": {
      "duration": {
        "type": "number",
        "description": "Duration value",
        "minimum": 0
      },
      "unit": {
        "type": "string",
        "enum": ["seconds", "minutes", "hours"],
        "description": "Time unit"
      }
    }
  }',
  true
),
(
  'merge',
  'Merge',
  'logic',
  'Combine results from multiple parallel branches',
  '{
    "type": "object",
    "properties": {
      "strategy": {
        "type": "string",
        "enum": ["object", "array", "custom"],
        "description": "Merge strategy",
        "default": "object"
      }
    }
  }',
  true
);

-- Data Transformation Nodes
INSERT INTO node_types (type, name, category, description, config_schema, is_system) VALUES
(
  'set-variable',
  'Set Variable',
  'data',
  'Initialize or assign values to variables',
  '{
    "type": "object",
    "required": ["variableName", "value"],
    "properties": {
      "variableName": {
        "type": "string",
        "description": "Variable name (alphanumeric and underscore only)",
        "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$"
      },
      "value": {
        "description": "Value expression to assign"
      }
    }
  }',
  true
),
(
  'code',
  'Code/Function',
  'data',
  'Execute custom JavaScript code',
  '{
    "type": "object",
    "required": ["code"],
    "properties": {
      "code": {
        "type": "string",
        "description": "JavaScript code to execute"
      },
      "timeout": {
        "type": "number",
        "description": "Timeout in milliseconds",
        "default": 30000,
        "minimum": 1000,
        "maximum": 300000
      }
    }
  }',
  true
),
(
  'data-mapper',
  'Data Mapper',
  'data',
  'Transform data from one format to another',
  '{
    "type": "object",
    "required": ["mappings"],
    "properties": {
      "mappings": {
        "type": "array",
        "description": "Array of field mapping rules",
        "items": {
          "type": "object",
          "required": ["source", "target"],
          "properties": {
            "source": {
              "type": "string",
              "description": "Source field path"
            },
            "target": {
              "type": "string",
              "description": "Target field path"
            },
            "transform": {
              "type": "string",
              "enum": ["uppercase", "lowercase", "trim", "formatDate"],
              "description": "Optional transformation function"
            },
            "defaultValue": {
              "description": "Default value if source is missing"
            }
          }
        }
      }
    }
  }',
  true
);

-- Action Nodes
INSERT INTO node_types (type, name, category, description, config_schema, is_system) VALUES
(
  'send-email',
  'Send Email',
  'action',
  'Send an email via SMTP',
  '{
    "type": "object",
    "required": ["emailAccountId", "to", "subject", "body"],
    "properties": {
      "emailAccountId": {
        "type": "string",
        "description": "Email account ID for SMTP connection"
      },
      "to": {
        "type": "string",
        "description": "Recipient email address(es)"
      },
      "cc": {
        "type": "string",
        "description": "CC email address(es)"
      },
      "bcc": {
        "type": "string",
        "description": "BCC email address(es)"
      },
      "subject": {
        "type": "string",
        "description": "Email subject"
      },
      "body": {
        "type": "string",
        "description": "Email body (HTML or plain text)"
      },
      "format": {
        "type": "string",
        "enum": ["text", "html"],
        "description": "Email format",
        "default": "html"
      }
    }
  }',
  true
),
(
  'read-email',
  'Read Email',
  'action',
  'Read emails from a mailbox via IMAP',
  '{
    "type": "object",
    "required": ["emailAccountId"],
    "properties": {
      "emailAccountId": {
        "type": "string",
        "description": "Email account ID for IMAP connection"
      },
      "folder": {
        "type": "string",
        "description": "Mailbox folder name",
        "default": "INBOX"
      },
      "unreadOnly": {
        "type": "boolean",
        "description": "Only fetch unread emails",
        "default": true
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of emails to retrieve",
        "default": 10,
        "minimum": 1,
        "maximum": 100
      }
    }
  }',
  true
),
(
  'ai-chat',
  'AI Chat',
  'action',
  'Call AI service to process text',
  '{
    "type": "object",
    "required": ["prompt", "provider"],
    "properties": {
      "prompt": {
        "type": "string",
        "description": "Prompt text to send to AI"
      },
      "provider": {
        "type": "string",
        "enum": ["gemini", "groq", "openai"],
        "description": "AI provider to use"
      },
      "temperature": {
        "type": "number",
        "description": "Temperature parameter",
        "minimum": 0,
        "maximum": 2,
        "default": 0.7
      },
      "maxTokens": {
        "type": "number",
        "description": "Maximum tokens to generate",
        "minimum": 1,
        "maximum": 4096,
        "default": 1000
      },
      "systemPrompt": {
        "type": "string",
        "description": "Optional system prompt"
      }
    }
  }',
  true
),
(
  'email-filter',
  'Email Filter',
  'action',
  'Filter emails based on criteria',
  '{
    "type": "object",
    "required": ["rules"],
    "properties": {
      "logicOperator": {
        "type": "string",
        "enum": ["AND", "OR"],
        "description": "Logic operator for combining rules",
        "default": "AND"
      },
      "rules": {
        "type": "array",
        "description": "Array of filter rules",
        "items": {
          "type": "object",
          "required": ["field", "operator", "value"],
          "properties": {
            "field": {
              "type": "string",
              "enum": ["from", "to", "subject", "body", "date"],
              "description": "Field to filter on"
            },
            "operator": {
              "type": "string",
              "enum": ["equals", "contains", "startsWith", "endsWith", "regex"],
              "description": "Comparison operator"
            },
            "value": {
              "description": "Value to compare against"
            }
          }
        }
      }
    }
  }',
  true
),
(
  'email-template',
  'Email Template',
  'action',
  'Render email template with variable substitution',
  '{
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "Template ID to load from database"
      },
      "inlineTemplate": {
        "type": "object",
        "description": "Inline template definition",
        "properties": {
          "subject": {
            "type": "string",
            "description": "Subject template"
          },
          "body": {
            "type": "string",
            "description": "Body template"
          }
        }
      },
      "data": {
        "type": "object",
        "description": "Data object with variable values"
      }
    }
  }',
  true
);

-- ============================================================================
-- Update trigger for updated_at timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_node_types_updated_at
  BEFORE UPDATE ON node_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trigger_configs_updated_at
  BEFORE UPDATE ON trigger_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE node_types IS 'Registry of available node types with their schemas';
COMMENT ON TABLE trigger_configs IS 'Trigger configurations for workflows';
COMMENT ON TABLE execution_logs IS 'Detailed logs of node executions';

COMMENT ON COLUMN node_types.type IS 'Unique node type identifier used in workflow definitions';
COMMENT ON COLUMN node_types.category IS 'Node category: logic, data, trigger, or action';
COMMENT ON COLUMN node_types.config_schema IS 'JSON Schema defining node configuration options';
COMMENT ON COLUMN node_types.input_schema IS 'JSON Schema defining expected input data';
COMMENT ON COLUMN node_types.output_schema IS 'JSON Schema defining produced output data';

COMMENT ON COLUMN trigger_configs.type IS 'Trigger type: manual, schedule, email, or webhook';
COMMENT ON COLUMN trigger_configs.config IS 'Trigger-specific configuration (cron expression, email filters, etc.)';
COMMENT ON COLUMN trigger_configs.is_active IS 'Whether the trigger is currently monitoring for events';

COMMENT ON COLUMN execution_logs.node_id IS 'Node ID from workflow definition (not a foreign key)';
COMMENT ON COLUMN execution_logs.status IS 'Node execution status: running, completed, failed, or skipped';
COMMENT ON COLUMN execution_logs.duration_ms IS 'Execution duration in milliseconds';
