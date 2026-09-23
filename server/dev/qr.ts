import QRCode from 'qrcode';
import { defineEventHandler, setResponseHeader } from 'h3';
import { apkUrls } from './lan';

/**
 * The APK's download URL as an SVG QR code, generated server-side so `qrcode`
 * never reaches the client bundle — the install page just points an `<img>`
 * at this route.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'content-type', 'image/svg+xml');

  const [primary] = apkUrls(event);
  if (!primary) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img" aria-label="No LAN IPv4 address found"><text x="12" y="120" font-size="14">No LAN address found</text></svg>';
  }
  return QRCode.toString(primary, { type: 'svg', margin: 1, width: 240 });
});
