/** Bridges PaymentProofCameraScreen → BookingDetail collect flow. */
type ProofAsset = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileName?: string;
};

type Listener = (asset: ProofAsset | null) => void;

let listener: Listener | null = null;

export function setPaymentProofCaptureListener(next: Listener | null) {
  listener = next;
}

export function publishPaymentProofCapture(asset: ProofAsset | null) {
  listener?.(asset);
}
