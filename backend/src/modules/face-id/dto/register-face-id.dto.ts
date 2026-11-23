import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
} from 'class-validator';

export class RegisterFaceIdDto {
  @IsArray({ message: 'descriptor must be an array' })
  @ArrayMinSize(128, { message: 'descriptor must contain exactly 128 numbers' })
  @ArrayMaxSize(128, { message: 'descriptor must contain exactly 128 numbers' })
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { each: true, message: 'Each descriptor element must be a finite number' },
  )
  descriptor!: number[];
}
