# Local I2V vs fal.ai Comparison Test Log

**Date**: 2026-02-11
**Tester**: Claude Opus 4.6
**Purpose**: ローカルCogVideoX-5B vs fal.ai MiniMax Hailuo の品質・速度・コスト比較

---

## Test Environment

| Item | Value |
|------|-------|
| Machine | Apple M4 Max, 128GB RAM |
| OS | macOS (Darwin 25.1.0) |
| Python | 3.9.6 |
| PyTorch | 2.8.0 (MPS backend) |
| diffusers | 0.36.0 |
| Input Image | `s01-hook_01.png` (1080x1920, 9:16) |

## Test 1: CogVideoX-5B Local (MPS)

| Item | Result |
|------|--------|
| Model | THUDM/CogVideoX-5b-I2V |
| Backend | MPS (Metal Performance Shaders) |
| Model Load | 7.0s (from cache) |
| Generation | **FAILED** - 0/30 steps after 11+ minutes |
| Output | None |
| Estimated Time | 5-7.5 hours per 5-sec clip |
| Cost | 0 (electricity only) |

### Attempt 1 (b03c39e)
- **Error**: `ValueError: The component T5Tokenizer cannot be loaded`
- **Cause**: `sentencepiece` package not installed
- **Fix**: `pip3 install sentencepiece`

### Attempt 2 (baadaca)
- Model loaded successfully in 7.0s
- MPS device: OK
- Attention slicing: enabled
- VAE slicing: enabled
- **Result**: 0/30 denoising steps after 11+ minutes
- **Action**: Manually killed (SIGTERM, exit code 143)
- **CPU usage**: 13-21% (GPU-bound on MPS)

### Analysis
- MPS backend does NOT support FP8 (Float8_e4m3fn)
- CogVideoX-5B requires massive compute for 49 frames
- Each denoising step estimated at 10-15 minutes on MPS
- Total estimated: 30 steps x 10-15 min = **5-7.5 hours per clip**
- Completely impractical for production use

## Test 2: fal.ai MiniMax Hailuo I2V

| Item | Result |
|------|--------|
| Model | fal-ai/minimax-video/image-to-video |
| API | Queue-based REST |
| Submit Time | ~1s |
| Queue Wait | ~4s |
| Generation | ~4.0 min |
| **Total Time** | **4.2 min (249s)** |
| Output Size | **3.5 MB** |
| Cost | **$0.28/clip** |
| Quality | MiniMax world #2 ranking |

### API Details
- Request ID: `82f9c50a-b15e-40bb-ad61-b81e66e27eb2`
- Submit URL: `POST https://queue.fal.run/fal-ai/minimax-video/image-to-video`
- Status URL: `GET https://queue.fal.run/fal-ai/minimax-video/requests/{id}/status`
- Result URL: `GET https://queue.fal.run/fal-ai/minimax-video/requests/{id}`

### Important: Queue API Subpath Rule
- **Submit**: Use full model path (`fal-ai/minimax-video/image-to-video`)
- **Status/Result**: Use base path only (`fal-ai/minimax-video`)
- Including subpath in status/result causes HTTP 405 Method Not Allowed

## Comparison Summary

| Metric | Local CogVideoX | fal.ai MiniMax |
|--------|-----------------|----------------|
| Generation Time | 5-7.5 hours (est.) | **4.2 min** |
| Quality | N/A (incomplete) | World #2 |
| Cost per Clip | $0 | $0.28 |
| Reliability | Low (MPS issues) | **High** |
| Production Ready | No | **Yes** |

## Decision

**fal.ai MiniMax Hailuo** for all 6 video scenes:
- 6 clips x $0.28 = **$1.68 (~250 JPY)**
- 6 clips x 4.2 min = **~25 min (parallelizable)**

## Video Scenes (7:3 Image:Video Ratio)

### Video (6 scenes - fal.ai)
1. `s01-hook` - 冒頭フック (28s)
2. `s04b-gap` - 理想と現実のギャップ (19s)
3. `s06b-revolution` - マーケティング不要革命 (24s)
4. `s07b-05percent` - 先行者5%の世界 (22s)
5. `s04c-pocket` - 四次元ポケット体験 (17s)
6. `s10-final-cta` - 最終CTA (33s)

### Image + Ken Burns (14 scenes)
Remaining 14 scenes use static images with Ken Burns effect.

## Output Files

| File | Location |
|------|----------|
| fal.ai output | `local-i2v-test/output/s01-hook_falai_minimax.mp4` (3.5 MB) |
| Local test script | `local-i2v-test/test_cogvideo.py` |
| fal.ai test script | `local-i2v-test/test_falai.py` |
