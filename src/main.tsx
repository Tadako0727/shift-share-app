import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './next-shift.css';
import './mobile-form.css';
if('serviceWorker' in navigator) window.addEventListener('load',()=>void navigator.serviceWorker.register('/sw.js').then(registration=>registration.update()));
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
