import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChatIcon from '@mui/icons-material/Chat';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HomeIcon from '@mui/icons-material/Home';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MailIcon from '@mui/icons-material/Mail';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import PeopleIcon from '@mui/icons-material/People';
import ShelvesIcon from '@mui/icons-material/Shelves';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import {type ReactElement, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Link as RouterLink, useLocation} from 'react-router';
import {useSelectedLocation} from '../core/contexts/location/useSelectedLocation';
import type navigation from '../locales/en/navigation.json';
import {AcmeLogo} from './AcmeLogo';

export const SIDEBAR_EXPANDED_WIDTH = 260;
export const SIDEBAR_COLLAPSED_WIDTH = 68;
export const APPBAR_HEIGHT = 64;
export const TRANSITION = '200ms ease';

interface NavItem {
  /** Its label is `navigation:items.<key>`. */
  key: keyof typeof navigation.items;
  icon: ReactElement;
  /** Null until the screen exists: the sidebar then shows a "coming soon" dialog. */
  route: string | null;
  /** Hidden from users who do not hold this permission at the selected location. */
  permission: string | null;
}

interface NavSection {
  /** Its label is `navigation:sections.<key>`. */
  key: keyof typeof navigation.sections;
  icon: ReactElement;
  items: NavItem[];
}

// Every screen in the sidebar is listed here: the ones that exist, and the ones the backlog's tickets build.
// A new page needs a route in routes.tsx, an item here and its label in locales/<language>/navigation.json.
const NAV_SECTIONS: NavSection[] = [
  {
    key: 'inventory',
    icon: <ShelvesIcon />,
    items: [
      {key: 'parts', icon: <Inventory2Icon />, route: '/parts', permission: 'parts.read'},
      {key: 'stock', icon: <WarehouseIcon />, route: null, permission: 'stock.read'},
      {key: 'vehiclesInStock', icon: <DirectionsCarIcon />, route: null, permission: null},
    ],
  },
  {
    key: 'customerRelations',
    icon: <PeopleIcon />,
    items: [{key: 'customers', icon: <PeopleIcon />, route: '/customers', permission: 'customers.read'}],
  },
  {
    key: 'communication',
    icon: <ChatIcon />,
    items: [{key: 'messages', icon: <MailIcon />, route: null, permission: null}],
  },
  {
    key: 'administration',
    icon: <AdminPanelSettingsIcon />,
    items: [{key: 'locations', icon: <LocationOnIcon />, route: '/locations', permission: 'users.manage'}],
  },
];

function isActiveRoute(pathname: string, route: string): boolean {
  return route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`);
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Called with the screen's translated name. */
  onComingSoon: (feature: string) => void;
}

export function Sidebar({collapsed, onToggle, onComingSoon}: SidebarProps) {
  const {t} = useTranslation('navigation');
  const {can} = useSelectedLocation();
  const {pathname} = useLocation();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.permission === null || can(item.permission)),
  })).filter((section) => section.items.length > 0);
  const activeSection =
    sections.find((section) => section.items.some((item) => item.route && isActiveRoute(pathname, item.route)))?.key ??
    false;
  const [expanded, setExpanded] = useState<string | false>(activeSection);
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const toggleLabel = collapsed ? t('expandMenu') : t('collapseMenu');

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: `width ${TRANSITION}`,
        '& .MuiDrawer-paper': {width, overflowX: 'hidden', transition: `width ${TRANSITION}`},
      }}
    >
      <Box
        sx={{
          height: APPBAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0 : 2,
          flexShrink: 0,
        }}
      >
        {!collapsed && <AcmeLogo />}
        <Tooltip title={toggleLabel} placement="right">
          <IconButton onClick={onToggle} size="small" aria-label={toggleLabel}>
            {collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />
      <Box component="nav" sx={{flexGrow: 1, overflowY: 'auto', py: 1}}>
        <List disablePadding dense>
          <NavItemButton
            label={t('home')}
            testId="nav-home"
            icon={<HomeIcon />}
            route="/"
            active={pathname === '/'}
            collapsed={collapsed}
            indent={false}
            onComingSoon={onComingSoon}
          />
        </List>
        {sections.map((section) => (
          <NavSectionGroup
            key={section.key}
            section={section}
            collapsed={collapsed}
            expanded={expanded === section.key}
            onExpand={(isExpanded) => setExpanded(isExpanded ? section.key : false)}
            pathname={pathname}
            onComingSoon={onComingSoon}
          />
        ))}
      </Box>
    </Drawer>
  );
}

interface NavSectionGroupProps {
  section: NavSection;
  collapsed: boolean;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  pathname: string;
  onComingSoon: (feature: string) => void;
}

function NavSectionGroup({section, collapsed, expanded, onExpand, pathname, onComingSoon}: NavSectionGroupProps) {
  const {t} = useTranslation('navigation');
  const items = section.items.map((item) => (
    <NavItemButton
      key={item.key}
      label={t(`items.${item.key}`)}
      testId={`nav-${item.key}`}
      icon={item.icon}
      route={item.route}
      active={item.route !== null && isActiveRoute(pathname, item.route)}
      collapsed={collapsed}
      indent={!collapsed}
      onComingSoon={onComingSoon}
    />
  ));

  if (collapsed) {
    return (
      <List disablePadding dense>
        <Divider sx={{my: 0.5}} />
        {items}
      </List>
    );
  }
  return (
    <Accordion
      expanded={expanded}
      onChange={(_event, isExpanded) => onExpand(isExpanded)}
      disableGutters
      elevation={0}
      square
      sx={{bgcolor: 'transparent', border: 0, '&::before': {display: 'none'}}}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{minHeight: 40, px: 2.5}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary'}}>
          {section.icon}
          <Typography variant="body2" sx={{fontWeight: 600, color: 'text.primary'}}>
            {t(`sections.${section.key}`)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{p: 0}}>
        <List disablePadding dense>
          {items}
        </List>
      </AccordionDetails>
    </Accordion>
  );
}

interface NavItemButtonProps {
  label: string;
  testId: string;
  icon: ReactElement;
  route: string | null;
  active: boolean;
  collapsed: boolean;
  indent: boolean;
  onComingSoon: (feature: string) => void;
}

function NavItemButton({label, testId, icon, route, active, collapsed, indent, onComingSoon}: NavItemButtonProps) {
  const button = (
    <ListItemButton
      {...(route ? {component: RouterLink, to: route} : {onClick: () => onComingSoon(label)})}
      selected={active}
      data-testid={testId}
      sx={{
        minHeight: 40,
        pl: indent ? 4.5 : 2.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderLeft: '3px solid',
        borderLeftColor: active ? 'primary.main' : 'transparent',
      }}
    >
      <ListItemIcon sx={{minWidth: collapsed ? 0 : 36, color: active ? 'primary.main' : 'text.secondary'}}>
        {icon}
      </ListItemIcon>
      {!collapsed && (
        <ListItemText primary={label} slotProps={{primary: {variant: 'body2', sx: {fontWeight: active ? 600 : 400}}}} />
      )}
    </ListItemButton>
  );
  return (
    <ListItem disablePadding>
      {collapsed ? (
        <Tooltip title={label} placement="right">
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </ListItem>
  );
}
