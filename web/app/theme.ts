import {createTheme} from '@mui/material/styles';

// Light and dark palettes; MUI stores the viewer's choice and `useColorScheme()` switches between them.
export const appTheme = createTheme({
  cssVariables: {colorSchemeSelector: 'class'},
  colorSchemes: {
    light: {
      palette: {
        primary: {main: '#1f4e79', contrastText: '#ffffff'},
        secondary: {main: '#c2571a'},
        background: {default: '#f5f6f8', paper: '#ffffff'},
      },
    },
    dark: {
      palette: {
        primary: {main: '#7fb0e0', contrastText: '#0b1520'},
        secondary: {main: '#f0a36b'},
        background: {default: '#0f141a', paper: '#161d25'},
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
    MuiButton: {defaultProps: {disableElevation: true}},
    MuiPaper: {defaultProps: {variant: 'outlined'}},
    MuiAppBar: {defaultProps: {elevation: 0}},
    MuiTableCell: {styleOverrides: {head: {fontWeight: 600}}},
  },
});
