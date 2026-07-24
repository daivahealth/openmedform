/**
 * Sample responses for the RRT/SBAR reference definition (spec deliverables
 * #9 Sample Empty Response and #10 Sample Completed Response).
 *
 * Responses use language-independent codes (e.g. avpu: 'ALERT'), never
 * translated display labels.
 */

/** Empty starting draft — the shape a new instance begins with. */
export const rrtSbarSampleEmpty: Record<string, unknown> = {
  callDetails: {},
  reasonForCall: {},
  assessment: {},
};

/** A fully completed, schema-valid response. */
export const rrtSbarSampleCompleted: Record<string, unknown> = {
  callDetails: {
    date: '2026-07-24',
    floorRoom: '3ος / 312',
    callTime: '14:05',
    arrivalTime: '14:09',
    endTime: '14:40',
  },
  reasonForCall: {
    pulseLessThan40: false,
    pulseGreaterThan130: true,
    bpLessThan90: true,
    consciousnessChange: false,
    breathsLessThan8: false,
    breathsGreaterThan24: true,
    spo2LessThan91: false,
    other: '',
  },
  situation: 'Ασθενής με ταχυκαρδία και υπόταση μετά από χειρουργείο.',
  background: 'Ιστορικό κολπικής μαρμαρυγής, υπό αντιπηκτική αγωγή.',
  assessment: {
    temperature: 37.8,
    bloodPressure: '85/50',
    pulse: 138,
    respirations: 26,
    spo2: 95,
    glasgow: 15,
    avpu: 'ALERT',
  },
  recommendation: 'Χορήγηση IV υγρών, ΗΚΓ, ενημέρωση εφημερεύοντος ιατρού.',
  anticoagulantUse: 'YES',
};
