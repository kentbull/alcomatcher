# Synthetic Batch Scaffolding

Create a starter 2-item CSV bundle scaffold:

```bash
node test-scripts/batch/scaffold-synthetic-batch.mjs
```

Recommended image generation tools for label artwork:
- OpenAI Images API
- Google Vertex AI Imagen API
- Adobe Firefly API

Workflow:
1. Run scaffold script.
2. Generate front/back label images using your preferred tool.
3. Name image files per scaffold instructions.
4. Zip folder contents.
5. Upload in admin at `/admin/batches`.
