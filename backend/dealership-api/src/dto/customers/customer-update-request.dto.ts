import {ApiProperty} from '@nestjs/swagger';
import {IsEmail, IsIn, IsISO8601, IsNotEmpty, IsString, MaxLength, ValidateIf} from 'class-validator';
import type {CustomerStatus} from './customer-response.dto';

export const CUSTOMER_STATUSES: CustomerStatus[] = ['active', 'prospect', 'inactive'];

/**
 * Every field is always sent; a value the customer does not have is `null`, never left out. `ValidateIf` lets a
 * null through but still rejects a missing field (undefined fails the type check).
 */
export class CustomerUpdateRequestDto {
  @ApiProperty({example: 'Grace'})
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public firstName: string;

  @ApiProperty({example: 'Hopper'})
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public surname: string;

  @ApiProperty({type: String, nullable: true, example: 'Hopper Logistics'})
  @ValidateIf((_request, value) => value !== null)
  @IsString()
  @MaxLength(200)
  public companyName: string | null;

  @ApiProperty({type: String, nullable: true, example: 'grace@example.test'})
  @ValidateIf((_request, value) => value !== null)
  @IsEmail()
  @MaxLength(254)
  public email: string | null;

  @ApiProperty({type: String, nullable: true, example: '+44 20 7946 0001'})
  @ValidateIf((_request, value) => value !== null)
  @IsString()
  @MaxLength(40)
  public phone: string | null;

  @ApiProperty({type: String, nullable: true, example: 'Northside'})
  @ValidateIf((_request, value) => value !== null)
  @IsString()
  @MaxLength(100)
  public city: string | null;

  @ApiProperty({enum: CUSTOMER_STATUSES, example: 'active'})
  @IsIn(CUSTOMER_STATUSES)
  public status: CustomerStatus;

  @ApiProperty({type: String, nullable: true, format: 'date', example: '2026-10-21'})
  @ValidateIf((_request, value) => value !== null)
  @IsISO8601({strict: true})
  public lastContactDate: string | null;
}
