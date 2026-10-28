import {BadRequestException} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';

/** Location-scoped use cases need the location the user selected (`x-location-id`); without one they answer 400. */
export function requireLocation(userContext: UserContext): string {
  if (!userContext.locationId) {
    throw new BadRequestException('Select a location (x-location-id) first.');
  }
  return userContext.locationId;
}
