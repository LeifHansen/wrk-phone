// Device contact sync. Reads the phone's address book (with permission),
// flattens to {name, phone} pairs, and pushes them to the server where they
// power name display in the inbox and the "known/unknown contact" routing rule.
import * as Contacts from 'expo-contacts';
import { api } from './api';

export interface SyncResult {
  granted: boolean;
  read: number;
  synced: number;
  skipped: number;
  total: number;
}

export async function syncDeviceContacts(): Promise<SyncResult> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    return { granted: false, read: 0, synced: 0, skipped: 0, total: 0 };
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    pageSize: 5000,
  });

  // One row per phone number (a contact can have several).
  const flat: { name: string; phone: string }[] = [];
  for (const c of data) {
    const name = (c.name || '').trim();
    for (const p of c.phoneNumbers || []) {
      const num = p.number || (p as any).digits || '';
      if (num) flat.push({ name, phone: num });
    }
  }

  if (flat.length === 0) {
    const meta = await api.contactsMeta().catch(() => ({ total: 0 }));
    return { granted: true, read: 0, synced: 0, skipped: 0, total: meta.total };
  }

  // Chunk to keep request bodies reasonable.
  let synced = 0;
  let skipped = 0;
  let total = 0;
  const CHUNK = 500;
  for (let i = 0; i < flat.length; i += CHUNK) {
    const res = await api.syncContacts(flat.slice(i, i + CHUNK));
    synced += res.synced;
    skipped += res.skipped;
    total = res.total;
  }

  return { granted: true, read: flat.length, synced, skipped, total };
}
