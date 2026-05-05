/**
 * AI Classifier Node Implementation
 * 
 * Classifies text into categories using AI services (Gemini, Groq, OpenAI).
 * Integrates with existing /api/ai/chat endpoint for AI provider abstraction.
 * 
 * Requirement 18: Action Node - AI Classifier
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { AIProvider } from '@/lib/ai/adapter';
import { aiRateLimiter } from '@/lib/utils/rateLimit';
import type { AIRequest, AIResponse } from '@/types';

/**
 * AI Classifier Node - Classify text into categories using AI
 * 
 * Configuration:
 * - inputText: Text to classify (string or expression)
 * - categories: Array of category labels (string[] or expression)
 * - provider: AI provider selection ('gemini' | 'groq' | 'openai')
 * - multiLabel: Whether to allow multiple categories (boolean, default: false)
 * - temperature: Optional sampling temperature (0-1)
 * - systemPrompt: Optional system prompt for context
 * 
 * Requirement 18: AI Classifier Node SHALL accept input text and a list of category labels
 * Requirement 18: AI Classifier Node SHALL accept an AI_Provider selection (Gemini, Groq, OpenAI)
 */
export class AIClassifierNode extends BaseNode {
  readonly type = 'ai-classifier';

  /**
   * Execute the AI classification logic
   * 
   * Requirement 18: AI Classifier Node SHALL construct a classification prompt with the input text and categories
   * Requirement 18: AI Classifier Node SHALL send the prompt to the AI_Provider
   * Requirement 18: AI Classifier Node SHALL parse the AI response to extract the selected category
   * Requirement 18: AI Classifier Node SHALL return the classification result with confidence score if available
   * Requirement 18: AI Classifier Node SHALL support multi-label classification where multiple categories can be selected
   * Requirement 18: When the AI response cannot be parsed, AI Classifier Node SHALL return an error
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

      // Resolve input text from configuration (support expressions)
      const inputText = this.resolveValue(config.inputText, context);
      
      if (!inputText || typeof inputText !== 'string' || inputText.trim().length === 0) {
        return this.failure('inputText must be a non-empty string');
      }

      if (inputText.length > 5000) {
        return this.failure('inputText is too long (max 5000 characters)');
      }

      // Resolve categories from configuration (support expressions)
      let categories = this.resolveValue(config.categories, context);
      
      // Ensure categories is an array
      if (!Array.isArray(categories)) {
        return this.failure('categories must be an array');
      }

      if (categories.length === 0) {
        return this.failure('categories array must not be empty');
      }

      if (categories.length > 50) {
        return this.failure('categories array is too large (max 50 categories)');
      }

      // Validate all categories are strings
      if (!categories.every(cat => typeof cat === 'string' && cat.trim().length > 0)) {
        return this.failure('All categories must be non-empty strings');
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

      // Get multi-label flag (default to false)
      const multiLabel = config.multiLabel === true;

      // Resolve optional parameters
      const temperature = config.temperature !== undefined
        ? this.resolveValue(config.temperature, context)
        : 0.1; // Lower temperature for more deterministic classification
      
      const systemPrompt = config.systemPrompt
        ? this.resolveValue(config.systemPrompt, context)
        : undefined;

      // Validate temperature
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 1) {
        return this.failure('temperature must be a number between 0 and 1');
      }

      // Construct classification prompt
      const classificationPrompt = this.buildClassificationPrompt(
        inputText,
        categories,
        multiLabel
      );

      // Build AI request
      const aiRequest: AIRequest = {
        prompt: classificationPrompt,
        provider: provider as 'gemini' | 'groq' | 'openai',
        temperature,
        maxTokens: 500, // Classification responses are typically short
        systemPrompt: systemPrompt || 'You are a text classification assistant. Respond only with the requested JSON format.',
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

      // Parse AI response to extract classification
      const classification = this.parseClassificationResponse(
        result.response,
        categories,
        multiLabel
      );

      if (!classification.success) {
        return this.failure(
          `Failed to parse AI response: ${classification.error}`,
          {
            rawResponse: result.response,
            categories,
            multiLabel
          }
        );
      }

      // Return success with classification result
      return this.success({
        category: classification.category,
        categories: classification.categories,
        confidence: classification.confidence,
        multiLabel,
        rawResponse: result.response,
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
      return this.failure(`Unexpected error in AI classifier node: ${message}`);
    }
  }

  /**
   * Validate AI classifier node configuration
   * 
   * Requirement 18: AI Classifier Node SHALL validate configuration before execution
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate inputText (required)
    if (!config.inputText) {
      errors.push({
        field: 'inputText',
        message: 'inputText is required'
      });
    } else if (typeof config.inputText !== 'string' || config.inputText.trim().length === 0) {
      errors.push({
        field: 'inputText',
        message: 'inputText must be a non-empty string'
      });
    }

    // Validate categories (required)
    if (!config.categories) {
      errors.push({
        field: 'categories',
        message: 'categories is required'
      });
    } else if (!Array.isArray(config.categories)) {
      errors.push({
        field: 'categories',
        message: 'categories must be an array'
      });
    } else if (config.categories.length === 0) {
      errors.push({
        field: 'categories',
        message: 'categories array must not be empty'
      });
    } else if (config.categories.length > 50) {
      errors.push({
        field: 'categories',
        message: 'categories array is too large (max 50 categories)'
      });
    } else if (!config.categories.every((cat: any) => typeof cat === 'string' && cat.trim().length > 0)) {
      errors.push({
        field: 'categories',
        message: 'All categories must be non-empty strings'
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

    // Validate multiLabel (optional)
    if (config.multiLabel !== undefined && typeof config.multiLabel !== 'boolean') {
      errors.push({
        field: 'multiLabel',
        message: 'multiLabel must be a boolean'
      });
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
   * Build classification prompt for AI
   * 
   * @param inputText - Text to classify
   * @param categories - Array of category labels
   * @param multiLabel - Whether to allow multiple categories
   * @returns Formatted prompt string
   */
  private buildClassificationPrompt(
    inputText: string,
    categories: string[],
    multiLabel: boolean
  ): string {
    const categoriesList = categories.map((cat, idx) => `${idx + 1}. ${cat}`).join('\n');
    
    if (multiLabel) {
      return `Classify the following text into one or more of these categories:

${categoriesList}

Text to classify:
"""
${inputText}
"""

Respond ONLY with a JSON object in this exact format:
{
  "categories": ["category1", "category2"],
  "confidence": 0.95
}

Where:
- "categories" is an array of one or more category names from the list above that apply to the text
- "confidence" is a number between 0 and 1 indicating your confidence in the classification

Do not include any explanation or additional text. Only respond with the JSON object.`;
    } else {
      return `Classify the following text into exactly ONE of these categories:

${categoriesList}

Text to classify:
"""
${inputText}
"""

Respond ONLY with a JSON object in this exact format:
{
  "category": "category_name",
  "confidence": 0.95
}

Where:
- "category" is the single most appropriate category name from the list above
- "confidence" is a number between 0 and 1 indicating your confidence in the classification

Do not include any explanation or additional text. Only respond with the JSON object.`;
    }
  }

  /**
   * Parse AI response to extract classification result
   * 
   * @param response - Raw AI response text
   * @param validCategories - Array of valid category labels
   * @param multiLabel - Whether multi-label classification was requested
   * @returns Parsed classification result
   */
  private parseClassificationResponse(
    response: string,
    validCategories: string[],
    multiLabel: boolean
  ): {
    success: boolean;
    category?: string;
    categories?: string[];
    confidence?: number;
    error?: string;
  } {
    try {
      // Try to extract JSON from response (handle cases where AI adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'No JSON object found in AI response'
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (multiLabel) {
        // Multi-label classification
        if (!parsed.categories || !Array.isArray(parsed.categories)) {
          return {
            success: false,
            error: 'Response missing "categories" array'
          };
        }

        if (parsed.categories.length === 0) {
          return {
            success: false,
            error: 'Response contains empty categories array'
          };
        }

        // Validate all categories are in the valid list
        const invalidCategories = parsed.categories.filter(
          (cat: string) => !validCategories.includes(cat)
        );

        if (invalidCategories.length > 0) {
          return {
            success: false,
            error: `Response contains invalid categories: ${invalidCategories.join(', ')}`
          };
        }

        return {
          success: true,
          categories: parsed.categories,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined
        };
      } else {
        // Single-label classification
        if (!parsed.category || typeof parsed.category !== 'string') {
          return {
            success: false,
            error: 'Response missing "category" field'
          };
        }

        // Validate category is in the valid list
        if (!validCategories.includes(parsed.category)) {
          return {
            success: false,
            error: `Response contains invalid category: ${parsed.category}`
          };
        }

        return {
          success: true,
          category: parsed.category,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to parse JSON: ${message}`
      };
    }
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
