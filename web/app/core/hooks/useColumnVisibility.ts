import type {GridColumnVisibilityModel} from '@mui/x-data-grid';
import {useState} from 'react';

const KEY_PREFIX = 'acme.grid.columns.';

/** Null outside a browser, or where storage is blocked: the grid then simply starts with every column. */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(gridId: string): GridColumnVisibilityModel {
  try {
    const stored = storage()?.getItem(`${KEY_PREFIX}${gridId}`);
    return stored ? (JSON.parse(stored) as GridColumnVisibilityModel) : {};
  } catch {
    return {};
  }
}

/**
 * Which of a grid's columns the user has hidden, kept in this browser between visits. What an export includes is
 * what the grid shows, so the list page owns this and hands it to both.
 */
export function useColumnVisibility(gridId: string) {
  const [model, setModel] = useState<GridColumnVisibilityModel>(() => read(gridId));

  const change = (next: GridColumnVisibilityModel): void => {
    setModel(next);
    try {
      storage()?.setItem(`${KEY_PREFIX}${gridId}`, JSON.stringify(next));
    } catch {
      // Not kept: the choice still holds until the page is left.
    }
  };

  return {columnVisibilityModel: model, setColumnVisibilityModel: change};
}
