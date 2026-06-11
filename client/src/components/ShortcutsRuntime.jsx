import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { _registerNavigate, installRuntime } from '../lib/shortcuts.js';

let runtimeInstalled = false;

// Mounts once inside the router so shortcuts can use React Router navigate.
export default function ShortcutsRuntime() {
  const navigate = useNavigate();

  useEffect(() => {
    _registerNavigate(navigate);
    if (!runtimeInstalled) {
      installRuntime();
      runtimeInstalled = true;
    }
    return () => _registerNavigate(null);
  }, [navigate]);

  return null;
}
