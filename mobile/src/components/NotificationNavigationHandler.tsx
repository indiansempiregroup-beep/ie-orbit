import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import type { RootStackParamList } from '../navigation/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function notificationKey(data: Record<string, unknown>) {
  return [
    data.notification_id,
    data.order_id,
    data.return_id,
    data.booking_id,
    data.pet_id,
  ]
    .map((value) => String(value || ''))
    .join(':');
}

function openTrackingUrl(data: Record<string, unknown>) {
  const url = String(data.tracking_url || '').trim();
  if (!url) return false;
  void Linking.openURL(url);
  return true;
}

function navigateFromNotificationData(data: Record<string, unknown>, actionId?: string) {
  if (!navigationRef.isReady()) return false;

  if (actionId === 'track') {
    if (openTrackingUrl(data)) return true;
  }

  const returnId = String(data.return_id || '').trim();
  if (returnId) {
    navigationRef.dispatch(CommonActions.navigate('ReturnDetail', { returnId }));
    return true;
  }

  const orderId = String(data.order_id || '').trim();
  if (orderId) {
    navigationRef.dispatch(CommonActions.navigate('ShopOrderDetail', { orderId }));
    return true;
  }

  const bookingId = String(data.booking_id || '').trim();
  if (bookingId) {
    navigationRef.dispatch(CommonActions.navigate('BookingDetail', { bookingId }));
    return true;
  }

  const petId = String(data.pet_id || '').trim();
  if (petId) {
    navigationRef.dispatch(CommonActions.navigate('PetDetail', { petId }));
    return true;
  }

  return false;
}

export function NotificationNavigationHandler() {
  const { user } = useAuth();
  const { loading } = useBootstrap();
  const handledRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!user || loading) return;
    if (!pendingRef.current) return;
    const data = pendingRef.current;
    pendingRef.current = null;
    const key = notificationKey(data);
    if (handledRef.current.has(key)) return;
    if (navigateFromNotificationData(data)) {
      handledRef.current.add(key);
    }
  }, [user, loading]);

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
      const key = notificationKey(data);
      if (handledRef.current.has(key)) return;
      if (!user || loading) {
        pendingRef.current = data;
        return;
      }
      if (navigateFromNotificationData(data, response.actionIdentifier)) {
        handledRef.current.add(key);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [user, loading]);

  return null;
}
