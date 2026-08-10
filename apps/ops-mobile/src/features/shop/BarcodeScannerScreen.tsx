import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { colors, fonts, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopProduct } from '@ie-platform/sdk';
import { addProductToPosSession, readPosSession } from './posSession';

type Props = NativeStackScreenProps<RootStackParamList, 'BarcodeScanner'>;
type ScanHandler = (event: { data: string }) => void;

function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

function returnToPos(navigation: NativeStackNavigationProp<RootStackParamList>) {
  navigation.dispatch((state) => {
    const posIndex = state.routes.findIndex((route) => route.name === 'ShopPos');
    if (posIndex >= 0) {
      return CommonActions.reset({
        ...state,
        routes: state.routes.slice(0, posIndex + 1),
        index: posIndex,
      });
    }
    return CommonActions.navigate({ name: 'ShopPos' });
  });
}

/**
 * Camera preview stays mounted once. Parent overlay state updates must not remount this,
 * or Expo Camera flickers / restarts the session.
 */
const StableBarcodeCamera = React.memo(function StableBarcodeCamera({
  handlerRef,
}: {
  handlerRef: React.MutableRefObject<ScanHandler>;
}) {
  const onBarcodeScanned = useCallback<ScanHandler>((event) => {
    handlerRef.current(event);
  }, [handlerRef]);

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{
        barcodeTypes: ['ean13', 'ean8', 'code128', 'qr', 'upc_a', 'upc_e', 'code39'],
      }}
      onBarcodeScanned={onBarcodeScanned}
    />
  );
});

export function BarcodeScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [lastProduct, setLastProduct] = useState<ShopProduct | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [billLines, setBillLines] = useState(() => readPosSession().basket.length);
  const forPos = route.params?.target === 'pos';
  const forAddProduct = route.params?.target === 'addProduct';

  const suppressCodeRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const handlerRef = useRef<ScanHandler>(() => undefined);

  // Keep latest closure without changing CameraView props.
  handlerRef.current = (event) => {
    void (async () => {
      if (!client || !businessId || busyRef.current) return;
      const code = normalizeCode(event.data);
      if (!code) return;

      if (forPos && suppressCodeRef.current === code) {
        return;
      }

      busyRef.current = true;
      try {
        if (forPos) {
          const response = await client.shop.lookupBarcode({ business_id: businessId, code });
          const basket = addProductToPosSession(response.data, code);
          suppressCodeRef.current = code;
          const line = basket.find((row) => row.product.id === response.data.id);
          setLastProduct(response.data);
          setAddedCount((count) => count + 1);
          setBillLines(basket.length);
          setMessage(
            `Added ${response.data.name}${
              line && line.quantity > 1 ? ` (×${line.quantity})` : ''
            }. Point at the next product.`,
          );
          return;
        }
        if (forAddProduct) {
          // Return to the existing product form (edit or add) — never open a blank new form.
          navigation.dispatch((state) => {
            const formIndex = state.routes.findIndex((entry) => entry.name === 'ShopProductAdd');
            if (formIndex >= 0) {
              const routes = state.routes.slice(0, formIndex + 1).map((entry, index) => {
                if (index !== formIndex) return entry;
                const previous = (entry.params ?? {}) as {
                  enrichCode?: string;
                  productId?: string;
                  returnTo?: 'pos';
                };
                return {
                  ...entry,
                  params: {
                    ...previous,
                    enrichCode: code,
                    ...(route.params?.productId ? { productId: route.params.productId } : {}),
                  },
                };
              });
              return CommonActions.reset({
                ...state,
                routes,
                index: formIndex,
              });
            }
            return CommonActions.navigate({
              name: 'ShopProductAdd',
              params: {
                enrichCode: code,
                ...(route.params?.productId ? { productId: route.params.productId } : {}),
              },
            });
          });
          return;
        }
        const response = await client.shop.lookupBarcode({ business_id: businessId, code });
        setLastProduct(response.data);
        setMessage(`Found: ${response.data.name}`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Barcode not found');
      } finally {
        busyRef.current = false;
      }
    })();
  };

  if (!permission) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Camera</Text>
        <Text style={styles.meta}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Camera scan</Text>
        <Text style={styles.meta}>
          Allow camera access to scan product barcodes and RFID EPC labels.
        </Text>
        <Pressable style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StableBarcodeCamera handlerRef={handlerRef} />
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.statusPanel}>
          <Text style={styles.titleLight}>
            {forPos
              ? 'Scan into sale basket'
              : forAddProduct
                ? 'Scan barcode to add product'
                : 'Scan barcode / RFID'}
          </Text>
          {forPos ? (
            <Text style={styles.metaLight}>
              Move to the next product after each add. Holding still won’t add the same item again.
            </Text>
          ) : null}
          {forPos ? (
            <Text style={styles.statLine}>
              Scanned {addedCount} · bill has {billLines} line{billLines === 1 ? '' : 's'}
            </Text>
          ) : null}
          {lastProduct ? (
            <Text style={styles.statLine}>
              Last: {lastProduct.name} · {lastProduct.price}
            </Text>
          ) : null}
          {message ? <Text style={styles.messageLine}>{message}</Text> : null}
          {forPos && lastProduct ? (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                const basket = addProductToPosSession(lastProduct);
                setAddedCount((count) => count + 1);
                setBillLines(basket.length);
                const line = basket.find((row) => row.product.id === lastProduct.id);
                setMessage(`Added another ${lastProduct.name}${line ? ` (×${line.quantity})` : ''}.`);
              }}
            >
              <Text style={styles.buttonText}>Add another of last item</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.button}
            onPress={() => {
              if (forPos) {
                returnToPos(navigation);
              } else {
                navigation.goBack();
              }
            }}
          >
            <Text style={styles.buttonText}>{forPos ? 'Back to bill' : 'Done'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    backgroundColor: 'transparent',
  },
  statusPanel: {
    backgroundColor: 'rgba(10, 12, 16, 0.92)',
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, marginBottom: spacing.md },
  titleLight: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  meta: { color: colors.mutedForeground },
  metaLight: {
    color: '#E8ECF2',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  statLine: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  messageLine: {
    color: '#B8F5C5',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtn: {
    marginTop: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
