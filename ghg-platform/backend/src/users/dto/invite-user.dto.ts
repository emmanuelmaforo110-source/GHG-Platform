import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  // verifier = external auditor with read-only access to data, evidence, audit log and exports
  @IsIn(['admin', 'data_entry', 'management', 'verifier'])
  role: 'admin' | 'data_entry' | 'management' | 'verifier';

  @IsOptional()
  @IsUUID()
  restrictedFacilityId?: string;

  @IsString()
  @MinLength(8, { message: 'The temporary password must be at least 8 characters.' })
  temporaryPassword: string;
}
