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

