import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CiclosPorMunicipioQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  municipio_id!: string;
}
