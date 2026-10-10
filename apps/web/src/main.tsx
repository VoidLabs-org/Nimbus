import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
// Notifications styles must come after core styles
import '@mantine/notifications/styles.css'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { theme } from '@repo/ui/theme'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <App />
    </MantineProvider>
  </StrictMode>,
)
