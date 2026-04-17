import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function Placeholder(): React.JSX.Element {
  return <div className="p-8 text-xl">Mynah dashboard scaffolding OK</div>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
