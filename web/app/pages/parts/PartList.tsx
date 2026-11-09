import AddIcon from "@mui/icons-material/Add";
import { Button } from "@mui/material";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ClientLoaderFunctionArgs, useNavigate, useNavigation } from "react-router";
import { AppDataGrid } from "../../components/data-grid/AppDataGrid";
import { ErrorAlert } from "../../components/ErrorAlert";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedLocation } from "../../core/contexts/location/useSelectedLocation";
import { useColumnVisibility } from "../../core/hooks/useColumnVisibility";
import { useFormatMoney } from "../../core/hooks/useFormatMoney";
import { useListParams } from "../../core/hooks/useListParams";
import { RESOLVED_LOCATION_CONTEXT } from "../../core/middleware/routerContext";
import { prefetchListPage } from "../../core/paging/prefetchListPage";
import { queryClient } from "../../core/queries/queryClient";
import { partColumns } from "./columns/partColumns";
import { usePartCount } from "./hooks/usePartCount";
import { usePartList } from "./hooks/usePartList";
import { useStockValue } from "./hooks/useStockValue";
import { PartCreateDialog } from "./PartCreateDialog";
import { partQueryOptions } from "./queries/partQueryOptions";
import { type PartListItem, partQuestionOf } from "./types/part";

/**
 * Fetches the page of parts the URL asks for (search, page, sort, filter), its question's total and the stock value
 * before the list shows them. The total is cached per question: paging and sorting fetch only the page. The stock value
 * is asked again on arriving at the list from another page, so it is always current (ACME-124); paging keeps it.
 */
export async function clientLoader({ request, context }: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    const { locationId } = resolved;
    // While a loader runs the address bar still shows the page being left.
    const arriving = window.location.pathname !== new URL(request.url).pathname;
    await prefetchListPage(request, (params) =>
      Promise.all([
        queryClient.query({ ...partQueryOptions.list(locationId, params), staleTime: "static" }),
        queryClient.query({ ...partQueryOptions.count(locationId, partQuestionOf(params)), staleTime: "static" }),
        queryClient.query({ ...partQueryOptions.stockValue(locationId), staleTime: arriving ? 0 : "static" }),
      ]),
    );
  }
  return null;
}

export default function PartList() {
  const { t, i18n } = useTranslation("parts");
  const { location, can } = useSelectedLocation();
  const navigate = useNavigate();
  const { params, update } = useListParams();
  // A new page, sort or filter loads in the route's clientLoader; meanwhile the grid keeps its rows and shows a bar.
  const isLoadingPage = useNavigation().state === "loading";
  const { data, error, isLoading } = usePartList(location?.id ?? "", params);
  const count = usePartCount(location?.id ?? "", partQuestionOf(params));
  const stockValue = useStockValue(location?.id ?? "");
  const formatMoney = useFormatMoney();
  const visibility = useColumnVisibility("parts");
  const columns = useMemo(() => partColumns(t, i18n.language), [t, i18n.language]);
  // Creating a part opens PartCreateDialog, which predates the web standard: its own form state, not a route.
  const [creating, setCreating] = useState(false);
  // A list that failed to load is not empty: the alert above the grid says what happened (ACME-122).
  const noRows = error
    ? ""
    : params.search
      ? t("noMatch", { search: params.search })
      : t("noneStocked", { location: location?.name ?? "" });

  const openPart = (part: PartListItem): void => {
    void navigate(`/parts/${part.id}`);
  };

  return (
    <Fragment>
      <PageHeader
        title={t("title")}
        subtitle={
          stockValue.isSuccess
            ? t("subtitleWithValue", {
                location: location?.name ?? "",
                value: formatMoney(stockValue.data),
              })
            : t("subtitle", { location: location?.name ?? "" })
        }
      />
      <ErrorAlert error={error ?? count.error} />
      <AppDataGrid<PartListItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading || isLoadingPage}
        // The exact total, counted once per question; the footer shows it as a number, never "10,000+" (ACME-124).
        server={{ params, rowCount: count.data ?? 0, update }}
        columnVisibilityModel={visibility.columnVisibilityModel}
        onColumnVisibilityModelChange={visibility.setColumnVisibilityModel}
        onRowClick={openPart}
        actions={
          can("parts.write") && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreating(true)}
              data-testid="create-part"
            >
              {t("newPart")}
            </Button>
          )
        }
        searchPlaceholder={t("search")}
        noRowsLabel={noRows}
        testId="parts-table"
      />
      <PartCreateDialog key={location?.id ?? ""} open={creating} onClose={() => setCreating(false)} />
    </Fragment>
  );
}
