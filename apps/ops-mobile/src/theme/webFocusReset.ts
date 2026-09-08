import { Platform } from 'react-native';
import { brand } from './tokens';

/** Kill the browser’s nested blue focus ring on Expo web. */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const id = 'ie-orbit-web-focus-reset';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      input, textarea, select {
        outline: none !important;
      }
      input:focus, textarea:focus, select:focus, input:focus-visible, textarea:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }
      button:focus, button:focus-visible, [role="button"]:focus {
        outline: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  const sidebarId = 'ie-orbit-web-sidebar';
  let sidebarStyle = document.getElementById(sidebarId) as HTMLStyleElement | null;
  if (!sidebarStyle) {
    sidebarStyle = document.createElement('style');
    sidebarStyle.id = sidebarId;
    document.head.appendChild(sidebarStyle);
  }
  sidebarStyle.textContent = `
    .ie-orbit-desktop-sidebar {
      background-color: ${brand.sidebarWeb} !important;
    }
  `;
}
