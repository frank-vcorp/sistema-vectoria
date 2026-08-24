/**
 * Barrel del módulo de servicios de Finanzas y Movimientos
 * (SPEC-009 / B21/B26). Los routers tRPC importan desde aquí.
 *
 * Servicios:
 *  - `transactions` (SPEC-009 AC-1, AC-2, AC-7..AC-10): CRUD + estados.
 *  - `transfers` (AC-2): entrada+salida vinculadas.
 *  - `finance` (AC-3..AC-6, AC-9, AC-10): projectCost/Margin/
 *    profitabilityByTechnician/osOutstandingBalance.
 *  - `helpers` (puros): transiciones, clasificación, balances,
 *    costo/margen/rentabilidad, osOutstandingBalance.
 */
export {
  createFinancesService,
  type FinancesService,
  type AccountDTO,
  type TransactionDTO,
  type TransferDTO,
  type DirectCostDTO,
  type CreateFinancesServiceOptions,
} from "./finanzas-service";

export {
  canTransitionTransaction,
  isReconciledImmutably,
  isOperativeTransaction,
  isNonOperativeSubKind,
  validateSubKind,
  isTransactionAdmittedForDirectCost,
  validateDirectCostInput,
  computeAccountBalance,
  computeLaborCost,
  computeDirectCost,
  buildProjectCostSummary,
  buildProjectFinancialReport,
  computeOsOutstandingBalance,
  isAccountTypeValid,
  isTransactionTypeValid,
  type TransactionTransitionError,
  type DirectCostValidationError,
  type AccountBalance,
  type TimeEntryCostInput,
  type ProjectTechnicianBreakdown,
  type ProjectCostSummary,
  type ProjectFinancialReport,
  type OsBalanceInput,
} from "./helpers";
