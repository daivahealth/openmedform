import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of `POST /api/conversions/from-prompt`.
 *
 * Deliberately the same field names the synchronous `POST /api/forms/from-prompt`
 * accepts, so the two routes stay swappable from a caller's point of view.
 *
 * The prompt is capped because it is forwarded to the model: an unbounded
 * description is an unbounded bill, and the whole conversion prompt has to fit
 * the context alongside it.
 */
export class StartFromPromptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;
}
