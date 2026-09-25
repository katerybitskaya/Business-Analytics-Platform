import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = document.querySelector('.main-content');
    if (el) el.scrollTop = 0;
  }, [pathname]);
  return null;
}
