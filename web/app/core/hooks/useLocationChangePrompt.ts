import {useEffect} from 'react';
import {useNavigate} from 'react-router';
import {useLocationChangeGuard} from '../contexts/location/LocationChangeGuardContext';
import {locationKernel} from '../kernel/locationKernel';
import {BYPASS_UNSAVED_CHANGES_GUARD} from './useUnsavedChangesGuard';

/**
 * While `isActive`, a location switch is held until the user confirms. On confirm the location changes and the user
 * is taken to `redirectTo` (usually the list), because the form's data belonged to the old location. Use it through
 * `<FormGuards>`.
 */
export function useLocationChangePrompt(isActive: boolean, redirectTo: string) {
  const {registerGuard, pendingLocationId, confirmSwitch, cancelSwitch} = useLocationChangeGuard();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isActive) {
      return;
    }
    return registerGuard();
  }, [isActive, registerGuard]);

  const confirm = () => {
    const locationId = confirmSwitch();
    if (locationId !== null) {
      locationKernel.switchLocation(locationId);
      navigate(redirectTo, {state: BYPASS_UNSAVED_CHANGES_GUARD});
    }
  };

  return {showDialog: pendingLocationId !== null, confirm, cancel: cancelSwitch};
}
