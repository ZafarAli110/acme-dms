import { valibotResolver } from "@hookform/resolvers/valibot";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigate, useNavigation, useSubmit } from "react-router";
import { FormGuards } from "../../components/FormGuards";
import { useSelectedLocation } from "../../core/contexts/location/useSelectedLocation";
import { useErrorUntilEdited } from "../../core/hooks/useErrorUntilEdited";
import { type SaveAnswer, useSaveKey } from "../../core/hooks/useSaveKey";
import { CustomerFields } from "./components/CustomerFields";
import { toCustomerInput, toFormValues } from "./mappers/customerFormMapper";
import { createCustomerSchema } from "./schemas/customerSchema";
import type { Customer, CustomerFormValues } from "./types/customer";

interface CustomerFormProps {
  /** The customer as saved, or null for a new one. The edit page remounts the form when it changes. */
  customer: Customer | null;
  canEdit: boolean;
  /** What the page's clientAction returned: its error, and whether the last Save succeeded. */
  error: string | null;
  saved: boolean;
  /** A save sent again found the first one had gone through (ACME-125): the form shows what that one saved. */
  wentThrough?: boolean;
  /** The edit page: told whether the form has unsaved changes, so a newer version never replaces them unasked. */
  onDirtyChange?: (dirty: boolean) => void;
  /** The edit page: someone else saved a newer version while this form has unsaved changes. */
  changedElsewhere?: boolean;
  /** The edit page: drops the unsaved changes and shows the newer version. */
  onShowLatest?: () => void;
  /** The edit page: keeps the unsaved changes over the newer version, so the next save is not refused. */
  onKeepMine?: () => void;
}

/**
 * The customer's details, for the create and the edit page. One Save sends every field (null for an empty one)
 * through the page's clientAction as JSON; create then redirects to the new customer.
 */
export function CustomerForm({
  customer,
  canEdit,
  error,
  saved,
  wentThrough = false,
  onDirtyChange,
  changedElsewhere = false,
  onShowLatest,
  onKeepMine,
}: CustomerFormProps) {
  const { t } = useTranslation("customers");
  const { t: tCommon } = useTranslation();
  const { location } = useSelectedLocation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const schema = useMemo(() => createCustomerSchema(t), [t]);
  // The customer as this form opened it: its version goes with a save, so a save over someone else's is refused (412).
  const [opened, setOpened] = useState(customer);
  const methods = useForm<CustomerFormValues>({
    resolver: valibotResolver(schema),
    defaultValues: toFormValues(opened),
  });
  // The page's action result, for the error's identity: a new failed save shows its error again.
  const actionData = useActionData<SaveAnswer>();
  const saveError = useErrorUntilEdited(actionData, error, methods);
  // One key per save the user means to make: the same on every Save until one is done (ACME-125).
  const saveKey = useSaveKey(actionData);
  // A second press while a save is on its way is ignored, before React has re-rendered the button disabled.
  const sending = useRef(false);
  useEffect(() => {
    if (navigation.state === "idle") {
      sending.current = false;
    }
  }, [navigation.state]);
  const { isDirty } = methods.formState;
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);
  const disabled = !canEdit || isSubmitting;

  const send = methods.handleSubmit(
    (values) =>
      // Every save carries the form's key; an edit also its version and the location the user saw at Save (the create
      // page's action takes neither).
      submit(
        opened === null
          ? { ...toCustomerInput(values), saveKey }
          : { ...toCustomerInput(values), saveKey, version: opened.version, locationId: location?.id ?? null },
        {
          method: "post",
          encType: "application/json",
        },
      ),
    () => {
      sending.current = false;
    },
  );
  const save = (event: FormEvent<HTMLFormElement>): void => {
    if (sending.current) {
      event.preventDefault();
      return;
    }
    sending.current = true;
    void send(event);
  };

  // Their version under the user's edits: what the user did not touch becomes theirs, then the form saves from theirs.
  const keepMine = (): void => {
    if (customer === null) {
      return;
    }
    const theirs = toFormValues(customer);
    const { dirtyFields } = methods.formState;
    for (const field of Object.keys(theirs) as (keyof CustomerFormValues)[]) {
      if (!dirtyFields[field]) {
        methods.setValue(field, theirs[field]);
      }
    }
    setOpened(customer);
    onKeepMine?.();
  };

  return (
    <FormProvider {...methods}>
      {/* Not while a navigation is under way: a create's redirect to the new customer must not ask. */}
      <FormGuards isDirty={isDirty && navigation.state === "idle"} redirectTo="/customers" />
      {changedElsewhere && onShowLatest && onKeepMine && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Fragment>
              <Button color="inherit" size="small" onClick={keepMine} data-testid="keep-mine">
                {tCommon("revision.keepMine")}
              </Button>
              <Button color="inherit" size="small" onClick={onShowLatest} data-testid="show-latest">
                {tCommon("revision.showLatest")}
              </Button>
            </Fragment>
          }
          data-testid="changed-elsewhere"
        >
          {tCommon("revision.changedElsewhere")}
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="save-error">
          {saveError}
        </Alert>
      )}
      {saved && !isDirty && !wentThrough && (
        <Alert severity="success" sx={{ mb: 2 }} data-testid="save-success">
          {t("edit.saved")}
        </Alert>
      )}
      {wentThrough && !isDirty && (
        <Alert severity="info" sx={{ mb: 2 }} data-testid="save-went-through">
          {tCommon("saves.wentThrough")}
        </Alert>
      )}
      <Paper
        component="form"
        id="customer-form"
        noValidate
        onSubmit={save}
        sx={{ p: 3, opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? "none" : "auto" }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("edit.details")}
        </Typography>
        <CustomerFields disabled={disabled} />
        {canEdit && (
          <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 1, mt: 2 }}>
            <Button onClick={() => navigate("/customers")} disabled={isSubmitting} data-testid="cancel">
              {tCommon("actions.cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={(customer !== null && !isDirty) || isSubmitting}
              data-testid="save-customer"
            >
              {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
            </Button>
          </Stack>
        )}
      </Paper>
    </FormProvider>
  );
}
