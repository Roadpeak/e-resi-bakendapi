/**
 * Just enough user-agent parsing for a traffic report — device class, OS and
 * browser family. Order matters: Edge and Opera carry "Chrome", Chrome
 * carries "Safari", and iPadOS can pose as a Mac.
 */
export interface ParsedAgent {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: string | null;
  browser: string | null;
  isBot: boolean;
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|go-http|java\//i;

export function parseUserAgent(ua: string | undefined | null): ParsedAgent {
  const s = ua ?? '';
  const isBot = !s || BOT.test(s);

  const tablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s);
  const mobile = !tablet && /mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(s);

  const os = /windows nt/i.test(s) ? 'Windows'
    : /iphone|ipad|ipod/i.test(s) ? 'iOS'
    : /android/i.test(s) ? 'Android'
    : /cros/i.test(s) ? 'ChromeOS'
    : /mac os x|macintosh/i.test(s) ? 'macOS'
    : /linux/i.test(s) ? 'Linux'
    : null;

  const browser = /edg(e|a|ios)?\//i.test(s) ? 'Edge'
    : /opr\/|opera/i.test(s) ? 'Opera'
    : /samsungbrowser/i.test(s) ? 'Samsung Internet'
    : /fban|fbav|instagram/i.test(s) ? 'In-app (Meta)'
    : /firefox|fxios/i.test(s) ? 'Firefox'
    : /chrome|crios/i.test(s) ? 'Chrome'
    : /safari/i.test(s) ? 'Safari'
    : null;

  return { deviceType: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', os, browser, isBot };
}
