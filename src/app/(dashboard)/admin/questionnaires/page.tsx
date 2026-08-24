"use client";

import { QuestionnaireEditorView } from "@/modules/admin/questionnaire-editor-view";

/**
 * SPEC-010 AC-7 · Editor visual de cuestionarios (DEC-FUN-45).
 * Página dedicada; la selección interna del cuestionario se hace en
 * la vista (lista + detalle en columnas).
 */
export default function QuestionnaireEditorPage() {
  return <QuestionnaireEditorView />;
}
