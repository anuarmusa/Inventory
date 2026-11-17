import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Draws `text` as a QR code (an inline SVG), for the app's camera to scan from another screen. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((markup) => current && setSvg(markup))
      .catch(() => current && setSvg(null));
    return () => {
      current = false;
    };
  }, [text]);

  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
