import {Avatar, Box, Typography} from '@mui/material';
import type {CustomerListItem} from '../types/customer';

/** The customer's initials, name and company in a grid row. */
export function CustomerNameCell({customer}: {customer: CustomerListItem}) {
  return (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, height: '100%'}}>
      <Avatar sx={{width: 28, height: 28, fontSize: 12, bgcolor: 'primary.main'}}>
        {customer.firstName[0]}
        {customer.surname[0]}
      </Avatar>
      <Box sx={{lineHeight: 1.2}}>
        <Typography variant="body2" color="primary" sx={{fontWeight: 600}}>
          {customer.firstName} {customer.surname}
        </Typography>
        {customer.companyName && (
          <Typography variant="caption" color="text.secondary">
            {customer.companyName}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
