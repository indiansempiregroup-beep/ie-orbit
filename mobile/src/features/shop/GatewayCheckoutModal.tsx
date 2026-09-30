import React, { useMemo, useRef } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { MerchantCashfreeCheckout, MerchantRazorpayCheckout } from '@ie-orbit/sdk';
import { colors, spacing, typography } from '../../theme/tokens';
import {
  cashfreeCheckoutHtml,
  openCashfreeCheckoutWeb,
  openRazorpayCheckoutWeb,
  razorpayCheckoutHtml,
  type CashfreeCheckoutResult,
  type RazorpayCheckoutResult,
} from './gatewayCheckout';

type Props =
  | {
      visible: boolean;
      provider: 'razorpay';
      checkout: MerchantRazorpayCheckout | null;
      onSuccess: (result: RazorpayCheckoutResult) => void;
      onCancel: (message?: string) => void;
    }
  | {
      visible: boolean;
      provider: 'cashfree';
      checkout: MerchantCashfreeCheckout | null;
      onSuccess: (result: CashfreeCheckoutResult) => void;
      onCancel: (message?: string) => void;
    };

export function GatewayCheckoutModal(props: Props) {
  const { visible, provider, checkout, onCancel } = props;
  const handled = useRef(false);

  const html = useMemo(() => {
    if (!checkout) return '';
    return provider === 'razorpay'
      ? razorpayCheckoutHtml(checkout as MerchantRazorpayCheckout)
      : cashfreeCheckoutHtml(checkout as MerchantCashfreeCheckout);
  }, [checkout, provider]);

  React.useEffect(() => {
    handled.current = false;
    if (!visible || !checkout || Platform.OS !== 'web') return;
    let cancelled = false;
    void (async () => {
      try {
        if (provider === 'razorpay') {
          const result = await openRazorpayCheckoutWeb(checkout as MerchantRazorpayCheckout);
          if (!cancelled) props.onSuccess(result);
        } else {
          const result = await openCashfreeCheckoutWeb(checkout as MerchantCashfreeCheckout);
          if (!cancelled) props.onSuccess(result);
        }
      } catch (err) {
        if (!cancelled) onCancel(err instanceof Error ? err.message : 'Payment cancelled.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, checkout, provider]);

  function onMessage(event: WebViewMessageEvent) {
    if (handled.current) return;
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        message?: string;
        payload?: RazorpayCheckoutResult | CashfreeCheckoutResult;
      };
      if (data.type === 'dismissed') {
        handled.current = true;
        onCancel('Payment window closed. Your order is saved — you can pay from order details.');
        return;
      }
      if (data.type === 'error') {
        handled.current = true;
        onCancel(data.message || 'Payment failed.');
        return;
      }
      if (data.type === 'razorpay_success' && provider === 'razorpay' && data.payload) {
        handled.current = true;
        props.onSuccess(data.payload as RazorpayCheckoutResult);
        return;
      }
      if (data.type === 'cashfree_success' && provider === 'cashfree' && data.payload) {
        handled.current = true;
        props.onSuccess(data.payload as CashfreeCheckoutResult);
      }
    } catch {
      handled.current = true;
      onCancel('Unable to read payment result.');
    }
  }

  if (!visible || !checkout) return null;

  if (Platform.OS === 'web') {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.webOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.webText}>Opening secure payment…</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onCancel()}>
      <View style={styles.nativeWrap}>
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          startInLoadingState
          javaScriptEnabled
          domStorageEnabled
          style={styles.webview}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
    gap: spacing.md,
  },
  webText: { ...typography.body, color: colors.foreground },
  nativeWrap: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl },
  webview: { flex: 1 },
});
