/**
 * AI Chat Node Implementation
 * 
 * Sends prompts to AI services (Gemini, Groq, OpenAI) and returns generated responses.
 * Integrates with existing /api/ai/chat endpoint for AI provider abstraction.
 * 
 * Requirement 17: Action Node - AI Chat
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { AIProvider } from '@/lib/ai/adapter';
import { aiRateLimiter } from '@/lib/utils/rateLimit';
import type { AIRequest, AIResponse } from '@/types';

/**
 * AI Chat Node - Call AI services to process text
 * 
 * Configuration:
 * - prompt: Text prompt to send to AI (string or expression)
 * - provider: AI provider selection ('gemini' | 'groq' | 'openai')
 * - temperature: Optional sampling temperature (0-1)
 * - maxTokens: Optional maximum tokens to generate (1-4000)
 * - systemPrompt: Optional system prompt for context
 * 
 * Requirement 17: AI Chat Node SHALL accept a prompt text and AI_Provider selection (Gemini, Groq, OpenAI)
 * Requirement 17: AI Chat Node SHALL accept optional parameters (temperature, max tokens, system prompt)
 */
export class AIChatNode extends BaseNode {
  readonly type = 'ai-chat';

  /**
   * Execute the AI chat logic
   * 
   * Requirement 17: AI Chat Node SHALL send the prompt to the selected AI_Provider
   * Requirement 17: AI Chat Node SHALL use the existing AI integration at /api/ai/chat
   * Requirement 17: AI Chat Node SHALL return the AI-generated response text
   * Requirement 17: AI Chat Node SHALL include token usage statistics in the output
   * Requirement 17: AI Chat Node SHALL enforce rate limiting (20 requests per minute per user)
   * Requirement 17: When the AI service returns an error, AI Chat Node SHALL fail with a descriptive error message
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Enforce rate limiting (20 requests per minute per user)
      const rateLimit = aiRateLimiter.check(context.userId);
      
      if (!rateLimit.allowed) {
        const resetDate = new Date(rateLimit.resetAt);
        return this.failure(
          `Rate limit exceeded. Please try again after ${resetDate.toISOString()}`,
          {
            rateLimitExceeded: true,
            resetAt: resetDate.toISOString(),
            remaining: 0
          }
        );
      }

      // Resolve prompt from configuration (support expressions)
      const prompt = this.resolvePrompt(config.prompt, context);
      
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return this.failure('Prompt must be a non-empty string');
      }

      if (prompt.length > 5000) {
        return this.failure('Prompt is too long (max 5000 characters)');
      }

      // Get provider (default to 'gemini')
      const provider = config.provider || 'gemini';
      
      // Validate provider
      const validProviders = ['gemini', 'groq', 'openai'];
      if (!validProviders.includes(provider)) {
        return this.failure(
          `Invalid provider '${provider}'. Must be one of: ${validProviders.join(', ')}`
        );
      }

      // Resolve optional parameters
      const temperature = config.temperature !== undefined
        ? this.resolveValue(config.temperature, context)
        : undefined;
      
      const maxTokens = config.maxTokens !== undefined
        ? this.resolveValue(config.maxTokens, context)
        : undefined;
      
      const systemPrompt = config.systemPrompt
        ? this.resolvePrompt(config.systemPrompt, context)
        : undefined;

      // Validate temperature
      if (temperature !== undefined) {
        if (typeof temperature !== 'number' || temperature < 0 || temperature > 1) {
          return this.failure('Temperature must be a number between 0 and 1');
        }
      }

      // Validate maxTokens
      if (maxTokens !== undefined) {
        if (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 4000) {
          return this.failure('maxTokens must be a number between 1 and 4000');
        }
      }

      // Build AI request
      const aiRequest: AIRequest = {
        prompt,
        provider: provider as 'gemini' | 'groq' | 'openai',
        temperature,
        maxTokens,
        systemPrompt,
      };

      // Get AI adapter and call
      let adapter;
      try {
        adapter = AIProvider.getAdapter(provider);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to initialize AI adapter: ${message}`);
      }

      // Call AI service
      let result: AIResponse;
      try {
        result = await adapter.call(aiRequest);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        // Handle specific AI provider errors
        if (message.includes('API key')) {
          return this.failure('AI service configuration error. Please contact support.');
        }
        
        if (message.includes('Rate limit exceeded') || 
            message.includes('quota') || 
            message.includes('rate limit')) {
          return this.failure('AI service rate limit exceeded. Please try again later.');
        }
        
        return this.failure(`AI service error: ${message}`);
      }

      // Return success with AI response and metadata
      return this.success({
        response: result.response,
        usage: result.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        metadata: {
          provider,
          model: result.metadata?.model || 'unknown',
          duration: result.metadata?.duration || 0,
          timestamp: new Date().toISOString()
        },
        rateLimit: {
          remaining: rateLimit.remaining,
          resetAt: new Date(rateLimit.resetAt).toISOString()
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Unexpected error in AI chat node: ${message}`);
    }
  }

  /**
   * Validate AI chat node configuration
   * 
   * Requirement 17: AI Chat Node SHALL validate configuration before execution
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate prompt (required)
    if (!config.prompt) {
      errors.push({
        field: 'prompt',
        message: 'prompt is required'
      });
    } else if (typeof config.prompt !== 'string' || config.prompt.trim().length === 0) {
      errors.push({
        field: 'prompt',
        message: 'prompt must be a non-empty string'
      });
    }

    // Validate provider (optional, defaults to 'gemini')
    if (config.provider) {
      const validProviders = ['gemini', 'groq', 'openai'];
      if (!validProviders.includes(config.provider)) {
        errors.push({
          field: 'provider',
          message: `provider must be one of: ${validProviders.join(', ')}`
        });
      }
    }

    // Validate temperature (optional)
    if (config.temperature !== undefined) {
      if (typeof config.temperature !== 'number' || 
          config.temperature < 0 || 
          config.temperature > 1) {
        errors.push({
          field: 'temperature',
          message: 'temperature must be a number between 0 and 1'
        });
      }
    }

    // Validate maxTokens (optional)
    if (config.maxTokens !== undefined) {
      if (typeof config.maxTokens !== 'number' || 
          config.maxTokens < 1 || 
          config.maxTokens > 4000) {
        errors.push({
          field: 'maxTokens',
          message: 'maxTokens must be a number between 1 and 4000'
        });
      }
    }

    // Validate systemPrompt (optional)
    if (config.systemPrompt !== undefined && 
        typeof config.systemPrompt !== 'string') {
      errors.push({
        field: 'systemPrompt',
        message: 'systemPrompt must be a string'
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Resolve prompt from configuration (supports expressions)
   * 
   * @param prompt - Prompt string or expression
   * @param context - Execution context
   * @returns Resolved prompt string
   */
  private resolvePrompt(prompt: string, context: ExecutionContext): string {
    // If prompt contains expression syntax, resolve it
    if (typeof prompt === 'string' && prompt.includes('{{')) {
      return this.resolveExpression(prompt, context);
    }
    return prompt;
  }

  /**
   * Resolve a value from configuration (supports expressions)
   * 
   * @param value - Value or expression
   * @param context - Execution context
   * @returns Resolved value
   */
  private resolveValue(value: any, context: ExecutionContext): any {
    // If value is a string expression, resolve it
    if (typeof value === 'string' && value.includes('{{')) {
      return this.resolveExpression(value, context);
    }
    return value;
  }
}
