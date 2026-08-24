/**
 * Barrel del módulo de servicios de Clientes/Prospectos (SPEC-002).
 */
export {
  createProspectsService,
  resolveProspectScope,
  canTransition,
  type ProspectDTO,
  type ProspectsService,
  type ProspectScope,
} from "./prospects";
export {
  createClientsService,
  isValidArchiveReason,
  type ClientDTO,
  type ClientsService,
} from "./clients";
export {
  createClientContactsService,
  type ClientContactDTO,
  type ClientContactsService,
} from "./contacts";
export {
  createClientFiscalDataService,
  isValidRfc,
  countFiscalForClient,
  type ClientFiscalDataDTO,
  type ClientFiscalDataService,
} from "./fiscal";