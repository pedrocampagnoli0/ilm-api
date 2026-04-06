import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'Skip the COUNT query (returns total=-1). Use when you already know the total from a previous request.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skip_count?: boolean;

  /** Computed after validation — safe to use in services. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /** Returns a plain object with skip included (safe for spreading). */
  toPrisma() {
    return { skip: this.skip, take: this.limit };
  }
}
