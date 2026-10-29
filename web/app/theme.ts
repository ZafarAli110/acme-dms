import {createTheme} from '@mui/material/styles';

// Four surfaces that must always be told apart: the top bar, the sidebar, the page behind the content, and the cards
// on it (a grid, a form). Light follows the IDS DMS: a blue bar, a white sidebar, a light grey page, white cards. Dark
// keeps the same order of steps (sidebar darkest, then the page, then the cards, lighter again) and a blue bar, so the
// areas stay distinct instead of all being near-black. MUI stores the viewer's choice; `useColorScheme()` switches.
const SURFACES = {
  light: {
    appBar: '#1565c0',
    appBarText: '#ffffff',
    sidebar: '#ffffff',
    page: '#f4f6f8',
    card: '#ffffff',
    inset: '#f4f6f8',
  },
  dark: {
    appBar: '#1e3a5f',
    appBarText: '#e8eef6',
    sidebar: '#15191e',
    page: '#1e2329',
    card: '#272d35',
    inset: '#2f363f',
  },
} as const;

/** One step off a card's colour: a grid's header row, a card's toolbar. */
export const INSET_SURFACE = 'var(--acme-surface-inset)';

export const appTheme = createTheme({
  cssVariables: {colorSchemeSelector: 'class'},
  colorSchemes: {
    light: {
      palette: {
        primary: {main: '#1565c0', contrastText: '#ffffff'},
        secondary: {main: '#c2571a'},
        background: {default: SURFACES.light.page, paper: SURFACES.light.card},
        divider: 'rgba(15, 23, 42, 0.12)',
      },
    },
    dark: {
      palette: {
        primary: {main: '#64b5f6', contrastText: '#0b1520'},
        secondary: {main: '#f0a36b'},
        background: {default: SURFACES.dark.page, paper: SURFACES.dark.card},
        divider: 'rgba(255, 255, 255, 0.14)',
        text: {primary: '#e8ecf1', secondary: '#aeb7c2'},
      },
    },
  },
  shape: {borderRadius: 8},
  typography: {
    fontFamily: '"Inter Variable", Roboto, Helvetica, Arial, sans-serif',
    h4: {fontWeight: 600},
    h5: {fontWeight: 600},
    h6: {fontWeight: 600},
    button: {textTransform: 'none', fontWeight: 600},
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {'--acme-surface-inset': SURFACES.light.inset},
        ':root.dark': {'--acme-surface-inset': SURFACES.dark.inset},
      },
    },
    MuiButton: {defaultProps: {disableElevation: true}},
    MuiPaper: {defaultProps: {variant: 'outlined'}},
    MuiAppBar: {
      defaultProps: {elevation: 0, color: 'inherit'},
      styleOverrides: {
        root: ({theme}) => ({
          backgroundColor: SURFACES.light.appBar,
          color: SURFACES.light.appBarText,
          ...theme.applyStyles('dark', {backgroundColor: SURFACES.dark.appBar, color: SURFACES.dark.appBarText}),
        }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({theme}) => ({
          backgroundColor: SURFACES.light.sidebar,
          ...theme.applyStyles('dark', {backgroundColor: SURFACES.dark.sidebar}),
        }),
      },
    },
    MuiTableCell: {styleOverrides: {head: {fontWeight: 600}}},
  },
});
