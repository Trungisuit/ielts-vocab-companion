import React from 'react';
import { createRoot } from 'react-dom/client';
import { installMobileApiIfNeeded } from './mobile-api.js';
import App from './App.jsx';
import './styles.css';

installMobileApiIfNeeded();

createRoot(document.getElementById('root')).render(<App />);

