/**
 * Recover a correctly-encoded upload filename.
 *
 * multer/busboy decode multipart `filename` values as latin1 by default, so a
 * UTF-8 filename (e.g. Greek "…γ-knife.pdf") arrives mojibaked (each UTF-8 byte
 * shown as a latin1 char: "Î³-knife"). Re-reading those chars as latin1 bytes
 * and decoding them as UTF-8 restores the original text.
 *
 * The round-trip guard makes this safe in every case:
 *  - pure ASCII         → bytes unchanged, returns the same string
 *  - latin1-of-UTF-8    → the bytes are valid UTF-8, so the Greek is recovered
 *  - already-valid UTF-8 JS string → re-encoding won't match, returns original
 */
export function decodeUploadFilename(name: string): string {
  if (!name) return name;
  const latin1 = Buffer.from(name, 'latin1');
  const asUtf8 = latin1.toString('utf8');
  // Only accept the re-decode when the bytes were genuinely valid UTF-8.
  return Buffer.from(asUtf8, 'utf8').equals(latin1) ? asUtf8 : name;
}
