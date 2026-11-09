import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Box, IconButton, MenuItem, Select, TextField, Tooltip, Typography } from "@mui/material";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatListTotal, formatNumber } from "../../core/formatters/formatNumber";
import { type ListParams, MAX_LIST_DEPTH, PAGE_SIZES } from "../../core/paging/listParams";
import type { ListTotal } from "../../core/types/listTotal";

/** What a page of a server list says about the pages around it (the API's `hasMore`, `next` and `previous`). */
export interface ListPaging {
  hasMore: boolean;
  /** The cursor of the page after this one; null on the last page, or for a list that pages by number only. */
  next: string | null;
  /** The cursor of the page before this one; null on the first page, or for a list that pages by number only. */
  previous: string | null;
}

interface ListFooterProps {
  params: ListParams;
  update: (changes: Partial<ListParams>, options: { replace: boolean }) => void;
  rowsOnPage: number;
  /** Null while it loads. */
  total: ListTotal | null;
  /** Null while the page loads. */
  paging: ListPaging | null;
  /** The list pages by keyset (its cursors): a parts search does not, and its Last needs an exact total. */
  keyset: boolean;
  /** The whole label, for a page that is not a slice of a counted list (close spellings, ACME-120). */
  label?: string | null;
}

/**
 * A server list's footer (ACME-129, design a.html): rows per page, the rows shown and the total, then first, previous,
 * a page box, next and last. Previous, next and last go by keyset, so the end of a long list is as quick as its start;
 * the box jumps to a page by its number, up to row 10,000. Past a known row number (the last page, and the pages before
 * it reached with Previous) the label says "Last 25" and the box is empty.
 */
export function ListFooter({ params, update, rowsOnPage, total, paging, keyset, label }: ListFooterProps) {
  const { t, i18n } = useTranslation();
  const [problem, setProblem] = useState<{ page: number | null; text: string } | null>(null);
  const { pageSize, cursor } = params;
  // A page reached by keyset with nothing before it is the first, whatever its URL says.
  const page = params.page ?? (paging && paging.previous === null ? 1 : null);
  const deepest = Math.floor(MAX_LIST_DEPTH / pageSize);
  const lastNumbered = total?.kind === "exact" ? Math.max(1, Math.ceil(total.value / pageSize)) : null;
  const atFirst = page === 1 || (paging !== null && paging.previous === null && page === null);
  const atLast = paging !== null && !paging.hasMore;
  const canGoLast = !atLast && (keyset || (lastNumbered !== null && lastNumbered <= deepest));
  const shownProblem = problem && problem.page === page ? problem.text : null;
  const from = page === null || rowsOnPage === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = page === null || rowsOnPage === 0 ? 0 : from + rowsOnPage - 1;
  // "Of many" until the last match is on screen: then its row number is the total (ACME-129).
  const shownTotal: ListTotal | null =
    total?.kind === "many" && page !== null && atLast ? { kind: "exact", value: to } : total;
  const totalText = shownTotal ? formatListTotal(shownTotal, i18n.language, t) : "…";

  const text = (() => {
    if (label) {
      return label;
    }
    if (page !== null) {
      return t("paging.rows", {
        from: formatNumber(from, i18n.language),
        to: formatNumber(to, i18n.language),
        total: totalText,
      });
    }
    return cursor && "last" in cursor
      ? t("paging.lastRows", { count: rowsOnPage, total: totalText })
      : t("paging.beforeLast", { count: pageSize });
  })();

  const goFirst = (): void => {
    update({ page: 1, cursor: null }, { replace: false });
  };
  const goPrevious = (): void => {
    if (page === 2 || (page !== null && page > 1 && !paging?.previous)) {
      // Page 2 back to 1, or a list that pages by number: by number.
      update({ page: page - 1, cursor: null }, { replace: false });
    } else if (paging?.previous) {
      update({ page: page === null ? null : page - 1, cursor: { before: paging.previous } }, { replace: false });
    }
  };
  const goNext = (): void => {
    if (paging?.next) {
      update({ page: page === null ? null : page + 1, cursor: { after: paging.next } }, { replace: false });
    } else {
      update({ page: (page ?? 1) + 1, cursor: null }, { replace: false });
    }
  };
  const goLast = (): void => {
    if (keyset) {
      update({ page: null, cursor: { last: true } }, { replace: false });
    } else if (lastNumbered !== null) {
      update({ page: lastNumbered, cursor: null }, { replace: false });
    }
  };
  const jump = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") {
      return;
    }
    const wanted = Number(event.currentTarget.value.trim());
    if (!Number.isInteger(wanted) || wanted < 1) {
      return;
    }
    if (wanted > deepest) {
      setProblem({ page, text: t("paging.pageTooDeep", { max: formatNumber(deepest, i18n.language) }) });
    } else if (lastNumbered !== null && wanted > lastNumbered) {
      setProblem({ page, text: t("paging.pageBeyondEnd", { max: formatNumber(lastNumbered, i18n.language) }) });
    } else {
      setProblem(null);
      update({ page: wanted, cursor: null }, { replace: false });
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "flex-end",
        columnGap: 2,
        rowGap: 0.5,
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        fontSize: "0.8rem",
        color: "text.secondary",
      }}
      data-testid="list-footer"
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="inherit">{t("paging.rowsPerPage")}</Typography>
        <Select
          variant="standard"
          disableUnderline
          value={pageSize}
          onChange={(event) => update({ pageSize: Number(event.target.value), page: 1 }, { replace: false })}
          sx={{ fontSize: "0.8rem" }}
          inputProps={{ "aria-label": t("paging.rowsPerPage") }}
        >
          {PAGE_SIZES.map((size) => (
            <MenuItem key={size} value={size}>
              {size}
            </MenuItem>
          ))}
        </Select>
      </Box>
      <Typography variant="inherit" data-testid="list-footer-rows" sx={{ minWidth: 0 }}>
        {text}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip title={t("paging.first")}>
          <span>
            <IconButton size="small" onClick={goFirst} disabled={atFirst} aria-label={t("paging.first")}>
              <FirstPageIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("paging.previous")}>
          <span>
            <IconButton size="small" onClick={goPrevious} disabled={atFirst} aria-label={t("paging.previous")}>
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="inherit" sx={{ ml: 0.5 }}>
          {t("paging.page")}
        </Typography>
        <TextField
          // A new page starts the box again from its number (empty when it has none).
          key={`${page ?? ""}:${pageSize}`}
          defaultValue={page ?? ""}
          size="small"
          error={shownProblem !== null}
          slotProps={{
            // On the input itself: on the TextField it would reach its outer element, which has no value.
            htmlInput: {
              onKeyDown: jump,
              inputMode: "numeric",
              "aria-label": t("paging.page"),
              "data-testid": "list-footer-page",
              style: { width: 56, textAlign: "center", padding: "4px 6px", fontSize: "0.8rem" },
            },
          }}
        />
        <Tooltip title={t("paging.next")}>
          <span>
            <IconButton size="small" onClick={goNext} disabled={!paging?.hasMore} aria-label={t("paging.next")}>
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("paging.last")}>
          <span>
            <IconButton size="small" onClick={goLast} disabled={!canGoLast} aria-label={t("paging.last")}>
              <LastPageIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {shownProblem && (
        <Typography variant="inherit" color="error" sx={{ flexBasis: "100%", textAlign: "right" }} role="alert">
          {shownProblem}
        </Typography>
      )}
    </Box>
  );
}
