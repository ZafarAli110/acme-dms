import DarkModeIcon from '@mui/icons-material/DarkMode';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import PlaceIcon from '@mui/icons-material/Place';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {useColorScheme} from '@mui/material/styles';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Form} from 'react-router';
import {useAuth} from '../core/contexts/auth/useAuth';
import {useLocationChangeGuard} from '../core/contexts/location/LocationChangeGuardContext';
import {useSelectedLocation} from '../core/contexts/location/useSelectedLocation';
import {formatRole} from '../core/formatters/formatRole';
import {LanguageSwitcher} from './LanguageSwitcher';
import {APPBAR_HEIGHT, TRANSITION} from './Sidebar';

export function TopBar({sidebarWidth}: {sidebarWidth: number}) {
  const {t} = useTranslation();
  const {user} = useAuth();
  const {location, locations, switchLocation} = useSelectedLocation();
  const {requestSwitch} = useLocationChangeGuard();
  const {mode, systemMode, setMode} = useColorScheme();
  const [locationAnchor, setLocationAnchor] = useState<HTMLElement | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const dark = (mode === 'system' ? systemMode : mode) === 'dark';
  const initials = (user?.displayName ?? '?')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppBar
      position="fixed"
      sx={{
        width: `calc(100% - ${sidebarWidth}px)`,
        ml: `${sidebarWidth}px`,
        height: APPBAR_HEIGHT,
        justifyContent: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        transition: `width ${TRANSITION}, margin-left ${TRANSITION}`,
      }}
    >
      <Toolbar sx={{gap: 1}}>
        <Typography variant="subtitle1" sx={{fontWeight: 600}} noWrap>
          {user?.dealerName}
        </Typography>
        {/* A real dropdown when there is a choice (outlined, a chevron, a menu); just the name when there is not. */}
        {location && locations.length > 1 && (
          <Button
            color="inherit"
            startIcon={<PlaceIcon fontSize="small" />}
            endIcon={<ExpandMoreIcon />}
            onClick={(event) => setLocationAnchor(event.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={locationAnchor !== null}
            sx={{
              ml: 1.5,
              px: 1.5,
              height: 36,
              minWidth: 160,
              justifyContent: 'space-between',
              border: '1px solid rgba(255, 255, 255, 0.45)',
              borderRadius: 1.5,
              fontWeight: 500,
              '&:hover': {bgcolor: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.8)'},
            }}
            data-testid="location-switcher"
          >
            <Box component="span" sx={{flexGrow: 1, textAlign: 'left'}}>
              {location.name}
            </Box>
          </Button>
        )}
        {location && locations.length < 2 && (
          <Box
            sx={{display: 'flex', alignItems: 'center', gap: 0.75, ml: 1.5, opacity: 0.9}}
            data-testid="location-switcher"
          >
            <PlaceIcon fontSize="small" />
            <Typography variant="body2" sx={{fontWeight: 500}}>
              {location.name}
            </Typography>
          </Box>
        )}
        <Menu
          anchorEl={locationAnchor}
          open={locationAnchor !== null}
          onClose={() => setLocationAnchor(null)}
          anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
          transformOrigin={{vertical: 'top', horizontal: 'left'}}
          slotProps={{paper: {sx: {mt: 0.5, minWidth: 200}}}}
        >
          {locations.map((candidate) => (
            <MenuItem
              key={candidate.id}
              selected={candidate.id === location?.id}
              onClick={() => {
                setLocationAnchor(null);
                // A form with unsaved changes holds the switch and asks first (see <FormGuards>).
                if (candidate.id !== location?.id && requestSwitch(candidate.id)) {
                  switchLocation(candidate.id);
                }
              }}
              data-testid="location-option"
            >
              <ListItemText primary={candidate.name} secondary={formatRole(t, candidate.role)} />
            </MenuItem>
          ))}
        </Menu>

        <Box sx={{flexGrow: 1}} />

        <LanguageSwitcher />
        <Tooltip title={dark ? t('topBar.lightMode') : t('topBar.darkMode')}>
          <IconButton
            color="inherit"
            onClick={() => setMode(dark ? 'light' : 'dark')}
            aria-label={dark ? t('topBar.lightMode') : t('topBar.darkMode')}
          >
            {dark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title={user?.displayName ?? ''}>
          <IconButton
            color="inherit"
            onClick={(event) => setProfileAnchor(event.currentTarget)}
            aria-label={t('topBar.profileMenu')}
            data-testid="profile-menu"
          >
            <Avatar sx={{width: 34, height: 34, fontSize: 14, fontWeight: 600, bgcolor: 'secondary.main'}}>
              {initials}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={profileAnchor}
          open={profileAnchor !== null}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
          transformOrigin={{vertical: 'top', horizontal: 'right'}}
        >
          <Box sx={{px: 2, py: 1, minWidth: 220}}>
            <Typography variant="subtitle2">{user?.displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
            {location && (
              <Typography variant="caption" color="text.secondary">
                {t('topBar.roleAtLocation', {role: formatRole(t, location.role), location: location.name})}
              </Typography>
            )}
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setProfileAnchor(null);
              setConfirmingSignOut(true);
            }}
            data-testid="sign-out"
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {t('topBar.signOut')}
          </MenuItem>
        </Menu>
      </Toolbar>

      <Dialog open={confirmingSignOut} onClose={() => setConfirmingSignOut(false)}>
        <DialogTitle>{t('topBar.signOut')}</DialogTitle>
        <DialogContent>
          <Typography>{t('topBar.signOutQuestion')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingSignOut(false)}>{t('actions.cancel')}</Button>
          <Form method="post" action="/sign-out">
            <Button type="submit" variant="contained" data-testid="confirm-sign-out">
              {t('topBar.signOut')}
            </Button>
          </Form>
        </DialogActions>
      </Dialog>
    </AppBar>
  );
}
