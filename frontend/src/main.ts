import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Order matters: icon fonts -> typeface -> Vuetify -> Fox overrides
import '@mdi/font/css/materialdesignicons.css'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/500.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/noto-sans-thai/700.css'
import 'vuetify/styles'
import './styles/main.scss'
import './styles/fullcalendar.scss'

import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app')
