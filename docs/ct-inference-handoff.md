# CT inference baseline and handoff

**RADAR AI / RDA-2 — Sprint 1**  
**Prepared:** 2026-10-26 (WIB)  
**Status:** Offline runner implemented; approved checkpoint, CT fixtures, and model execution pending  
**Scope:** Research prototype only — **NOT FOR CLINICAL USE**

## Runner

`apps/api/src/radar_api/ct_inference.py` and `apps/api/scripts/score_ct.py` provide an offline
DenseNet121 runner for six-label ICH checkpoints. The runner:

- Loads only an operator-supplied local checkpoint, with no weight downloads or fallback model.
- Requires a strict DenseNet121 state dict with six outputs in the documented label order:
  `any`, `epidural`, `intraparenchymal`, `intraventricular`, `subarachnoid`, `subdural`.
- Uses `decode_and_window` from the ingestion handoff, resizes each grayscale CT window to 224 × 224,
  repeats it across three channels, and applies ImageNet mean/std normalization.
- Runs sigmoid on the six model logits and writes per-slice scores, model metadata, device,
  preprocessing configuration, and the checkpoint file SHA-256 to JSON.
- Defaults to CUDA and fails clearly if CUDA is unavailable. CPU is available for local plumbing.

The output values are checkpoint-derived model scores. The runner does not certify that the supplied
checkpoint was trained correctly, that scores are calibrated, or that the model is suitable for any
medical decision. The checkpoint must come from the authorized modeling workstream and remain in
approved private storage; do not check weights into Git or attach them to a public PR.

## Checkpoint contract

The input is a `torch.save` mapping with these top-level keys:

```python
{
    "metadata": {
        "schema": "radar-ai.densenet121-ich-checkpoint/v1",
        "model_id": "<model and revision>",
        "training_data": "<authorized dataset and version>",
        "weights_sha256": "<source weights SHA-256>",
        "preprocessing": {
            "dicom_window_center": 40.0,
            "dicom_window_width": 80.0,
            "resize": 224,
            "channels": "grayscale_repeated_rgb",
            "normalization": "ImageNet mean/std"
        },
        "labels": [
            "any", "epidural", "intraparenchymal", "intraventricular",
            "subarachnoid", "subdural"
        ]
    },
    "state_dict": model.state_dict()
}
```

The model is torchvision DenseNet121 with its classifier replaced by a six-output linear layer.
The runner rejects checkpoints whose preprocessing metadata differs from its versioned 40/80 CT
window, 224-pixel resize, repeated-RGB, ImageNet-normalized input contract.
Load checkpoints with `torch.load(..., weights_only=True)` compatibility. No example checkpoint is
created here because random weights would generate meaningless scores and would violate the
no-fabricated-predictions requirement.

## Run offline

Install PyTorch and torchvision builds compatible with the workstation's CUDA driver, then install
the API requirements. On a 3050-equipped workstation, confirm `torch.cuda.is_available()` before
running; select `--device cuda` (the default). Once the checkpoint and fixture DICOMs are already on
disk, inference has no network dependency:

```powershell
cd apps/api
$env:PYTHONPATH = "src"
python scripts/score_ct.py `
  --checkpoint "D:\radar-private\ich-densenet121.pt" `
  --input "D:\radar-private\reference-ct" `
  --output "D:\radar-private\reference-scores.json" `
  --device cuda
```

The input directory currently expects `*.dcm` files. Pass a single DICOM path to score one slice.
Do not place patient data, fixtures, labels, or output score files in this repository.

## Evidence and dependent-workstream handoff

No approved pretrained checkpoint or reference DICOM fixtures are present in this workspace.
The host reports an NVIDIA GeForce RTX 3050 6GB Laptop GPU and `torch.cuda.is_available() == True`,
but the installed environment lacks `torchvision`; a package install attempt was blocked by the
workspace's network restriction. Therefore no model outputs or checkpoint-backed GPU run are
claimed here.
Preprocessing has synthetic-fixture unit coverage in `apps/api/tests/test_dicom_preprocessing.py`,
but those tests do not establish model validity. The dependent data/modeling owner should provide:

1. The approved local checkpoint and its provenance/weight SHA-256 under the source terms.
2. A small authorized reference fixture set held outside Git, with expected provenance kept private.
3. A recorded CUDA/PyTorch/torchvision version and successful command output from the RTX 3050.
4. A review artifact or PR link shared with the ingestion/modeling workstream.

Dataset terms and the missing authorized local profile are tracked in
[`rsna-ich-licensing-and-profile.md`](./rsna-ich-licensing-and-profile.md). This is a code handoff,
not a claim that all acceptance criteria have passed. The prototype is **NOT FOR CLINICAL USE**.

## Local binary dataset training

For a local dataset that supplies binary per-slice labels in `bags_train.csv` and `bags_test.csv`,
use `apps/api/scripts/train_ct_binary.py`. The script initializes DenseNet121 from torchvision's
ImageNet1K_V1 weights, fine-tunes a one-logit classifier with weighted binary cross entropy, and
uses the same 40/80 window and 224-pixel normalization as the inference runner. It splits internal
validation by DICOM `PatientID`, aggregates maximum slice score by bag for study-level metrics, and
removes any patient found on both the train and test lists from the test metrics. It writes the
checkpoint and aggregate metrics under the ignored local `apps/api/data/model-artifacts/` directory.

Example from `apps/api`:

```powershell
$env:PYTHONPATH = "src"
python scripts/train_ct_binary.py `
  --data-root "C:\Users\<user>\Downloads\radar-private" `
  --device cuda `
  --epochs 3 `
  --batch-size 4
```

The local profile found 34,496 train slices and 5,254 test slices. The four CSVs map to the DICOM
filenames; labels are binary 0/1 and `bag_label` equals the maximum instance label for each bag.
There are 1,000 train bags and 150 test bags. Three patients occur in both official splits, so the
script excludes those three test bags (109 slices) before reporting test metrics. Ten training
slices failed pixel-data decoding and were counted and skipped; the source files were not changed.

One real local run used one fine-tuning epoch on the RTX 3050, with the ImageNet1K_V1 DenseNet121
weights and a patient-grouped validation split. On the remaining 5,145 test slices / 147 bags, the
observed slice AUROC was 0.933 and study-level AUROC using max-slice aggregation was 0.884. Accuracy
at a fixed 0.5 threshold was 0.760 per slice and 0.497 per study, so that threshold is not suitable
for study-level decisions. These figures describe this single experiment only; they do not establish
clinical performance or generalization. A one-slice inference smoke run also loaded this checkpoint
offline on CUDA and wrote a real model score locally.

The checkpoint and per-fixture score JSON are in the ignored local `apps/api/data/model-artifacts/`
folder and must not be committed or shared. This dataset profile is local workspace evidence, not a
source or licensing determination. Confirm that label `1` has the intended meaning and check the
dataset's own usage terms before interpreting or sharing results.

