/// <reference types="vite/client" />

// Which API implementation each module uses: set by vite.config.ts (apiDefines) at build time
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
declare const __API_ANY_MOCK__: boolean

interface ImportMetaEnv {
  /** mock | real (default mock) */
  readonly VITE_API_MODE?: string
  /** modules kept on the mock in real mode, comma-separated (e.g. test-case,run) */
  readonly VITE_API_MOCK?: string
}
