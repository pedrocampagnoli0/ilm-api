import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReuniaoPessoaInputDto } from './create-reuniao.dto.js';

export class UpdateReuniaoDto {
  @ApiPropertyOptional({
    description:
      'Reassign the meeting to another município. Null clears it (only valid for tipo=generica).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.municipio_id !== null)
  @IsUUID()
  municipio_id?: string | null;

  @ApiPropertyOptional({ enum: ['1:1-professor', 'gestao', 'generica'] })
  @IsOptional()
  @IsEnum(['1:1-professor', 'gestao', 'generica'])
  tipo?: '1:1-professor' | 'gestao' | 'generica';

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  inicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(720)
  duracao_min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aconteceu?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cancelada?: boolean;

  @ApiPropertyOptional({ type: [ReuniaoPessoaInputDto], description: 'Replaces existing pessoas if provided' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReuniaoPessoaInputDto)
  pessoas?: ReuniaoPessoaInputDto[];
}

export class UpdateReuniaoQueryDto {
  @ApiPropertyOptional({ enum: ['this', 'series'], default: 'this' })
  @IsOptional()
  @IsEnum(['this', 'series'])
  scope?: 'this' | 'series';
}
