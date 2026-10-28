import {Box} from '@mui/material';
import {useState} from 'react';
import {Outlet} from 'react-router';
import {ComingSoonDialog} from './ComingSoonDialog';
import {APPBAR_HEIGHT, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH, Sidebar} from './Sidebar';
import {TopBar} from './TopBar';

const COLLAPSED_KEY = 'acme:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** The signed-in frame: sidebar on the left, top bar, and the current page in the middle. */
export default function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Only a convenience: the sidebar still works without storage.
    }
  };

  return (
    <Box sx={{display: 'flex', minHeight: '100vh', bgcolor: 'background.default'}}>
      <TopBar sidebarWidth={sidebarWidth} />
      <Sidebar collapsed={collapsed} onToggle={toggle} onComingSoon={setComingSoon} />
      <Box component="main" sx={{flexGrow: 1, minWidth: 0, mt: `${APPBAR_HEIGHT}px`, p: {xs: 2, md: 4}}}>
        <Box sx={{maxWidth: 1280, mx: 'auto'}}>
          <Outlet />
        </Box>
      </Box>
      <ComingSoonDialog feature={comingSoon} onClose={() => setComingSoon(null)} />
    </Box>
  );
}
