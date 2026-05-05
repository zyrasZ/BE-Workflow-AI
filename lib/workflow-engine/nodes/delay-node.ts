/**
 * Delay/Wait Node Implementation
 * 
 * Pauses workflow execution for a specified duration.
 * Useful for timing controls and rate limiting.
 * 
 * Requirement 4: Logic Node - Delay/Wait
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Delay Node - Workflow execution pause
 * 
 * Configuration:
 * - duration: Duration value (number or expression)
 * - unit: Time unit ('seconds', 'minutes', 'hours')
 * 
 * Requirement 4: Delay Node SHALL accept a duration value and time unit as configuration
 */
export class DelayNode extends BaseNode {
  readonly type = 'delay';

  /**
   * Time unit multipliers (convert to milliseconds)
   */
  private readonly UNIT_MULTIPLIERS: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
  };

  /**
   * Execute the delay
   * 
   * Requirement 4: Delay Node SHALL pause workflow execution for the specified duration
   * Requirement 4: Delay Node SHALL pass through all input data unchanged to the output
   * Requirement 4: Delay Node SHALL support dynamic duration values from the Execution Context
   * Requirement 4: Delay Node SHALL record the actual delay duration in execution logs
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      const startTime = Date.now();

      // Get duration value (may be expression or number)
      let durationValue: number;
      
      if (typeof config.duration === 'string') {
        // Resolve expression
        const resolved = this.resolveExpression(config.duration, context);
        durationValue = Number(resolved);
      } else {
        durationValue = Number(config.duration);
      }

      // Validate duration is positive
      if (isNaN(durationValue) || durationValue <= 0) {
        return this.failure('Duration must be a positive number');
      }

      // Get time unit
      const unit = config.unit || 'seconds';
      const multiplier = this.UNIT_MULTIPLIERS[unit];

      if (!multiplier) {
        return this.failure(`Invalid time unit: ${unit}`);
      }

      // Calculate delay in milliseconds
      const delayMs = durationValue * multiplier;

      // Pause execution
      await this.sleep(delayMs);

      const endTime = Date.now();
      const actualDelayMs = endTime - startTime;

      // Pass through input data unchanged
      return this.success({
        input: input,
        delayMs: delayMs,
        actualDelayMs: actualDelayMs,
        duration: durationValue,
        unit: unit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Delay execution failed: ${message}`);
    }
  }

  /**
   * Validate delay node configuration
   * 
   * Requirement 4: Delay Node SHALL validate that duration values are positive numbers
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Check required fields
    if (config.duration === undefined || config.duration === null) {
      errors.push({
        field: 'duration',
        message: 'duration is required',
      });
    } else {
      // Validate duration is number or string (expression)
      if (typeof config.duration !== 'number' && typeof config.duration !== 'string') {
        errors.push({
          field: 'duration',
          message: 'duration must be a number or expression string',
        });
      }

      // If it's a number, validate it's positive
      if (typeof config.duration === 'number') {
        if (config.duration <= 0) {
          errors.push({
            field: 'duration',
            message: 'duration must be a positive number',
          });
        }
      }
    }

    // Validate unit
    if (config.unit !== undefined) {
      const validUnits = ['seconds', 'minutes', 'hours'];
      if (!validUnits.includes(config.unit)) {
        errors.push({
          field: 'unit',
          message: `unit must be one of: ${validUnits.join(', ')}`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
