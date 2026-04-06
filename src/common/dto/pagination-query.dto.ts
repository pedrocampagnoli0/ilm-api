import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Comma-separated fields to return (dot notation for relations). ' +
      'Example: "id,nome,ciclo.id,ciclo.nome". When omitted, default includes are used.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fields?: string;

  /** Computed after validation — safe to use in services. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** Returns a plain object with skip included (safe for spreading). */
  toPrisma() {
    return { skip: this.skip, take: this.limit };
  }
}
