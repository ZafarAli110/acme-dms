// Sample business data, created through the public APIs as the demo users (so it passes every validation rule).
// Safe to run again: existing parts and customers are reused, stock is set (not added), photos are only added to parts
// without one.
//
//   bun run seed
//
// Dealers, locations and users are bootstrap data: identity-api seeds them itself on startup.
import {deflateSync} from 'node:zlib';
import {callAsync, type Location, resourceUrl, type Session, signInAsync} from './running-system';

type PartSeed = [partNumber: string, description: string, unitPrice: number];

const NORTHWIND_PARTS: PartSeed[] = [
  ['BRK-PAD-001', 'Front brake pads, ceramic', 49.99],
  ['BRK-PAD-002', 'Rear brake pads, semi-metallic', 39.5],
  ['BRK-DSC-001', 'Front brake disc, vented 300 mm', 64.0],
  ['BRK-FLD-001', 'Brake fluid DOT 4, 1 L', 12.75],
  ['OIL-FLT-001', 'Oil filter, spin-on', 8.99],
  ['OIL-ENG-530', 'Engine oil 5W-30 synthetic, 5 L', 42.0],
  ['AIR-FLT-001', 'Engine air filter', 14.5],
  ['CAB-FLT-001', 'Cabin air filter, activated carbon', 18.25],
  ['FUL-FLT-001', 'Fuel filter, inline', 22.0],
  ['SPK-PLG-001', 'Spark plug, iridium', 11.4],
  ['IGN-COL-001', 'Ignition coil', 58.9],
  ['WIP-BLD-600', 'Wiper blade, 600 mm', 16.99],
  ['WIP-BLD-450', 'Wiper blade, 450 mm', 14.99],
  ['BAT-12V-070', 'Battery 12 V 70 Ah', 129.0],
  ['ALT-BLT-001', 'Alternator belt, ribbed', 24.6],
  ['TIM-BLT-KIT', 'Timing belt kit with water pump', 189.0],
  ['CLT-KIT-001', 'Clutch kit, three-piece', 245.0],
  ['SHK-ABS-FR', 'Shock absorber, front', 86.5],
  ['SHK-ABS-RR', 'Shock absorber, rear', 72.0],
  ['CV-JNT-001', 'CV joint, outer', 54.3],
  ['RAD-HOS-001', 'Radiator hose, upper', 19.8],
  ['CLN-ANT-001', 'Coolant, long-life, 5 L', 27.5],
  ['HDL-BLB-H7', 'Headlight bulb H7', 9.95],
  ['TL-BLB-P21', 'Tail light bulb P21/5W', 3.2],
  ['EXH-GSK-001', 'Exhaust manifold gasket', 13.1],
  ['O2-SNS-001', 'Oxygen sensor, upstream', 74.0],
  ['TPMS-SNS-01', 'Tyre pressure sensor', 46.0],
  ['WSH-FLD-005', 'Windscreen washer fluid, 5 L', 7.5],
];

type Category = 'brakes' | 'filters' | 'electrical' | 'engine' | 'chassis' | 'fluids';

/** First match wins, so the fluid prefixes come before the brake and oil ones. */
const CATEGORY_BY_PREFIX: [prefix: string, category: Category][] = [
  ['BRK-FLD', 'fluids'],
  ['OIL-ENG', 'fluids'],
  ['CLN-', 'fluids'],
  ['WSH-', 'fluids'],
  ['CA-COOLANT', 'fluids'],
  ['BRK-', 'brakes'],
  ['CA-BRAKE', 'brakes'],
  ['OIL-FLT', 'filters'],
  ['AIR-', 'filters'],
  ['CAB-', 'filters'],
  ['FUL-', 'filters'],
  ['CA-OIL', 'filters'],
  ['CA-AIR', 'filters'],
  ['ALT-', 'engine'],
  ['TIM-', 'engine'],
  ['CLT-', 'engine'],
  ['EXH-', 'engine'],
  ['RAD-', 'engine'],
  ['SHK-', 'chassis'],
  ['CV-', 'chassis'],
  ['WIP-', 'chassis'],
  ['CA-WIPER', 'chassis'],
];

interface BinSeed {
  code: string;
  description: string;
  holds: Category[];
}

/** Each location's parts store. Every category has exactly one bin per location. */
const BINS: Record<string, BinSeed[]> = {
  Northside: [
    {code: 'A-01', description: 'Brakes', holds: ['brakes']},
    {code: 'A-02', description: 'Filters', holds: ['filters']},
    {code: 'B-01', description: 'Ignition and electrical', holds: ['electrical']},
    {code: 'B-02', description: 'Belts and engine', holds: ['engine']},
    {code: 'C-01', description: 'Oils and fluids', holds: ['fluids']},
    {code: 'C-02', description: 'Suspension, driveline and wipers', holds: ['chassis']},
  ],
  Riverside: [
    {code: 'R-01', description: 'Counter shelf', holds: ['brakes', 'filters']},
    {code: 'R-02', description: 'Back store', holds: ['electrical', 'engine', 'chassis']},
    {code: 'R-03', description: 'Fluids cage', holds: ['fluids']},
  ],
};

function binCodeFor(locationName: string, partNumber: string): string {
  const category = CATEGORY_BY_PREFIX.find(([prefix]) => partNumber.startsWith(prefix))?.[1] ?? 'electrical';
  const bin = BINS[locationName]?.find((candidate) => candidate.holds.includes(category));
  if (!bin) {
    throw new Error(`No bin for ${category} at ${locationName}`);
  }
  return bin.code;
}

/**
 * Each location stocks differently, so switching location visibly changes the parts list: Northside is the main store
 * and stocks everything, Riverside is a small branch that skips every third part and runs low. A part only appears at
 * locations that stock it.
 */
const STOCK_PROFILES: Record<string, (index: number) => {quantityOnHand: number; reorderLevel: number} | null> = {
  Northside: (index) => ({quantityOnHand: 12 + ((index * 7) % 28), reorderLevel: 6}),
  Riverside: (index) => (index % 3 === 0 ? null : {quantityOnHand: (index * 5) % 9, reorderLevel: 4}),
};

interface CustomerSeed {
  firstName: string;
  surname: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: 'active' | 'prospect' | 'inactive';
  lastContactDate: string | null;
}

const customerSeed = (
  firstName: string,
  surname: string,
  companyName: string | null,
  city: string | null,
  status: CustomerSeed['status'],
  lastContactDate: string | null,
  phone: string | null,
): CustomerSeed => ({
  firstName,
  surname,
  companyName,
  email: `${firstName}.${surname}`.toLowerCase().replaceAll(/[^a-z.]/g, '') + '@example.test',
  phone,
  city,
  status,
  lastContactDate,
});

/** Customers belong to one location (rooftop); each location has its own book. */
const CUSTOMERS: Record<string, CustomerSeed[]> = {
  Northside: [
    customerSeed('Amara', 'Okafor', null, 'Northside', 'active', '2026-10-24', '+44 7700 900101'),
    customerSeed('Ben', 'Whitaker', 'Whitaker Plumbing', 'Northside', 'active', '2026-10-20', '+44 7700 900102'),
    customerSeed('Chloe', 'Martin', null, 'Hillcrest', 'active', '2026-09-30', '+44 7700 900103'),
    customerSeed('Dev', 'Patel', 'Patel & Sons Couriers', 'Northside', 'active', '2026-10-27', '+44 7700 900104'),
    customerSeed('Elena', 'Rossi', null, 'Oakfield', 'prospect', null, '+44 7700 900105'),
    customerSeed('Finn', 'Gallagher', null, 'Northside', 'active', '2026-03-14', null),
    customerSeed('Grace', 'Hopper', 'Hopper Logistics', 'Hillcrest', 'active', '2026-10-02', '+44 7700 900107'),
    customerSeed('Hiro', 'Tanaka', null, 'Northside', 'inactive', '2025-12-11', '+44 7700 900108'),
    customerSeed('Isla', 'McKenzie', null, 'Oakfield', 'prospect', '2026-10-25', null),
    customerSeed('Jonas', 'Berg', 'Berg Garden Services', 'Northside', 'active', '2025-11-19', '+44 7700 900110'),
  ],
  Riverside: [
    customerSeed('Kemi', 'Adeyemi', null, 'Riverside', 'active', '2026-10-26', '+44 7700 900201'),
    customerSeed('Liam', 'Byrne', 'Byrne Taxis', 'Riverside', 'active', '2026-10-18', '+44 7700 900202'),
    customerSeed('Maya', 'Cohen', null, 'Millbrook', 'prospect', null, '+44 7700 900203'),
    customerSeed('Noah', 'Fischer', null, 'Riverside', 'active', '2026-04-02', null),
    customerSeed('Olivia', 'Nowak', 'Nowak Florists', 'Millbrook', 'active', '2026-10-11', '+44 7700 900205'),
    customerSeed('Priya', 'Sharma', null, 'Riverside', 'inactive', '2026-01-22', '+44 7700 900206'),
    customerSeed('Rory', 'Doyle', null, 'Riverside', 'prospect', '2026-10-23', '+44 7700 900207'),
  ],
};

const PHOTO_COLOURS: [number, number, number][] = [
  [192, 57, 43],
  [41, 128, 185],
  [39, 174, 96],
  [142, 68, 173],
  [243, 156, 18],
  [44, 62, 80],
];

/** Creates the location's bins that do not exist yet and returns every bin id by code. */
async function ensureBinsAsync(gateway: string, session: Session, location: Location): Promise<Map<string, string>> {
  const existing = (await (await callAsync(gateway, session, location, 'GET', '/api/dealership/v1/bins')).json()) as {
    id: string;
    code: string;
  }[];
  const ids = new Map(existing.map((bin) => [bin.code, bin.id]));
  for (const {code, description} of BINS[location.name] ?? []) {
    if (ids.has(code)) {
      continue;
    }
    const created = await callAsync(
      gateway,
      session,
      location,
      'POST',
      '/api/dealership/v1/bins',
      JSON.stringify({code, description}),
    );
    if (!created.ok) {
      throw new Error(`Creating bin ${code} at ${location.name} failed: ${created.status} ${await created.text()}`);
    }
    ids.set(code, ((await created.json()) as {id: string}).id);
  }
  return ids;
}

/** Creates the part at the location, in the given bin; an existing part is looked up there instead. */
async function ensurePartAsync(
  gateway: string,
  session: Session,
  location: Location,
  [partNumber, description, unitPrice]: PartSeed,
  stock: {binId: string; quantityOnHand: number; reorderLevel: number},
): Promise<string> {
  const created = await callAsync(
    gateway,
    session,
    location,
    'POST',
    '/api/dealership/v1/parts',
    JSON.stringify({partNumber, description, unitPrice, ...stock}),
  );
  if (created.ok) {
    return ((await created.json()) as {id: string}).id;
  }
  if (created.status !== 409) {
    throw new Error(`Creating ${partNumber} failed: ${created.status} ${await created.text()}`);
  }
  const found = await callAsync(
    gateway,
    session,
    location,
    'GET',
    `/api/dealership/v1/parts?search=${encodeURIComponent(partNumber)}`,
  );
  const page = (await found.json()) as {items: {id: string; partNumber: string}[]};
  const existing = page.items.find((item) => item.partNumber === partNumber);
  if (!existing) {
    throw new Error(`${partNumber} exists but is not stocked at ${location.name}`);
  }
  return existing.id;
}

/** Adds the customer to the location unless one with the same email is already there. */
async function ensureCustomerAsync(
  gateway: string,
  session: Session,
  location: Location,
  seed: CustomerSeed,
): Promise<boolean> {
  const found = await callAsync(
    gateway,
    session,
    location,
    'GET',
    `/api/dealership/v1/customers?search=${encodeURIComponent(seed.email ?? seed.surname)}`,
  );
  const page = (await found.json()) as {items: {email: string | null; surname: string}[]};
  if (page.items.some((item) => item.email === seed.email && item.surname === seed.surname)) {
    return false;
  }
  const created = await callAsync(
    gateway,
    session,
    location,
    'POST',
    '/api/dealership/v1/customers',
    JSON.stringify(seed),
  );
  if (!created.ok) {
    throw new Error(
      `Creating customer ${seed.firstName} ${seed.surname} failed: ${created.status} ${await created.text()}`,
    );
  }
  return true;
}

async function setStockAsync(
  gateway: string,
  session: Session,
  location: Location,
  partId: string,
  stock: {binId: string; quantityOnHand: number; reorderLevel: number},
): Promise<void> {
  const response = await callAsync(
    gateway,
    session,
    location,
    'PUT',
    `/api/dealership/v1/stock/${partId}`,
    JSON.stringify(stock),
  );
  if (!response.ok) {
    throw new Error(`Setting stock failed: ${response.status} ${await response.text()}`);
  }
}

async function ensurePhotoAsync(
  gateway: string,
  session: Session,
  location: Location,
  partId: string,
  colour: [number, number, number],
): Promise<boolean> {
  const part = (await (
    await callAsync(gateway, session, location, 'GET', `/api/dealership/v1/parts/${partId}`)
  ).json()) as {
    photos: unknown[];
  };
  if (part.photos.length > 0) {
    return false;
  }
  const form = new FormData();
  form.append(
    'file',
    new Blob([solidPng(1600, 1200, colour).slice()], {type: 'image/png'}),
    `${partId.slice(0, 8)}.png`,
  );
  const response = await callAsync(
    gateway,
    session,
    location,
    'POST',
    `/api/dealership/v1/parts/${partId}/photos`,
    form,
    false,
  );
  if (!response.ok) {
    throw new Error(`Uploading a photo failed: ${response.status} ${await response.text()}`);
  }
  return true;
}

async function seedDealerAsync(gateway: string, user: string, parts: PartSeed[], photoCount: number): Promise<void> {
  const session = await signInAsync(gateway, user);
  const binIds = new Map<string, Map<string, string>>();
  for (const location of session.locations) {
    binIds.set(location.name, await ensureBinsAsync(gateway, session, location));
  }

  let photos = 0;
  for (const [index, seed] of parts.entries()) {
    const stockedAt = session.locations.flatMap((location) => {
      const levels = STOCK_PROFILES[location.name]?.(index);
      const binId = binIds.get(location.name)?.get(binCodeFor(location.name, seed[0]));
      return levels && binId ? [{location, stock: {binId, ...levels}}] : [];
    });
    const [home, ...others] = stockedAt;
    if (!home) {
      continue;
    }
    // A part is created where it is first stocked; the other locations then stock it too.
    const partId = await ensurePartAsync(gateway, session, home.location, seed, home.stock);
    for (const {location, stock} of [home, ...others]) {
      await setStockAsync(gateway, session, location, partId, stock);
    }
    if (
      index < photoCount &&
      (await ensurePhotoAsync(
        gateway,
        session,
        home.location,
        partId,
        PHOTO_COLOURS[index % PHOTO_COLOURS.length] ?? [128, 128, 128],
      ))
    ) {
      photos++;
    }
  }
  let customers = 0;
  for (const location of session.locations) {
    for (const customer of CUSTOMERS[location.name] ?? []) {
      if (await ensureCustomerAsync(gateway, session, location, customer)) {
        customers++;
      }
    }
  }
  console.log(
    `${user}: ${parts.length} parts, bins, stock and customers at ${session.locations.map((l) => l.name).join(' + ')}, ` +
      `${photos} new photos, ${customers} new customers`,
  );
}

/** A solid-colour PNG, so the seed needs no image files. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array<ArrayBuffer> {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row.set([r, g, b], 1 + x * 3);
  }
  const raw = Buffer.concat(Array.from({length: height}, () => row));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const gateway = resourceUrl('gateway', 'http');
// As the manager: she works at both rooftops and may add parts and set stock.
await seedDealerAsync(gateway, 'maria', NORTHWIND_PARTS, 6);
console.log('Seeded. Photos finish processing in the background within a few seconds.');
