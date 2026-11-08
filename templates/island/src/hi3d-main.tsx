import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './hi3d-app';
import './hi3d-style.css';
import './hi3d-glass.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
