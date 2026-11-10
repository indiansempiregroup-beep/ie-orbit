type SocialId = 'instagram' | 'linkedin' | 'facebook' | 'youtube' | 'x' | 'whatsapp';

export function PublicSocialIcon({ id, title }: { id: string; title: string }) {
  switch (id as SocialId) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <defs>
            <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f58529" />
              <stop offset="30%" stopColor="#dd2a7b" />
              <stop offset="60%" stopColor="#8134af" />
              <stop offset="100%" stopColor="#515bd4" />
            </linearGradient>
          </defs>
          <path
            fill="url(#ig-grad)"
            d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
          />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <path
            fill="#0A66C2"
            d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"
          />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <path
            fill="#1877F2"
            d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.56-4.7 1.32 0 2.7.24 2.7.24v2.97h-1.52c-1.5 0-1.97.93-1.97 1.89v2.27h3.35l-.54 3.49h-2.81V24C19.61 23.09 24 18.1 24 12.07z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <path
            fill="#FF0000"
            d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14C4.5 20.5 12 20.5 12 20.5s7.5 0 9.38-.56a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8z"
          />
          <path fill="#fff" d="M9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <path
            fill="#111111"
            d="M18.9 2H22l-6.83 7.81L23.25 22h-6.65l-5.2-6.8L5.4 22H2.28l7.3-8.35L.75 2h6.81l4.7 6.2L18.9 2zm-1.17 18h1.84L6.38 3.9H4.4L17.73 20z"
          />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <path
            fill="#25D366"
            d="M12.04 2a9.9 9.9 0 0 0-8.5 14.94L2 22l5.2-1.36A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 0 1 6.9 12.3l-.3.47.34 1.95-1.98-.35-.46.28a8.1 8.1 0 1 1-4.5-14.65zm-3.3 3.5c-.2 0-.52.08-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.08 3.33 5.14 4.54 2.54 1 3.06.8 3.61.75.55-.05 1.78-.73 2.03-1.43.25-.7.25-1.3.17-1.43-.07-.13-.27-.2-.57-.35-.3-.15-1.78-.88-2.05-.98-.27-.1-.47-.15-.67.15-.2.3-.77.98-.95 1.18-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5z"
          />
        </svg>
      );
    default:
      return null;
  }
}
