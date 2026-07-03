import express, { Router, type Request, type Response } from 'express';
import {
  buildThunderbirdAutoconfig,
  buildOutlookAutodiscover,
  buildAppleMobileconfig,
} from '../../lib/autoconfig';

export interface AutoconfigDeps {
  /** Public IMAP/SMTP FQDN (e.g. mail.example.com). When null the feature is disabled (404). */
  mailHostname: string | null;
  /** True when the panel manages the given (active) domain. */
  isDomainManaged: (domain: string) => boolean;
}

function domainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

/** Public, unauthenticated mail-client auto-configuration endpoints. */
export function autoconfigRouter(deps: AutoconfigDeps) {
  const router = Router();
  const { mailHostname } = deps;

  const resolve = (email: string): { email: string; domain: string } | null => {
    if (!mailHostname) return null;
    const normalized = email.trim().toLowerCase();
    const domain = domainOf(normalized);
    if (!domain || !deps.isDomainManaged(domain)) return null;
    return { email: normalized, domain };
  };

  // Thunderbird / autoconfig — queried at autoconfig.<domain>/mail/config-v1.1.xml
  // and <domain>/.well-known/autoconfig/mail/config-v1.1.xml.
  const thunderbird = (req: Request, res: Response) => {
    const info = resolve(String(req.query.emailaddress ?? ''));
    if (!info || !mailHostname) return void res.status(404).end();
    res
      .type('application/xml')
      .send(buildThunderbirdAutoconfig(info.email, info.domain, mailHostname));
  };
  router.get('/mail/config-v1.1.xml', thunderbird);
  router.get('/.well-known/autoconfig/mail/config-v1.1.xml', thunderbird);

  // Outlook Autodiscover — POSTs an XML body carrying <EMailAddress>. Accept a
  // ?emailaddress query too for easy testing.
  const autodiscover = (req: Request, res: Response) => {
    const fromBody =
      typeof req.body === 'string'
        ? (/<EMailAddress>([^<]+)<\/EMailAddress>/i.exec(req.body)?.[1] ?? '')
        : '';
    const info = resolve(fromBody || String(req.query.emailaddress ?? ''));
    if (!info || !mailHostname) return void res.status(404).end();
    res.type('application/xml').send(buildOutlookAutodiscover(info.email, mailHostname));
  };
  const textBody = express.text({ type: () => true, limit: '64kb' });
  router.post('/autodiscover/autodiscover.xml', textBody, autodiscover);
  router.post('/Autodiscover/Autodiscover.xml', textBody, autodiscover);

  // Apple .mobileconfig download.
  router.get('/mail/mobileconfig', (req: Request, res: Response) => {
    const info = resolve(String(req.query.email ?? ''));
    if (!info || !mailHostname) return void res.status(404).end();
    res.type('application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', `attachment; filename="${info.domain}-mail.mobileconfig"`);
    res.send(buildAppleMobileconfig(info.email, info.domain, mailHostname));
  });

  return router;
}
