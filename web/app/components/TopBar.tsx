import DarkModeIcon from "@mui/icons-material/DarkMode";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import PlaceIcon from "@mui/icons-material/Place";
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
  useMediaQuery,
} from "@mui/material";
import { useColorScheme, useTheme } from "@mui/material/styles";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../core/contexts/auth/useAuth";
import { useLocationChangeGuard } from "../core/contexts/location/LocationChangeGuardContext";
import { useSelectedLocation } from "../core/contexts/location/useSelectedLocation";
import { formatRole } from "../core/formatters/formatRole";
import { ExportsButton } from "./exports/ExportsButton";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { APPBAR_HEIGHT, TRANSITION } from "./Sidebar";

export function TopBar({ sidebarWidth }: { sidebarWidth: number }) {
  const { t } = useTranslation();
  const { user, signOutAsync } = useAuth();
  const { location, locations, switchLocation } = useSelectedLocation();
  const { requestSwitch } = useLocationChangeGuard();
  const { mode, systemMode, setMode } = useColorScheme();
  const [locationAnchor, setLocationAnchor] = useState<HTMLElement | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // On a phone the bar keeps only the location, exports and the profile menu; the rest moves into that menu.
  const isPhone = useMediaQuery(useTheme().breakpoints.down("sm"));

  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const initials = (user?.displayName ?? "?")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppBar
      position="fixed"
      sx={{
        width: `calc(100% - ${sidebarWidth}px)`,
        ml: `${sidebarWidth}px`,
        height: APPBAR_HEIGHT,
        justifyContent: "center",
        borderBottom: 1,
        borderColor: "divider",
        transition: `width ${TRANSITION}, margin-left ${TRANSITION}`,
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        {!isPhone && (
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {user?.dealerName}
          </Typography>
        )}
        {/* Always a dropdown, so every user finds the location switch in the same place. */}
        {location && (
          <Button
            color="inherit"
            startIcon={<PlaceIcon fontSize="small" />}
            endIcon={<ExpandMoreIcon />}
            onClick={(event) => setLocationAnchor(event.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={locationAnchor !== null}
            sx={{
              ml: isPhone ? 0 : 1.5,
              px: 1.5,
              height: 36,
              minWidth: isPhone ? 0 : 160,
              maxWidth: isPhone ? 150 : "none",
              justifyContent: "space-between",
              border: "1px solid rgba(255, 255, 255, 0.45)",
              borderRadius: 1.5,
              fontWeight: 500,
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)", borderColor: "rgba(255, 255, 255, 0.8)" },
            }}
            data-testid="location-switcher"
          >
            <Box
              component="span"
              sx={{
                flexGrow: 1,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {location.name}
            </Box>
          </Button>
        )}
        <Menu
          anchorEl={locationAnchor}
          open={locationAnchor !== null}
          onClose={() => setLocationAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          slotProps={{ paper: { sx: { mt: 0.5, minWidth: 200 } } }}
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

        <Box sx={{ flexGrow: 1 }} />

        <ExportsButton />
        {!isPhone && <LanguageSwitcher />}
        {!isPhone && (
          <Tooltip title={dark ? t("topBar.lightMode") : t("topBar.darkMode")}>
            <IconButton
              color="inherit"
              onClick={() => setMode(dark ? "light" : "dark")}
              aria-label={dark ? t("topBar.lightMode") : t("topBar.darkMode")}
            >
              {dark ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={user?.displayName ?? ""}>
          <IconButton
            color="inherit"
            onClick={(event) => setProfileAnchor(event.currentTarget)}
            aria-label={t("topBar.profileMenu")}
            data-testid="profile-menu"
          >
            <Avatar sx={{ width: 34, height: 34, fontSize: 14, fontWeight: 600, bgcolor: "secondary.main" }}>
              {initials}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={profileAnchor}
          open={profileAnchor !== null}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
            <Typography variant="subtitle2">{user?.displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
            {location && (
              <Typography variant="caption" color="text.secondary">
                {t("topBar.roleAtLocation", { role: formatRole(t, location.role), location: location.name })}
              </Typography>
            )}
          </Box>
          <Divider />
          {isPhone && (
            <MenuItem onClick={() => setMode(dark ? "light" : "dark")}>
              <ListItemIcon>
                {dark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
              </ListItemIcon>
              {dark ? t("topBar.lightMode") : t("topBar.darkMode")}
            </MenuItem>
          )}
          {isPhone && (
            <Box sx={{ px: 1, py: 0.5 }}>
              <LanguageSwitcher />
            </Box>
          )}
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
            {t("topBar.signOut")}
          </MenuItem>
        </Menu>
      </Toolbar>

      {/* While signing out the dialog stays and says so, and cannot be sent twice or closed: the sign-in page loads next. */}
      <Dialog open={confirmingSignOut || signingOut} onClose={() => !signingOut && setConfirmingSignOut(false)}>
        <DialogTitle>{t("topBar.signOut")}</DialogTitle>
        <DialogContent>
          <Typography>{t("topBar.signOutQuestion")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingSignOut(false)} disabled={signingOut}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={signingOut}
            onClick={() => {
              // Disabled from the first press; the kernel also joins a second one, so the gateway is asked once.
              setSigningOut(true);
              void signOutAsync();
            }}
            data-testid="confirm-sign-out"
          >
            {signingOut ? t("topBar.signingOut") : t("topBar.signOut")}
          </Button>
        </DialogActions>
      </Dialog>
    </AppBar>
  );
}
