/**
 * Checks on raw LLM output that both the conversion and the designer need.
 *
 * Lives here rather than on either service because it is pure and shared: the
 * designer used to skip this check simply because it sat inside
 * form-conversion.service, and importing a whole service for one function was
 * the wrong shape.
 */

import { BadRequestException } from '@nestjs/common';

/**
 * Detect a response that ran out of output budget mid-object. Without this the
 * assembler reports the generic "AI output was not valid JSON", which sends the
 * author looking for a problem in their source file when the real cause is that
 * the form is too large for one pass.
 */
export function assertConversionOutputComplete(rawOutput: string): void {
  const trimmed = rawOutput.replace(/```(?:json|JSON)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  if (!trimmed) return; // Empty output is the assembler's error to report.

  const looksLikeJson = trimmed.startsWith('{');
  const endsCleanly = trimmed.endsWith('}');
  if (looksLikeJson && !endsCleanly) {
    throw new BadRequestException(
      'The AI ran out of space before finishing this form, so the result was incomplete and has been discarded. The mock-up is too large to convert in one pass — split it into one file per section and convert them separately.',
    );
  }
}
