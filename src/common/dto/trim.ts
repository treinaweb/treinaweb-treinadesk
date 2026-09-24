import { Transform } from 'class-transformer';

// Remove espaços nas extremidades antes da validação; não-strings seguem
// intactas para o @IsString rejeitar.
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
