import { h } from 'vue'
import type { IconProps, IconSet, ThemeDefinition } from 'vuetify'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { fa } from 'vuetify/iconsets/fa'

// Tabler Icons (webfont) -> use as  icon="tabler:home"  (renders <i class="ti ti-home">)
const tabler: IconSet = {
  component: (props: IconProps) => h(props.tag, { class: ['ti', `ti-${props.icon}`] }),
}

// ---------------------------------------------------------------------------
// Colors: taken from "Colors - Blue Version.png" in the Fox kit
// ---------------------------------------------------------------------------
const light: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#FAFAFA', // page background (estimated from screenshots)
    surface: '#FFFFFF',
    'on-surface': '#11142D', // main text

    primary: '#1E4DB7',
    secondary: '#67757C',
    info: '#1A9BFC',
    accent: '#0BB2FB',
    success: '#39CB7F',
    warning: '#FEC90F',
    error: '#FC4B6C',
    // TestPulse: orange between warning and error (blocked cases, high priority, churn)
    caution: '#FB8C3C',

    // extra tokens -> usable as  text-muted / bg-light-primary  etc.
    muted: '#777E89',
    'light-primary': '#E4EAF6', // primary @ 12% on white
    'light-info': '#E4F3FF',
    'light-success': '#E7F9F0',
    'light-warning': '#FFF9E2',
    'light-error': '#FFE9ED',
    'light-caution': '#FFF0E5',
  },
  variables: {
    'border-color': '#11142D',
    'border-opacity': 0.12,
  },
}

// NOTE: the Fox screenshots only show the light UI. This dark theme is an
// estimate so the moon toggle in the header has something to switch to.
const dark: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#0E1020',
    surface: '#151833',
    'on-surface': '#E6E8F2',

    primary: '#4C7BEA',
    secondary: '#8A97A0',
    info: '#1A9BFC',
    accent: '#0BB2FB',
    success: '#39CB7F',
    warning: '#FEC90F',
    error: '#FC4B6C',
    caution: '#FF9F5A',

    muted: '#9AA1B0',
    'light-primary': '#1E2A55',
    'light-info': '#14304A',
    'light-success': '#16372B',
    'light-warning': '#3A3213',
    'light-error': '#40202A',
    'light-caution': '#3E2A1A',
  },
  variables: {
    'border-color': '#FFFFFF',
    'border-opacity': 0.12,
  },
}

// Shared look for every text-like field
const field = {
  variant: 'outlined',
  density: 'comfortable',
  color: 'primary',
  hideDetails: 'auto',
} as const

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: { light, dark },
  },

  // Component defaults = change the look once, applies everywhere
  defaults: {
    VBtn: { elevation: 0, rounded: 'lg' },
    VChip: { label: true },

    VTextField: field,
    VTextarea: field,
    VSelect: field,
    VAutocomplete: field,
    VCombobox: field,
    VFileInput: field,

    VCheckbox: { color: 'primary', density: 'comfortable', hideDetails: 'auto' },
    VRadioGroup: { color: 'primary', hideDetails: 'auto' },
    VSwitch: { color: 'primary', density: 'comfortable', hideDetails: 'auto' },
    VSlider: { color: 'info', thumbColor: 'primary', trackSize: 6, hideDetails: true },
    VRangeSlider: { color: 'info', thumbColor: 'primary', trackSize: 6, hideDetails: true },

    VList: { nav: true },

    VAvatar: { variant: 'tonal' },
    VBadge: { color: 'error', dotColor: 'error' },
    VTooltip: { location: 'top' },
    VMenu: { offset: 8 },
    VDialog: { maxWidth: 640, scrollable: true },
    VDataTable: { hover: true, density: 'comfortable' },
    VDivider: { opacity: 0.08 },
    VTabs: { color: 'primary' },
    VSnackbar: { location: 'top right', timeout: 2500 },
    VFooter: { color: 'transparent' },
    VAppBar: { flat: true },
  },

  icons: {
    defaultSet: 'mdi',
    aliases,
    // mdi:  icon="mdi-home"            (default set)
    // tabler: icon="tabler:home"
    // fa:   icon="fa:fas fa-house"
    sets: { mdi, fa, tabler },
  },
})
