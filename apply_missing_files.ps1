# --- move/create for org-survey repo (PowerShell) ---
cd "C:\Users\yasuh\OneDrive\デスクトップ\APP\組織診断"

# 1) ensure folders
mkdir questions -Force | Out-Null
mkdir templates\master_format\v1 -Force | Out-Null

# 2) move questions.json
if (Test-Path ".\data\questions.json") {
  Copy-Item ".\data\questions.json" ".\questions\questions.json" -Force
}

# 3) copy format originals from core to templates (keep originals too)
Copy-Item ".\core\org_units_format_v1_日本語.csv" ".\templates\master_format\v1\org_units_format.csv" -Force
Copy-Item ".\core\respondents_format_v1_日本語.csv" ".\templates\master_format\v1\respondents_format.csv" -Force
Copy-Item ".\core\responses_db_format_v1_日本語.csv" ".\templates\master_format\v1\responses_db_format.csv" -Force

# 4) (optional) make sure git ignores client real data
# Add-Content .gitignore "`nclients/*/master/*.csv`nclients/*/raw/*.csv`nclients/*/export/*"
