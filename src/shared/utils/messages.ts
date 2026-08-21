/**
 * Catálogo de mensajes es-MX (DEC-FUN-39, AC-68). Las cadenas de UI viven
 * aquí; los componentes NO embeben literales.
 */
export const messages = {
  app: {
    name: "Vector IA Administración",
    tagline: "Plataforma operativa",
  },
  auth: {
    login: "Iniciar sesión",
    logout: "Cerrar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    invalidCredentials: "Credenciales inválidas",
    accountLocked: "Cuenta bloqueada temporalmente. Intenta más tarde.",
    loginError: "No fue posible iniciar sesión",
    sessionExpired: "Tu sesión ha expirado. Inicia sesión nuevamente.",
  },
  nav: {
    dashboard: "Panel",
    users: "Usuarios",
    roles: "Roles y permisos",
    fiscalConfig: "Configuración fiscal",
    notifications: "Notificaciones",
    audit: "Auditoría",
    jobs: "Jobs",
  },
  roles: {
    director: "Director",
    vendedor: "Vendedor",
    administrador: "Administrador",
    lider_proyecto: "Líder de proyecto",
    programador: "Programador",
    disenador: "Diseñador",
    qa: "QA",
  },
  common: {
    save: "Guardar",
    cancel: "Cancelar",
    create: "Crear",
    edit: "Editar",
    delete: "Eliminar",
    back: "Atrás",
    loading: "Cargando…",
    error: "Ocurrió un error",
    confirm: "Confirmar",
  },
  fiscal: {
    title: "Configuración fiscal de la organización",
    rfc: "RFC",
    razonSocial: "Razón social",
    regimen: "Régimen fiscal",
    pacApiKey: "API key del PAC",
    csdPassword: "Contraseña del CSD",
    csdCer: "Certificado (.cer)",
    csdPem: "Llave privada (.pem)",
    notEditable: "Solo el Director puede editar la configuración fiscal.",
  },
  audit: {
    title: "Bitácora de auditoría",
    empty: "No hay eventos para mostrar",
    filterEntity: "Filtrar por entidad",
    filterAction: "Filtrar por acción",
    filterDate: "Filtrar por fecha",
  },
  notifications: {
    title: "Notificaciones",
    empty: "Sin notificaciones pendientes",
    markRead: "Marcar como leída",
  },
  errors: {
    networkError: "Error de red. Verifica tu conexión.",
    forbidden: "No tienes permisos para realizar esta acción.",
    notFound: "Recurso no encontrado.",
    unknown: "Algo salió mal. Intenta de nuevo.",
  },
} as const;

export type Messages = typeof messages;
