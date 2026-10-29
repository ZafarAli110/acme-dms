export interface UserContextResponseDto {
  userId: string;
  locationId: string | null;
  permissions: readonly string[];
}
