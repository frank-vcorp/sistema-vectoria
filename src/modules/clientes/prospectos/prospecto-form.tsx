"use client";

import * as React from "react";
import { z } from "zod";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * ProspectoForm — formulario de alta de prospectos (SPEC-002 AC-1).
 *
 * Validación inline con el mismo contrato Zod que el backend
 * (`ProspectCreateInputSchema`). Mantiene el formulario operable en
 * 375/768/1280 (AC-9) sin dependencias nuevas: usa los componentes
 * `Dialog`/`Input`/`Label`/`Button` existentes y un `<select>`
 * nativo para el medio de contacto (catálogo cerrado `llamada | email |
 * whatsapp` · DEC-20260823-01).
 *
 * El formulario es controlado con `useState` (consistente con el resto
 * del módulo); no introduce `react-hook-form` para no añadir
 * dependencias nuevas en este incremento.
 */
type FormStatus = "idle" | "submitting" | "success" | "error";

// SPEC-002-UI-20260824-04 · P3 contrato: el backend emite
// `PROSPECT_CODE_DUPLICATE` (HTTP 409) cuando el `code` ya existe en la
// organización (BR-N216). `ForbiddenError` se reserva al middleware de
// `hasPermission.require()` para permisos (HTTP 403); el form lo trata
// como "permiso insuficiente" sin contaminar el mensaje de duplicado.
const DOMAIN_ERROR_DUPLICATE = "PROSPECT_CODE_DUPLICATE";

// Mapeo código → etiqueta usando el catálogo cerrado.
const MEDIUM_OPTIONS = [
  { value: "", labelKey: "mediumPlaceholder" as const },
  { value: "llamada", labelKey: "llamada" as const },
  { value: "email", labelKey: "email" as const },
  { value: "whatsapp", labelKey: "whatsapp" as const },
] as const;

interface ProspectoFormProps {
  /** Control de apertura del Dialog. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback invocado con el prospecto creado (id). */
  onCreated?: (prospect: { id: string; code: string; name: string }) => void;
}

interface FormValues {
  code: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  medium: "" | "llamada" | "email" | "whatsapp";
}

const EMPTY_VALUES: FormValues = {
  code: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "",
  medium: "",
};

const emailLike = z.string().trim().email().or(z.literal(""));

export function ProspectoForm({
  open,
  onOpenChange,
  onCreated,
}: ProspectoFormProps) {
  const [values, setValues] = React.useState<FormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = React.useState<{
    code?: string;
    name?: string;
    email?: string;
    medium?: string;
  }>({});
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [serverError, setServerError] = React.useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.clientes.prospectos.create.useMutation({
    onSuccess: (row) => {
      setStatus("success");
      void utils.clientes.prospectos.list.invalidate();
      onCreated?.({ id: row.id, code: row.code, name: row.name });
      // Limpieza diferida para que el mensaje success sea perceptible.
      setTimeout(() => {
        setValues(EMPTY_VALUES);
        setFieldErrors({});
        setServerError(null);
        setStatus("idle");
        onOpenChange(false);
      }, 600);
    },
    onError: (err) => {
      setStatus("error");
      // SPEC-002-UI-20260824-04 · P3 contrato: el mapeo UI distingue
      // tres casos: (a) 409 PROSPECT_CODE_DUPLICATE → mensaje en el
      // campo `code` (acccionable, BR-N216); (b) 403 ForbiddenError →
      // mensaje general de permiso insuficiente (HTTP 403 lo emite
      // `hasPermission.require`); (c) resto → mensaje genérico.
      const code = err.data?.code ?? null;
      const httpStatus = err.data?.httpStatus ?? null;
      if (code === DOMAIN_ERROR_DUPLICATE) {
        setFieldErrors((fe) => ({
          ...fe,
          code: messages.prospectos.form.errors.codeServer,
        }));
        setServerError(null);
        return;
      }
      if (httpStatus === 403 || code === "ForbiddenError") {
        setFieldErrors({});
        setServerError(messages.prospectos.form.errors.forbidden);
        return;
      }
      // Errores Zod del backend (validación servidor reforzada).
      const zodErr = err.data?.zodError as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;
      if (zodErr?.fieldErrors) {
        const next: typeof fieldErrors = {};
        if (zodErr.fieldErrors["code"]?.[0])
          next.code = messages.prospectos.form.errors.invalidCode;
        if (zodErr.fieldErrors["name"]?.[0])
          next.name = messages.prospectos.form.errors.requiredName;
        if (zodErr.fieldErrors["email"]?.[0])
          next.email = messages.prospectos.form.errors.invalidEmail;
        if (zodErr.fieldErrors["medium"]?.[0])
          next.medium = messages.prospectos.form.errors.invalidCode;
        if (Object.keys(next).length > 0) {
          setFieldErrors(next);
          setServerError(null);
          return;
        }
      }
      setServerError(messages.prospectos.form.errors.createFailed);
    },
  });

  // Reset al cerrar el Dialog.
  React.useEffect(() => {
    if (!open) {
      setValues(EMPTY_VALUES);
      setFieldErrors({});
      setServerError(null);
      setStatus("idle");
    }
  }, [open]);

  function validateLocal(v: FormValues): typeof fieldErrors {
    const errors: typeof fieldErrors = {};
    if (!v.code.trim()) errors.code = messages.prospectos.form.errors.requiredCode;
    else if (!/^[A-Za-z0-9_-]{1,32}$/u.test(v.code))
      errors.code = messages.prospectos.form.errors.invalidCode;
    if (!v.name.trim()) errors.name = messages.prospectos.form.errors.requiredName;
    if (v.email.trim().length > 0) {
      const parsed = emailLike.safeParse(v.email.trim());
      if (!parsed.success) errors.email = messages.prospectos.form.errors.invalidEmail;
    }
    return errors;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localErrors = validateLocal(values);
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;
    setStatus("submitting");
    setServerError(null);
    create.mutate({
      code: values.code.trim(),
      name: values.name.trim(),
      ...(values.company.trim() ? { company: values.company.trim() } : {}),
      ...(values.email.trim() ? { email: values.email.trim() } : {}),
      ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      ...(values.source.trim() ? { source: values.source.trim() } : {}),
      ...(values.medium ? { medium: values.medium } : {}),
    });
  }

  const isSubmitting = status === "submitting" || create.isPending;
  const isSuccess = status === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.prospectos.form.title}</DialogTitle>
          <DialogDescription>
            {messages.prospectos.form.subtitle}
          </DialogDescription>
        </DialogHeader>
        <form
          id="prospecto-form"
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-code">
                {messages.prospectos.code}
              </Label>
              <Input
                id="prospecto-form-code"
                name="code"
                autoComplete="off"
                required
                aria-invalid={fieldErrors.code ? true : undefined}
                aria-describedby={
                  fieldErrors.code
                    ? "prospecto-form-code-error"
                    : "prospecto-form-code-hint"
                }
                value={values.code}
                onChange={(e) =>
                  setValues((v) => ({ ...v, code: e.target.value }))
                }
                disabled={isSubmitting}
              />
              {fieldErrors.code ? (
                <p
                  id="prospecto-form-code-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.code}
                </p>
              ) : (
                <p
                  id="prospecto-form-code-hint"
                  className="text-xs text-muted-foreground"
                >
                  {messages.prospectos.form.codeHint}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-name">
                {messages.prospectos.name}
              </Label>
              <Input
                id="prospecto-form-name"
                name="name"
                autoComplete="off"
                required
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={
                  fieldErrors.name
                    ? "prospecto-form-name-error"
                    : "prospecto-form-name-hint"
                }
                value={values.name}
                onChange={(e) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
                disabled={isSubmitting}
              />
              {fieldErrors.name ? (
                <p
                  id="prospecto-form-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.name}
                </p>
              ) : (
                <p
                  id="prospecto-form-name-hint"
                  className="text-xs text-muted-foreground"
                >
                  {messages.prospectos.form.nameHint}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-company">
                {messages.prospectos.company}
              </Label>
              <Input
                id="prospecto-form-company"
                name="company"
                autoComplete="organization"
                aria-describedby="prospecto-form-company-hint"
                value={values.company}
                onChange={(e) =>
                  setValues((v) => ({ ...v, company: e.target.value }))
                }
                disabled={isSubmitting}
              />
              <p
                id="prospecto-form-company-hint"
                className="text-xs text-muted-foreground"
              >
                {messages.prospectos.form.companyHint}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-email">
                {messages.prospectos.email}
              </Label>
              <Input
                id="prospecto-form-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email
                    ? "prospecto-form-email-error"
                    : "prospecto-form-email-hint"
                }
                value={values.email}
                onChange={(e) =>
                  setValues((v) => ({ ...v, email: e.target.value }))
                }
                disabled={isSubmitting}
              />
              {fieldErrors.email ? (
                <p
                  id="prospecto-form-email-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldErrors.email}
                </p>
              ) : (
                <p
                  id="prospecto-form-email-hint"
                  className="text-xs text-muted-foreground"
                >
                  {messages.prospectos.form.emailHint}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-phone">
                {messages.prospectos.phone}
              </Label>
              <Input
                id="prospecto-form-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                aria-describedby="prospecto-form-phone-hint"
                value={values.phone}
                onChange={(e) =>
                  setValues((v) => ({ ...v, phone: e.target.value }))
                }
                disabled={isSubmitting}
              />
              <p
                id="prospecto-form-phone-hint"
                className="text-xs text-muted-foreground"
              >
                {messages.prospectos.form.phoneHint}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="prospecto-form-source">
                {messages.prospectos.source}
              </Label>
              <Input
                id="prospecto-form-source"
                name="source"
                autoComplete="off"
                aria-describedby="prospecto-form-source-hint"
                value={values.source}
                onChange={(e) =>
                  setValues((v) => ({ ...v, source: e.target.value }))
                }
                disabled={isSubmitting}
              />
              <p
                id="prospecto-form-source-hint"
                className="text-xs text-muted-foreground"
              >
                {messages.prospectos.form.sourceHint}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="prospecto-form-medium">
              {messages.prospectos.medium}
            </Label>
            <select
              id="prospecto-form-medium"
              name="medium"
              aria-describedby="prospecto-form-medium-hint"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={values.medium}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  medium: e.target.value as FormValues["medium"],
                }))
              }
              disabled={isSubmitting}
            >
              {MEDIUM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === ""
                    ? messages.prospectos.mediumPlaceholder
                    : messages.medios[opt.labelKey]}
                </option>
              ))}
            </select>
            <p
              id="prospecto-form-medium-hint"
              className="text-xs text-muted-foreground"
            >
              {messages.prospectos.form.mediumHint}
            </p>
          </div>

          {serverError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="prospecto-form-server-error"
            >
              {serverError}
            </p>
          ) : null}

          {isSuccess ? (
            <p
              role="status"
              className="text-sm text-primary"
              data-testid="prospecto-form-success"
            >
              {messages.prospectos.form.success}
            </p>
          ) : null}
        </form>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {messages.prospectos.form.cancel}
          </Button>
          <Button
            type="submit"
            form="prospecto-form"
            disabled={isSubmitting}
            data-testid="prospecto-form-submit"
          >
            {isSubmitting
              ? messages.prospectos.form.submitting
              : messages.prospectos.form.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}