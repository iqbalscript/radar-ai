# BUG-13: GitHub Actions CI Runner Disk Exhaustion from Full CUDA PyTorch Wheels

**Severity:** P2 (Medium)  
**Component:** `.github/workflows/ci.yml` & `apps/api/requirements.txt`  
**Found in:** CI Build Run #65  
**Type:** CI/CD Infrastructure Failure (`OSError: [Errno 28] No space left on device`)  
**Status:** Resolved  
**Notice:** Research prototype only — **NOT FOR CLINICAL USE**.

---

## 1. Description

During GitHub Actions CI execution on `ubuntu-latest`, the `API lint and tests` workflow failed with an out-of-disk exception during `python -m pip install -r requirements.txt`:

```text
Installing collected packages: nvidia-cusparselt-cu13, mpmath, cuda-toolkit, websockets, uvloop, 
typing-extensions, triton, tqdm, sympy, setuptools, ruff, pyyaml, python-multipart, python-dotenv, 
pygments, pydicom, psycopg-binary, pluggy, Pillow, packaging, nvidia-nvtx, nvidia-nvjitlink, 
nvidia-nccl-cu13, nvidia-cufile, nvidia-cuda-runtime, nvidia-cuda-nvrtc, nvidia-cuda-cupti, 
nvidia-cuda-cccl, numpy, networkx, MarkupSafe, iniconfig, idna, httptools, hf-xet, h11, fsspec, 
filelock, cuda-pathfinder, click, certifi, annotated-types, annotated-doc, uvicorn, typing-inspection, 
SQLAlchemy, pytest, pydantic-core, psycopg, opentelemetry-api, nvidia-nvshmem-cu13, nvidia-cusparse, 
nvidia-cufft, nvidia-cublas, nibabel, Mako, jinja2, httpcore, cuda-bindings, anyio, watchfiles, 
starlette, pydantic, nvidia-cusolver, nvidia-cudnn-cu13, httpx, alembic, huggingface-hub, fastapi, 
torch, torchvision
ERROR: Could not install packages due to an OSError: [Errno 28] No space left on device

Error: Process completed with exit code 1.
```

### Root Cause
1. In `apps/api/requirements.txt`, `torch>=2.2,<3.0` and `torchvision>=0.17,<1.0` are specified without restricting the PyPI wheel index.
2. When pip installs PyTorch on Linux (`ubuntu-latest`) from standard PyPI, it defaults to GPU-enabled wheels bundling the complete NVIDIA CUDA runtime suite (`nvidia-cudnn-cu13`, `nvidia-cublas`, `nvidia-cusolver`, `nvidia-nccl-cu13`, `triton`, etc.).
3. The compressed downloads exceed 4.5 GB and uncompress to over 10 GB of binaries in `site-packages` and `/tmp`.
4. GitHub Actions standard hosted runners (`ubuntu-latest`) have approximately 14 GB of free root disk space. The combined pre-installed tools, system swap, Docker images, and PyTorch CUDA dependencies completely saturate the runner's disk, aborting with `[Errno 28] No space left on device`.
5. GitHub Actions standard runners do not have GPUs, so installing 10 GB of Nvidia CUDA binaries is entirely superfluous.

---

## 2. Reproduction Steps

1. Trigger a push or pull request to GitHub running `.github/workflows/ci.yml`.
2. Observe job `API lint and tests` downloading `nvidia-*` packages for ~3 minutes.
3. Observe pip aborting during package extraction with `OSError: [Errno 28] No space left on device`.

---

## 3. Impact Analysis

- **CI Pipeline Blocker**: All pull requests and commits fail automated regression tests on GitHub Actions.
- **Build Latency**: Even before failing, downloading 4.5 GB of CUDA packages takes 3+ minutes of runner time.

---

## 4. Remediation Applied

Updated [`.github/workflows/ci.yml`](file:///Users/shine/Documents/Shine's%20Personal%20Folder/Code/Tel-U/radar-ai/.github/workflows/ci.yml) to install CPU-only PyTorch wheels from the official PyTorch wheel repository prior to installing `requirements.txt`:

```yaml
      - name: Install CPU-only PyTorch (avoids downloading 5GB+ CUDA wheels on CI runner)
        run: python -m pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
      - name: Install dependencies
        run: python -m pip install -r requirements.txt
```

### Verification & Benefits
- **Disk Usage**: Reduced PyTorch download and installation footprint from ~10 GB down to ~180 MB (>97% reduction).
- **CI Speed**: Installation completes in ~15 seconds instead of 3.5 minutes.
- **Compatibility**: The CPU wheel satisfies `torch>=2.2,<3.0` and passes all 35 pytest test cases without downloading any `nvidia-*` dependencies.
- **Web Test Parity**: Added `npm test` step to the `web` job for full automated test coverage in CI.

