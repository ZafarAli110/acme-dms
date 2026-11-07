import { describe, expect, it } from "vitest";
import type { PartFormValues } from "../../types/part";
import { mergePhotos } from "../partFormMapper";

type Photo = PartFormValues["photos"][number];

const saved = (id: string, isDefault = false): Photo => ({
  key: id,
  photoId: id,
  documentId: `doc-${id}`,
  file: null,
  fileName: `${id}.jpg`,
  isDefault,
});
const added = (key: string, isDefault = false): Photo => ({
  key,
  photoId: null,
  documentId: null,
  file: new File([new Uint8Array([1])], `${key}.jpg`),
  fileName: `${key}.jpg`,
  isDefault,
});
const keys = (photos: Photo[]) => photos.map((photo) => photo.key);
const defaultOf = (photos: Photo[]) => photos.filter((photo) => photo.isDefault).map((photo) => photo.key);

describe("mergePhotos", () => {
  // The form opened with A (default) and B; the other person then added Q.
  const opened = [saved("a", true), saved("b")];
  const theirs = [saved("a", true), saved("b"), saved("q")];

  it("keeps the photo the other person added, with this user's new file", () => {
    const mine = [saved("a", true), saved("b"), added("new")];

    expect(keys(mergePhotos(mine, opened, theirs))).toEqual(["a", "b", "q", "new"]);
  });

  it("leaves out only what this user removed", () => {
    const mine = [saved("a", true)];

    expect(keys(mergePhotos(mine, opened, theirs))).toEqual(["a", "q"]);
  });

  it("keeps the default this user chose, and only one", () => {
    const mine = [saved("a"), saved("b", true)];

    expect(defaultOf(mergePhotos(mine, opened, theirs))).toEqual(["b"]);
  });

  it("takes their default when this user did not change it", () => {
    const theirDefault = [saved("a"), saved("b"), saved("q", true)];
    const mine = [saved("a", true), saved("b"), added("new")];

    expect(defaultOf(mergePhotos(mine, opened, theirDefault))).toEqual(["q"]);
  });
});
