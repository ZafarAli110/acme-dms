import {MenuItem, Select} from '@mui/material';
import {useTranslation} from 'react-i18next';
import {LANGUAGES} from '../i18n';

/** The language dropdown in the top bar. The choice is remembered in the browser. */
export function LanguageSwitcher() {
  const {t, i18n} = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';

  return (
    <Select
      value={current}
      onChange={(event) => void i18n.changeLanguage(event.target.value)}
      size="small"
      variant="outlined"
      inputProps={{'aria-label': t('topBar.language')}}
      data-testid="language-switcher"
      sx={{
        color: 'inherit',
        '& .MuiOutlinedInput-notchedOutline': {border: 'none'},
        '& .MuiSvgIcon-root': {color: 'inherit'},
      }}
    >
      {LANGUAGES.map((language) => (
        <MenuItem key={language.code} value={language.code} data-testid={`language-${language.code}`}>
          {language.label}
        </MenuItem>
      ))}
    </Select>
  );
}
