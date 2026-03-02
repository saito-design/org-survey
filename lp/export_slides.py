"""
PPTXスライドを画像として出力するスクリプト
PowerPointのCOM APIを使用（Windowsのみ）
"""
import os
import comtypes.client

# 設定
REPORT_DIR = r"C:\Users\yasuh\OneDrive\デスクトップ\株式会社サンプル様レポート作成\out"
OUTPUT_DIR = r"C:\Users\yasuh\OneDrive\デスクトップ\APP\組織診断\lp\images"

# 出力する画像の設定（PPTファイル名: 出力するスライド番号のリスト）
SLIDES_TO_EXPORT = {
    "01_cover.pptx": [1],                    # hero用
    "00_report_hybrid -もと.pptx": [1],      # about用（表紙or全体像）
    "03_overview.pptx": [1],                 # solution01: データ可視化
    "06_strengths_weaknesses.pptx": [1],     # solution02: 改善提案
    "10_gap_analysis.pptx": [1],             # solution03: 定点観測
    "05_summary.pptx": [1],                  # feature用
    "07_stage1.pptx": [1],                   # feature用
    "08_stage2.pptx": [1],                   # feature用
}

def export_slides_to_images():
    """PowerPointを使ってスライドを画像として出力"""

    # 出力フォルダ作成
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # PowerPointアプリケーション起動
    powerpoint = comtypes.client.CreateObject("PowerPoint.Application")
    powerpoint.Visible = 1

    try:
        for ppt_file, slide_numbers in SLIDES_TO_EXPORT.items():
            ppt_path = os.path.join(REPORT_DIR, ppt_file)

            if not os.path.exists(ppt_path):
                print(f"[SKIP] ファイルが見つかりません: {ppt_file}")
                continue

            print(f"[処理中] {ppt_file}")

            # プレゼンテーションを開く
            presentation = powerpoint.Presentations.Open(ppt_path, WithWindow=False)

            try:
                for slide_num in slide_numbers:
                    if slide_num > presentation.Slides.Count:
                        print(f"  [SKIP] スライド{slide_num}は存在しません")
                        continue

                    # 出力ファイル名
                    base_name = os.path.splitext(ppt_file)[0]
                    output_path = os.path.join(OUTPUT_DIR, f"{base_name}_slide{slide_num}.png")

                    # スライドをPNG出力（幅1920px）
                    slide = presentation.Slides(slide_num)
                    slide.Export(output_path, "PNG", 1920)
                    print(f"  [OK] スライド{slide_num} → {os.path.basename(output_path)}")

            finally:
                presentation.Close()

    finally:
        powerpoint.Quit()

    print("\n[完了] 画像出力が完了しました")
    print(f"出力先: {OUTPUT_DIR}")

if __name__ == "__main__":
    export_slides_to_images()
