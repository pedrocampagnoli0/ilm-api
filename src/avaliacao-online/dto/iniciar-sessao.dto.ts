import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IniciarSessaoDto {
  @ApiProperty()
  @IsUUID()
  avaliacao_id!: string;

  @ApiProperty()
  @IsUUID()
  aluno_id!: string;
}
