/**
 * Calculator Example Class
 *
 * This file demonstrates various types of changes that the diff plugin handles:
 * - Line additions (new methods)
 * - Line deletions (removed code)
 * - Line modifications (changed logic)
 * - Context lines (unchanged surrounding code)
 *
 * Try asking OpenCode to:
 * 1. Add more operations (multiply, divide, power)
 * 2. Add error handling for division by zero
 * 3. Add TypeScript generics for number types
 * 4. Convert to a functional approach
 * 5. Add input validation
 */

class Calculator {
  /**
   * Add two numbers
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtract two numbers
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiply two numbers
   */
  multiply(a: number, b: number): number {
    return a * b;
  }

  /**
   * Divide two numbers
   */
  divide(a: number, b: number): number {
    return a / b;
  }
}

// Export for use in other modules
export default Calculator;
