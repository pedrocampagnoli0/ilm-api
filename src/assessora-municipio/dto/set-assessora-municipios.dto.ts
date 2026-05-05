import { ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetAssessoraMunicipiosDto {
  @ApiProperty({ description: 'Replaces the assessora\'s entire município set with these IDs.', type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  municipio_ids!: string[];
}
