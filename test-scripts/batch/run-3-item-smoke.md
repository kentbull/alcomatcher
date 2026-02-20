# 3-Item Batch Smoke Run

## 1) Generate a 3-item bundle (mock images)

```bash
node test-scripts/batch/generate-batch-images.mjs \
  --count 3 \
  --failRate 0.34 \
  --provider mock \
  --outDir test-scripts/batch/out/smoke-3 \
  --zip true \
  --zipPath test-scripts/batch/out/smoke-3.zip
```

## 2) Upload in Admin UI

1. Open `https://alcomatcher.com/admin/batches`
2. Select `test-scripts/batch/out/smoke-3.zip`
3. Mode: `CSV Bundle`
4. Click `Start Batch Upload`

## 3) Verify expected behavior

1. Batch status advances: `received -> parsing -> queued -> processing -> completed|partially_failed`
2. `Total` should be `3`
3. At least one item should fail if `failRate` produced a missing-warning row
4. Completed items should show a `View` button linking to application detail

## 4) Optional: generate real AI images (OpenAI)

```bash
export OPENAI_API_KEY=sk-...
node test-scripts/batch/generate-batch-images.mjs \
  --count 3 \
  --failRate 0.34 \
  --provider openai \
  --model gpt-image-1 \
  --quality low \
  --size 1024x1024 \
  --outDir test-scripts/batch/out/smoke-3-openai \
  --zip true \
  --zipPath test-scripts/batch/out/smoke-3-openai.zip
```
