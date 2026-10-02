// Preferences kept in this browser only (not API data).

const SELECTED_PROJECT = 'testpulse_selected_project_id'

/** last project the user worked on */
export const loadSelectedProjectId = (): string | null => localStorage.getItem(SELECTED_PROJECT)
export const saveSelectedProjectId = (id: string) => localStorage.setItem(SELECTED_PROJECT, id)
