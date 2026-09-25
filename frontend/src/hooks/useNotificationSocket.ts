import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { TokenStorage } from '@/api/api';
import { t } from '@/i18n/i18n';

interface ServerNotification {
  type?: string;
}

export function useNotificationSocket() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    const token = TokenStorage.getAccess();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/ws/notifications?token=${token}`);

    socket.onmessage = (event) => {
      let data: ServerNotification;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === 'guest_reset') {
        showToast(t('notifications.guest_reset'), 'success');
        if (location.pathname.startsWith('/analyses/')) navigate('/dashboard');
      }
    };

    return () => socket.close();
  }, [user?.id]);
}
