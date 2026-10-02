import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import AccountGate from './AccountGate'
import './styles.css'
import './numbering.css'

registerSW({ immediate: true })
createRoot(document.getElementById('root')!).render(<StrictMode><AccountGate /></StrictMode>)
