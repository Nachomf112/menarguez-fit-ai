import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AccesoGate } from './acceso/Acceso';
import './ui/styles.css';

const el = document.getElementById('root');
if (el) createRoot(el).render(<AccesoGate><App /></AccesoGate>);
