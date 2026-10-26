#!/usr/bin/env node
/**
 * Automated Verification Suite for Local Anonymized Brain CT DICOM Fixture (RDA-4).
 *
 * Parses each generated `.dcm` slice using `dicom-parser` (Cornerstone3D's underlying
 * DICOM Part 10 parser) and verifies:
 *  1. Valid Part 10 preamble and Explicit VR Little Endian transfer syntax.
 *  2. Complete de-identification and synthetic provenance tags (zero real patient data).
 *  3. Axial CT geometry, pixel dimensions (256x256), and HU rescale parameters.
 *  4. Hounsfield Unit (HU) attenuation fidelity across air, parenchyma, bone, and
 *     simulated hyperdense hemorrhage focus on cited evidence slices (index 2 and 3).
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import dicomParser from "dicom-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, "../public/fixtures/dicom/brain-ct");

const EXPECTED_SLICES = [
  { index: 0, file: "slice-0.dcm", zMm: -15.0, citedEvidence: false },
  { index: 1, file: "slice-1.dcm", zMm: -10.0, citedEvidence: false },
  { index: 2, file: "slice-2.dcm", zMm: 1.5, citedEvidence: true },
  { index: 3, file: "slice-3.dcm", zMm: 6.5, citedEvidence: true },
  { index: 4, file: "slice-4.dcm", zMm: 11.5, citedEvidence: false },
];

console.log("=== RADAR AI | RDA-4 DICOM Fixture Verification ===");

for (const expected of EXPECTED_SLICES) {
  const fullPath = path.join(fixtureDir, expected.file);
  assert.ok(fs.existsSync(fullPath), `Missing DICOM fixture file: ${fullPath}`);

  const buffer = fs.readFileSync(fullPath);
  const byteArray = new Uint8Array(buffer);

  // Verify DICM magic header at offset 128
  const magic = String.fromCharCode(
    byteArray[128],
    byteArray[129],
    byteArray[130],
    byteArray[131]
  );
  assert.equal(magic, "DICM", `Invalid DICM preamble in ${expected.file}`);

  // Parse with dicom-parser
  const dataSet = dicomParser.parseDicom(byteArray);

  // Verify Transfer Syntax & Modality
  const transferSyntax = dataSet.string("x00020010");
  assert.equal(transferSyntax, "1.2.840.10008.1.2.1", "Expected Explicit VR Little Endian");

  const modality = dataSet.string("x00080060");
  assert.equal(modality, "CT", "Expected CT Modality");

  // Verify Anonymization & Zero Real Patient Data
  const patientName = dataSet.string("x00100010");
  const patientId = dataSet.string("x00100020");
  const patientBirthDate = dataSet.string("x00100030") ?? "";
  const identityRemoved = dataSet.string("x00120062");
  const deidMethod = dataSet.string("x00120063");

  assert.equal(patientName, "ANONYMIZED^BRAIN^CT", "PatientName must be anonymized");
  assert.equal(patientId, "RADAR-CT-2026-0101", "PatientID must match synthetic code");
  assert.equal(patientBirthDate, "", "PatientBirthDate must be empty");
  assert.equal(identityRemoved, "YES", "PatientIdentityRemoved (0012,0062) must be YES");
  assert.ok(
    deidMethod?.includes("SYNTHETIC"),
    "DeidentificationMethod must state synthetic origin"
  );

  // Verify Image Geometry & Rescale Tags
  const rows = dataSet.uint16("x00280010");
  const cols = dataSet.uint16("x00280011");
  const bitsAllocated = dataSet.uint16("x00280100");
  const rescaleIntercept = parseFloat(dataSet.string("x00281052") ?? "0");
  const rescaleSlope = parseFloat(dataSet.string("x00281053") ?? "1");
  const sliceLocation = parseFloat(dataSet.string("x00201041") ?? "0");

  assert.equal(rows, 256);
  assert.equal(cols, 256);
  assert.equal(bitsAllocated, 16);
  assert.equal(rescaleIntercept, -1024);
  assert.equal(rescaleSlope, 1);
  assert.equal(sliceLocation, expected.zMm);

  // Verify Pixel Data & Hounsfield Unit Attenuation
  const pixelElement = dataSet.elements.x7fe00010;
  assert.ok(pixelElement, `Missing PixelData (7FE0,0010) in ${expected.file}`);
  assert.equal(
    pixelElement.length,
    rows * cols * 2,
    `Unexpected PixelData byte length in ${expected.file}`
  );

  const pixelView = new DataView(
    byteArray.buffer,
    byteArray.byteOffset + pixelElement.dataOffset,
    pixelElement.length
  );

  let minHu = Infinity;
  let maxHu = -Infinity;
  for (let i = 0; i < rows * cols; i++) {
    const stored = pixelView.getUint16(i * 2, true);
    const hu = stored * rescaleSlope + rescaleIntercept;
    if (hu < minHu) minHu = hu;
    if (hu > maxHu) maxHu = hu;
  }

  // Verify Air (~ -1000 HU) and Skull Bone (> +800 HU)
  assert.ok(minHu <= -990, `Expected air HU <= -990, got ${minHu}`);
  assert.ok(maxHu >= 900, `Expected cortical bone HU >= 900, got ${maxHu}`);

  // Sample Left Basal Ganglia ROI center (x ~ 151, y ~ 125 for 256x256)
  const roiX = Math.round(cols * (0.5 + 0.24 * 0.38));
  const roiY = Math.round(rows * (0.5 - 0.03 * 0.44));
  const roiIdx = roiY * cols + roiX;
  const roiStored = pixelView.getUint16(roiIdx * 2, true);
  const roiHu = roiStored * rescaleSlope + rescaleIntercept;

  if (expected.citedEvidence) {
    assert.ok(
      roiHu >= 65 && roiHu <= 90,
      `Expected simulated acute ICH hyperdensity (65-90 HU) on slice ${expected.index}, got ${roiHu} HU`
    );
  } else {
    assert.ok(
      roiHu < 55,
      `Expected normal parenchyma (< 55 HU) on non-evidence slice ${expected.index}, got ${roiHu} HU`
    );
  }

  console.log(
    `  [PASS] ${expected.file} | Z=${sliceLocation.toFixed(1)}mm | ` +
      `HU=[${minHu}, +${maxHu}] | BasalGangliaROI=${roiHu} HU | Cited=${expected.citedEvidence}`
  );
}

console.log("=== All 5 DICOM slices verified with zero patient data ===\n");
