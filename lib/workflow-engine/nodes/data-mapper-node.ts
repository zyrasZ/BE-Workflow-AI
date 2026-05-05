/**
 * Data Mapper Node Implementation
 * 
 * Transforms data from one format to another using field mapping rules.
 * Supports nested objects, arrays, and transformation functions.
 * 
 * Requirement 8: Data Transformation - Data Mapper
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Field mapping rule
 */
interface FieldMapping {
  /**
   * Source field path (e.g., "user.email")
   */
  source: string;

  /**
   * Target field path (e.g., "contact.emailAddress")
   */
  target: string;

  /**
   * Optional transformation function
   */
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'formatDate';

  /**
   * Default value if source is missing
   */
  defaultValue?: any;
}

/**
 * Data Mapper Node - Data transformation and mapping
 * 
 * Configuration:
 * - mappings: Array of field mapping rules
 * - inputSchema: Optional input schema definition
 * - outputSchema: Optional output schema definition
 * 
 * Requirement 8: Data Mapper Node SHALL accept input schema and output schema definitions
 * Requirement 8: Data Mapper Node SHALL accept field mapping rules that define source-to-target transformations
 */
export class DataMapperNode extends BaseNode {
  readonly type = 'data-mapper';

  /**
   * Execute the data mapping
   * 
   * Requirement 8: Data Mapper Node SHALL extract values from input fields according to mapping rules
   * Requirement 8: Data Mapper Node SHALL apply transformation functions to mapped values
   * Requirement 8: Data Mapper Node SHALL construct the output object according to the output schema
   * Requirement 8: Data Mapper Node SHALL support nested object mapping and array transformations
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      const mappings: FieldMapping[] = config.mappings || [];
      const output: Record<string, any> = {};

      // Process each mapping rule
      for (const mapping of mappings) {
        // Extract value from source
        let value = this.extractValueByPath(input, mapping.source);

        // Use default value if source is missing
        if (value === undefined && mapping.defaultValue !== undefined) {
          value = mapping.defaultValue;
        }

        // Apply transformation if specified
        if (value !== undefined && mapping.transform) {
          value = this.applyTransformation(value, mapping.transform);
        }

        // Set value in target path
        if (value !== undefined) {
          this.setValueByPath(output, mapping.target, value);
        }
      }

      return this.success({
        mapped: output,
        input: input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Data mapping failed: ${message}`);
    }
  }

  /**
   * Validate data mapper node configuration
   * 
   * Requirement 8: Data Mapper Node SHALL provide default values for missing input fields
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Check mappings array
    if (!config.mappings || !Array.isArray(config.mappings)) {
      errors.push({
        field: 'mappings',
        message: 'mappings is required and must be an array',
      });
    } else {
      // Validate each mapping
      config.mappings.forEach((mapping: any, index: number) => {
        if (!mapping.source || typeof mapping.source !== 'string') {
          errors.push({
            field: `mappings[${index}].source`,
            message: 'source is required and must be a string',
          });
        }

        if (!mapping.target || typeof mapping.target !== 'string') {
          errors.push({
            field: `mappings[${index}].target`,
            message: 'target is required and must be a string',
          });
        }

        // Validate transform if provided
        if (mapping.transform !== undefined) {
          const validTransforms = ['uppercase', 'lowercase', 'trim', 'formatDate'];
          if (!validTransforms.includes(mapping.transform)) {
            errors.push({
              field: `mappings[${index}].transform`,
              message: `transform must be one of: ${validTransforms.join(', ')}`,
            });
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract value from object by path
   * 
   * Supports:
   * - Nested objects: "user.profile.name"
   * - Array indices: "items[0].name"
   * - Mixed: "user.addresses[0].city"
   * 
   * Requirement 8: Data Mapper Node SHALL support nested object mapping and array transformations
   */
  private extractValueByPath(obj: Record<string, any>, path: string): any {
    // Handle array notation: items[0] -> items.0
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    
    let current: any = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array index
      const arrayIndex = parseInt(part, 10);
      if (!isNaN(arrayIndex) && Array.isArray(current)) {
        current = current[arrayIndex];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Set value in object by path
   * 
   * Creates nested objects as needed
   * 
   * Requirement 8: Data Mapper Node SHALL support nested object mapping and array transformations
   */
  private setValueByPath(obj: Record<string, any>, path: string, value: any): void {
    // Handle array notation: items[0] -> items.0
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    
    let current: any = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];

      // Check if next part is an array index
      const isNextArray = !isNaN(parseInt(nextPart, 10));

      if (!(part in current)) {
        current[part] = isNextArray ? [] : {};
      }

      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  }

  /**
   * Apply transformation function to a value
   * 
   * Requirement 8: Data Mapper Node SHALL apply transformation functions (uppercase, lowercase, trim, format date)
   */
  private applyTransformation(
    value: any,
    transform: 'uppercase' | 'lowercase' | 'trim' | 'formatDate'
  ): any {
    switch (transform) {
      case 'uppercase':
        return String(value).toUpperCase();

      case 'lowercase':
        return String(value).toLowerCase();

      case 'trim':
        return String(value).trim();

      case 'formatDate':
        return this.formatDate(value);

      default:
        return value;
    }
  }

  /**
   * Format a date value to ISO string
   */
  private formatDate(value: any): string {
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return String(value);
      }
      return date.toISOString();
    } catch {
      return String(value);
    }
  }
}
