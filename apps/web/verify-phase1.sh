#!/bin/bash
# Phase 1 Verification Script

echo "🔍 Verifying Phase 1 Implementation..."
echo ""

# Check if all required files exist
FILES=(
  "src/pages/admin/AdminDashboard.tsx"
  "src/pages/admin/AdminDashboard.css"
  "src/components/admin/AdminNavbar.tsx"
  "src/components/admin/AdminNavbar.css"
  "src/components/admin/MetricsCard.tsx"
  "src/components/admin/MetricsCard.css"
  "src/services/adminApi.ts"
  "src/types/admin.ts"
  "src/AdminApp.tsx"
  "src/admin.tsx"
  "admin.html"
  "ADMIN_README.md"
)

MISSING_FILES=0
for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing: $file"
    MISSING_FILES=$((MISSING_FILES + 1))
  else
    echo "✅ Found: $file"
  fi
done

echo ""
if [ $MISSING_FILES -eq 0 ]; then
  echo "✅ All files present!"
else
  echo "❌ $MISSING_FILES file(s) missing"
  exit 1
fi

echo ""
echo "🔧 Running TypeScript type check..."
npm run typecheck

if [ $? -eq 0 ]; then
  echo "✅ TypeScript compilation passed!"
else
  echo "❌ TypeScript compilation failed"
  exit 1
fi

echo ""
echo "📦 Checking dependencies..."
if grep -q "react-router-dom" package.json; then
  echo "✅ react-router-dom installed"
else
  echo "❌ react-router-dom not found in package.json"
  exit 1
fi

echo ""
echo "🎉 Phase 1 verification complete!"
echo ""
echo "To test the admin interface:"
echo "1. Start the dev server: npm run dev"
echo "2. Navigate to: http://localhost:8100/admin.html"
echo "3. Sign in as a compliance_manager"
echo ""
