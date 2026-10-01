import { ref } from 'vue'

export interface SnackbarState {
  show: boolean
  text: string
  color: string
}

// Page-level toast:  const { snackbar, notify } = useSnackbar()
//   <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
export function useSnackbar() {
  const snackbar = ref<SnackbarState>({ show: false, text: '', color: 'success' })
  const notify = (text: string, color = 'success') => {
    snackbar.value = { show: true, text, color }
  }
  return { snackbar, notify }
}
