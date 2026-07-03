import { randomUUID } from 'node:crypto';

/**
 * Builders for mail-client auto-configuration documents. Given an email address
 * and the mail server FQDN, produce the Thunderbird autoconfig XML, the Outlook
 * Autodiscover XML, and an Apple `.mobileconfig` profile. IMAP is 993/SSL and
 * SMTP submission is 587/STARTTLS (docker-mailserver defaults).
 */

export const IMAP_PORT = 993;
export const SMTP_PORT = 587;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Thunderbird / autoconfig (`mail/config-v1.1.xml`). */
export function buildThunderbirdAutoconfig(email: string, domain: string, host: string): string {
  const e = xmlEscape(email);
  const d = xmlEscape(domain);
  const h = xmlEscape(host);
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${d}">
    <domain>${d}</domain>
    <displayName>${d} Mail</displayName>
    <displayShortName>${d}</displayShortName>
    <incomingServer type="imap">
      <hostname>${h}</hostname>
      <port>${IMAP_PORT}</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>${e}</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>${h}</hostname>
      <port>${SMTP_PORT}</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
      <username>${e}</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>
`;
}

/** Outlook Autodiscover (`autodiscover/autodiscover.xml`). */
export function buildOutlookAutodiscover(email: string, host: string): string {
  const e = xmlEscape(email);
  const h = xmlEscape(host);
  return `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>
      <Protocol>
        <Type>IMAP</Type>
        <Server>${h}</Server>
        <Port>${IMAP_PORT}</Port>
        <SSL>on</SSL>
        <Encryption>SSL</Encryption>
        <LoginName>${e}</LoginName>
        <SPA>off</SPA>
        <AuthRequired>on</AuthRequired>
      </Protocol>
      <Protocol>
        <Type>SMTP</Type>
        <Server>${h}</Server>
        <Port>${SMTP_PORT}</Port>
        <SSL>on</SSL>
        <Encryption>TLS</Encryption>
        <LoginName>${e}</LoginName>
        <SPA>off</SPA>
        <AuthRequired>on</AuthRequired>
      </Protocol>
    </Account>
  </Response>
</Autodiscover>
`;
}

/** Apple `.mobileconfig` email profile (unsigned plist). */
export function buildAppleMobileconfig(email: string, domain: string, host: string): string {
  const e = xmlEscape(email);
  const d = xmlEscape(domain);
  const h = xmlEscape(host);
  const accountUuid = randomUUID();
  const profileUuid = randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.mail.managed</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>online.mailctl.mail.${accountUuid}</string>
      <key>PayloadUUID</key>
      <string>${accountUuid}</string>
      <key>PayloadDisplayName</key>
      <string>${e}</string>
      <key>EmailAccountType</key>
      <string>EmailTypeIMAP</string>
      <key>EmailAccountName</key>
      <string>${e}</string>
      <key>EmailAccountDescription</key>
      <string>${d}</string>
      <key>EmailAddress</key>
      <string>${e}</string>
      <key>IncomingMailServerHostName</key>
      <string>${h}</string>
      <key>IncomingMailServerPortNumber</key>
      <integer>${IMAP_PORT}</integer>
      <key>IncomingMailServerUseSSL</key>
      <true/>
      <key>IncomingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>
      <key>IncomingMailServerUsername</key>
      <string>${e}</string>
      <key>OutgoingMailServerHostName</key>
      <string>${h}</string>
      <key>OutgoingMailServerPortNumber</key>
      <integer>${SMTP_PORT}</integer>
      <key>OutgoingMailServerUseSSL</key>
      <true/>
      <key>OutgoingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>
      <key>OutgoingMailServerUsername</key>
      <string>${e}</string>
      <key>SMTPEnableAuthentication</key>
      <true/>
    </dict>
  </array>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadIdentifier</key>
  <string>online.mailctl.profile.${profileUuid}</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadDisplayName</key>
  <string>${d} Mail</string>
</dict>
</plist>
`;
}
