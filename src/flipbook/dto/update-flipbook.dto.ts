import { PartialType } from '@nestjs/swagger';
import { CreateFlipbookDto } from './create-flipbook.dto.js';

export class UpdateFlipbookDto extends PartialType(CreateFlipbookDto) {}
