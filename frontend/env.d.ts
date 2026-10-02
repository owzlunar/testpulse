/// <reference types="vite/client" />

// Which API implementation each module uses (MOCK) and whether its pages are on (ON): set by
// vite.config.ts (apiDefines) at build time
declare const __API_MOCK_AI__: boolean
declare const __API_MOCK_AUDIT__: boolean
declare const __API_MOCK_AUTH__: boolean
declare const __API_MOCK_DEFECT__: boolean
declare const __API_MOCK_DOCUMENT__: boolean
declare const __API_MOCK_FILE__: boolean
declare const __API_MOCK_NOTIFICATION__: boolean
declare const __API_MOCK_PROJECT__: boolean
declare const __API_MOCK_REQUIREMENT__: boolean
declare const __API_MOCK_ROLE__: boolean
declare const __API_MOCK_RUN__: boolean
declare const __API_MOCK_SETTINGS__: boolean
declare const __API_MOCK_TEAM__: boolean
declare const __API_MOCK_TEMPLATE__: boolean
declare const __API_MOCK_TEST_CASE__: boolean
declare const __API_MOCK_USER__: boolean
declare const __API_ON_AI__: boolean
declare const __API_ON_AUDIT__: boolean
declare const __API_ON_AUTH__: boolean
declare const __API_ON_DEFECT__: boolean
declare const __API_ON_DOCUMENT__: boolean
declare const __API_ON_FILE__: boolean
declare const __API_ON_NOTIFICATION__: boolean
declare const __API_ON_PROJECT__: boolean
declare const __API_ON_REQUIREMENT__: boolean
declare const __API_ON_ROLE__: boolean
declare const __API_ON_RUN__: boolean
declare const __API_ON_SETTINGS__: boolean
declare const __API_ON_TEAM__: boolean
declare const __API_ON_TEMPLATE__: boolean
declare const __API_ON_TEST_CASE__: boolean
declare const __API_ON_USER__: boolean
declare const __API_ANY_MOCK__: boolean

interface ImportMetaEnv {
  /** rest | mock (unset: rest in a production build, mock otherwise) */
  readonly VITE_API_MODE?: string
  /** rest mode: the modules that are on, comma-separated (unset: every module with a rest implementation) */
  readonly VITE_API_REST?: string
}
