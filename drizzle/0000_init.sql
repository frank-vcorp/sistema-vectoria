/**
 * Migración inicial (Drizzle Kit).
 *
 * Esta migración la genera `pnpm db:generate`. La incluimos como plantilla
 * SQL de referencia; en operación se usa la generada por Drizzle Kit.
 *
 * NOTA: Las migraciones RLS viven aparte (`xxxx_enable_rls.sql`) y NO se
 * aplican en MVP (AC-12, AC-40).
 */
-- Versión inicial generada por Drizzle Kit (placeholder; en operación se regenera).
-- Esta migración NO se ejecuta automáticamente en MVP sin `pnpm db:migrate`.

-- 1) Tabla raíz (excepción PK simple, ADR-02 §8.3).
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'MXN',
  "locale" text NOT NULL DEFAULT 'es-MX',
  "timezone" text NOT NULL DEFAULT 'America/Mexico_City',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 2) Tablas de plataforma (PK compuesta (organization_id, id), ADR-02 §8.3).
--    (Resumen; Drizzle Kit emite el SQL completo en la migración generada.)
