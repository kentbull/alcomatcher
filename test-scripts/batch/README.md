# Synthetic Batch Scripts

## Generate 3-item smoke dataset

```bash
node test-scripts/batch/generate-batch-images.mjs \
  --count 3 \
  --failRate 0.34 \
  --provider mock \
  --outDir test-scripts/batch/out/smoke-3 \
  --zip true \
  --zipPath test-scripts/batch/out/smoke-3.zip
```

Upload `test-scripts/batch/out/smoke-3.zip` in admin at `/admin/batches`.

## Generate 200-300 scale dataset (75/25 pass-fail)

```bash
node test-scripts/batch/generate-batch-images.mjs \
  --count 300 \
  --failRate 0.25 \
  --provider openai \
  --model gpt-image-1 \
  --quality low \
  --size 1024x1024 \
  --seed 42 \
  --outDir test-scripts/batch/out/batch-300 \
  --zip true \
  --zipPath test-scripts/batch/out/batch-300.zip
```

Notes:
- `--provider mock` creates tiny placeholder images for pipeline-only tests.
- `--provider openai` requires `OPENAI_API_KEY`.

## Estimate OpenAI image cost

```bash
node test-scripts/batch/estimate-openai-image-cost.mjs --items 3 --imagesPerItem 3 --model gpt-image-1 --quality low
node test-scripts/batch/estimate-openai-image-cost.mjs --items 300 --imagesPerItem 3 --model gpt-image-1 --quality low
node test-scripts/batch/estimate-openai-image-cost.mjs --items 500 --imagesPerItem 3 --model gpt-image-1 --quality low
```

See `run-3-item-smoke.md` for step-by-step validation.
