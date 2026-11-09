import { Typography } from "@mui/material";
import type { PartListItem } from "../types/part";

/** The description in a grid row: cut with "…" at the column's edge, all of it on hover (ACME-124). */
export function PartDescriptionCell({ part }: { part: PartListItem }) {
  return (
    <Typography variant="inherit" noWrap title={part.description} data-testid="part-description-cell">
      {part.description}
    </Typography>
  );
}
