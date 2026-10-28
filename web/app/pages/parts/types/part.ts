/** The part as stocked at the selected location. */
export interface PartInventory {
  binId: string;
  binCode: string;
  quantityOnHand: number;
  reorderLevel: number;
  belowReorderLevel: boolean;
}

export interface PartListItem {
  id: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  thumbnailDocumentId: string | null;
  inventory: PartInventory;
}

export interface PartPhoto {
  id: string;
  documentId: string;
  originalFileName: string;
  status: 'pending' | 'ready' | 'failed';
  failureReason: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface Part {
  id: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  inventory: PartInventory;
  photos: PartPhoto[];
  createdAt: string;
  updatedAt: string;
}

/** A new part is created at the selected location, into one of its bins. */
export interface PartInput {
  partNumber: string;
  description: string;
  unitPrice: number;
  binId: string;
  quantityOnHand: number;
  reorderLevel: number;
}

export interface Bin {
  id: string;
  code: string;
  description: string;
}

/** A photo on the part form: one the part already has, or a file picked here and not saved yet. */
export interface PartPhotoFormValue {
  /** Stable while the form is open: the photo id, or a generated id for a new file. */
  key: string;
  /** The existing photo's id; null for a new file. */
  photoId: string | null;
  documentId: string | null;
  /** The picked file; null for an existing photo. */
  file: File | null;
  fileName: string;
  isDefault: boolean;
}

/** The part form's values. Numbers are strings while being typed; the schema checks them. */
export interface PartFormValues {
  description: string;
  unitPrice: string;
  photos: PartPhotoFormValue[];
}
