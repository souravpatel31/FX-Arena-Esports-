export const ADMIN_EMAILS = [
  'souravpatel312@gmail.com',
  'qupagaming@gmail.com',
  'mahendrathakur9009@gmail.com',
  'mahendrar9009@gmail.com',
];

export const ADMIN_UIDS = ['XoXyXcnrlzOaMIKKolXnU3mT9xn1'];

export const STAFF_EMAILS = [
  'adminrushxesports@gmail.com',
];

export const FREE_MATCH_STAFF_EMAILS = [
  'abhik7772374@gmail.com',
];

export function isAuthorizedAdmin(
  account?: { email?: string | null; id?: string; uid?: string } | null
): boolean {
  if (!account) return false;
  const email = (account.email || '').toLowerCase().trim();
  const uid = account.id || account.uid || '';
  return ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(uid);
}

export function isStaffUser(
  account?: { email?: string | null; id?: string; uid?: string } | null
): boolean {
  if (!account) return false;
  const email = (account.email || '').toLowerCase().trim();
  return STAFF_EMAILS.includes(email) && !isAuthorizedAdmin(account);
}

export function isFreeMatchStaffUser(
  account?: { email?: string | null; id?: string; uid?: string } | null
): boolean {
  if (!account) return false;
  const email = (account.email || '').toLowerCase().trim();
  return (
    FREE_MATCH_STAFF_EMAILS.includes(email) &&
    !isAuthorizedAdmin(account) &&
    !isStaffUser(account)
  );
}

export function hasControlPanelAccess(
  account?: { email?: string | null; id?: string; uid?: string } | null
): boolean {
  return isAuthorizedAdmin(account) || isStaffUser(account) || isFreeMatchStaffUser(account);
}
