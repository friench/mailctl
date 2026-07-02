export function domainOf(address: string): string {
  return address.split('@')[1]?.toLowerCase() ?? '';
}
