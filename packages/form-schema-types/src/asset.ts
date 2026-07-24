/**
 * Asset references. Schemas reference assets by id/URI; large binaries are NOT
 * embedded as Base64 in the form definition unless explicitly configured.
 */

export type AssetKind =
  | 'logo'
  | 'headerImage'
  | 'footerImage'
  | 'watermark'
  | 'signatureImage'
  | 'patientLabelPlaceholder'
  | 'barcodePlaceholder';

export interface FormAssetReference {
  id: string;
  kind: AssetKind;
  /** Reference/URI to the stored asset — not embedded binary data. */
  uri: string;
  altText?: string;
  widthMm?: number;
  heightMm?: number;
}
