import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { Button } from "@mui/material";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ClientLoaderFunctionArgs, Link as RouterLink, useNavigate, useNavigation } from "react-router";
import { AppDataGrid } from "../../components/data-grid/AppDataGrid";
import { ErrorAlert } from "../../components/ErrorAlert";
import { ExportConfirmDialog } from "../../components/exports/ExportConfirmDialog";
import { API_CONFIG } from "../../core/config/api";
import { useExports } from "../../core/contexts/exports/useExports";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedLocation } from "../../core/contexts/location/useSelectedLocation";
import { useColumnVisibility } from "../../core/hooks/useColumnVisibility";
import { useListParams } from "../../core/hooks/useListParams";
import { RESOLVED_LOCATION_CONTEXT } from "../../core/middleware/routerContext";
import { formatListTotal } from "../../core/formatters/formatNumber";
import { toListQueryBody } from "../../core/paging/listParams";
import { prefetchListPage } from "../../core/paging/prefetchListPage";
import { queryClient } from "../../core/queries/queryClient";
import { customerColumns } from "./columns/customerColumns";
import { useCustomerCount } from "./hooks/useCustomerCount";
import { useCustomerList } from "./hooks/useCustomerList";
import { customerQueryOptions } from "./queries/customerQueryOptions";
import { type CustomerGridRow, isMatchRow, withCloseMatchRows } from "./columns/closeMatchRows";
import { questionOf } from "./types/customer";

/** Fetches the page of customers the URL asks for (search, page, sort, filter) before the list shows it. */
export async function clientLoader({ request, context }: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    // The page and its question's total together, so the footer has its number on the first paint. The total is
    // cached per question: paging and sorting fetch only the page (ACME-117).
    await prefetchListPage(request, (params) =>
      Promise.all([
        queryClient.query({ ...customerQueryOptions.list(resolved.locationId, params), staleTime: "static" }),
        queryClient.query({
          ...customerQueryOptions.count(resolved.locationId, questionOf(params)),
          staleTime: "static",
        }),
      ]),
    );
  }
  return null;
}

export default function CustomerList() {
  const { t, i18n } = useTranslation("customers");
  const { t: tCommon } = useTranslation();
  const { startAsync } = useExports();
  const [exportProblem, setExportProblem] = useState<unknown>(null);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const { location, can } = useSelectedLocation();
  const navigate = useNavigate();
  const { params, update } = useListParams();
  // A new page, sort or filter loads in the route's clientLoader; meanwhile the grid keeps its rows and shows a bar.
  const isLoadingPage = useNavigation().state === "loading";
  const { data, error, isLoading } = useCustomerList(location?.id ?? "", params);
  const count = useCustomerCount(location?.id ?? "", questionOf(params));
  const total = count.data ?? 0;
  const visibility = useColumnVisibility("customers");
  const labels = useMemo(
    () => ({ note: t("closeMatch.note", { search: params.search }), divider: t("closeMatch.divider") }),
    [t, params.search],
  );
  const columns = useMemo(() => customerColumns(t, i18n.language, labels), [t, i18n.language, labels]);
  // Exact matches, then close spellings under "Did you mean" (ACME-120, design a.html).
  const items = useMemo(() => data?.items ?? [], [data]);
  const rows = useMemo(() => withCloseMatchRows(items), [items]);
  const closeCount = items.filter((item) => item.match === "close").length;
  const footerLabel =
    closeCount > 0
      ? `${t("closeMatch.exact", { count: items.length - closeCount })} · ${t("closeMatch.close", { count: closeCount })}`
      : null;
  const noRows = params.search
    ? t("noMatch", { search: params.search })
    : t("none", { location: location?.name ?? "" });

  // The note and the divider are not customers: nothing to open.
  const openCustomer = (row: CustomerGridRow): void => {
    if (!isMatchRow(row)) {
      void navigate(`/customers/${row.id}`);
    }
  };

  // The list as it is shown: its search, sort and filter, and its visible columns in order under their headings.
  const startExport = (): void => {
    const visible = columns
      .filter((column) => visibility.columnVisibilityModel[column.field] !== false)
      // A column with no heading of its own is sent without one: the server names it, never with the field's name.
      .map((column) => ({ field: column.field, header: column.headerName }));
    setConfirmingExport(false);
    setExportProblem(null);
    startAsync(
      tCommon("exports.customersTitle", { location: location?.name ?? "" }),
      API_CONFIG.dealershipUrl,
      "v1/customers/exports",
      { ...toListQueryBody(params), columns: visible },
    ).catch(setExportProblem);
  };

  return (
    <Fragment>
      <PageHeader title={t("title")} subtitle={t("subtitle", { location: location?.name ?? "" })} />
      <ErrorAlert error={error ?? count.error ?? exportProblem} />
      <AppDataGrid<CustomerGridRow>
        columns={columns}
        rows={rows}
        loading={isLoading || isLoadingPage}
        server={{
          params,
          // At least the customers on the page (close spellings are not in the exact count); the note and the divider
          // are not customers, so they never make a second page.
          rowCount: Math.max(total, items.length),
          update,
          totalLabel: formatListTotal(total, i18n.language),
          footerLabel,
        }}
        columnVisibilityModel={visibility.columnVisibilityModel}
        onColumnVisibilityModelChange={visibility.setColumnVisibilityModel}
        onRowClick={openCustomer}
        actions={
          <Fragment>
            <Button
              startIcon={<FileDownloadIcon />}
              onClick={() => setConfirmingExport(true)}
              data-testid="export-customers"
            >
              {tCommon("exports.export")}
            </Button>
            {can("customers.write") && (
              <Button
                component={RouterLink}
                to="/customers/new"
                variant="contained"
                startIcon={<AddIcon />}
                data-testid="create-customer"
              >
                {t("newCustomer")}
              </Button>
            )}
          </Fragment>
        }
        searchPlaceholder={t("search")}
        noRowsLabel={noRows}
        testId="customers-table"
      />
      <ExportConfirmDialog
        open={confirmingExport}
        title={tCommon("exports.confirmTitle")}
        message={tCommon("exports.confirmMessage", {
          total: formatListTotal(total, i18n.language),
          location: location?.name ?? "",
        })}
        onCancel={() => setConfirmingExport(false)}
        onConfirm={startExport}
      />
    </Fragment>
  );
}
