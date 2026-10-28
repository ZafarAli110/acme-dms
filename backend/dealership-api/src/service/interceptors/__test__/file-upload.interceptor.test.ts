import {describe, expect, it} from 'vitest';
import {type UploadedFileLike, uploadedFileName} from '../file-upload.interceptor';

function fileNamed(originalname: string): UploadedFileLike {
  return {originalname, mimetype: 'image/png', size: 1, buffer: Buffer.from([1])};
}

describe('uploadedFileName', () => {
  it('turns a UTF-8 name the parser read as Latin-1 back into what the user saw', () => {
    const asParsed = Buffer.from('Screenshot 2026-10-26 at 2.39.22 PM.png', 'utf8').toString('latin1');

    expect(uploadedFileName(fileNamed(asParsed))).toBe('Screenshot 2026-10-26 at 2.39.22 PM.png');
    expect(uploadedFileName(fileNamed(Buffer.from('café.jpg', 'utf8').toString('latin1')))).toBe('café.jpg');
  });

  it('leaves a plain ASCII name as it is', () => {
    expect(uploadedFileName(fileNamed('brake-pads.jpg'))).toBe('brake-pads.jpg');
  });
});
