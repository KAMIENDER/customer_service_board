from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import openpyxl


COMPANY_ID = "fb21ef63-7587-44d3-860a-5a259b5115f5"
SCENE_CATEGORY = "conversation_analysis"

LEVEL1_CODE_MAP = {
    "通用问法": "general_questions",
    "商品问法": "product_questions",
}

LEVEL2_CODE_MAP = {
    ("通用问法", "物流/发货问题"): "logistics_shipping",
    ("通用问法", "退款操作说明"): "refund_instructions",
    ("通用问法", "敏感话题回复"): "sensitive_topics",
    ("通用问法", "售后相关"): "after_sales",
    ("通用问法", "产品用量&方法"): "usage_method",
    ("商品问法", "固色产品通用用量&方法"): "colorcare_usage_method",
    ("商品问法", "固色套组"): "colorcare_bundle",
    ("商品问法", "去黄套组"): "anti_yellow_bundle",
    ("商品问法", "去绿相关"): "anti_green",
    ("商品问法", "卷卷精油相关"): "curl_oil",
    ("商品问法", "一号发膜相关"): "mask_no1",
}


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def load_rows(workbook_path: Path):
    workbook = openpyxl.load_workbook(workbook_path, data_only=True)
    rows = []

    for level1_index, worksheet in enumerate(workbook.worksheets, start=1):
        level1_name = worksheet.title.strip()
        level1_code = LEVEL1_CODE_MAP[level1_name]

        current_level2_name = None
        current_level2_code = None
        level3_counter = 0
        level2_index = 0

        for row in worksheet.iter_rows(min_row=2, values_only=True):
            level2_cell = row[0]
            level3_cell = row[1]

            if level2_cell:
                current_level2_name = str(level2_cell).strip()
                current_level2_code = LEVEL2_CODE_MAP[(level1_name, current_level2_name)]
                level3_counter = 0
                level2_index += 1

            if not current_level2_name or not level3_cell:
                continue

            level3_counter += 1
            level3_name = str(level3_cell).strip()
            rows.append(
                {
                    "company_id": COMPANY_ID,
                    "scene_category": SCENE_CATEGORY,
                    "scene_level1_code": level1_code,
                    "scene_level1_name": level1_name,
                    "scene_level2_code": current_level2_code,
                    "scene_level2_name": current_level2_name,
                    "scene_level3_code": f"{current_level2_code}_{level3_counter:03d}",
                    "scene_level3_name": level3_name,
                    "leaf_level": 3,
                    "sort_order": level1_index * 10000 + level2_index * 100 + level3_counter,
                }
            )

    return rows


def build_sql(rows):
    values = []
    for row in rows:
        values.append(
            "("
            + ", ".join(
                [
                    sql_quote(row["company_id"]),
                    sql_quote(row["scene_category"]),
                    sql_quote(row["scene_level1_code"]),
                    sql_quote(row["scene_level1_name"]),
                    sql_quote(row["scene_level2_code"]),
                    sql_quote(row["scene_level2_name"]),
                    sql_quote(row["scene_level3_code"]),
                    sql_quote(row["scene_level3_name"]),
                    str(row["leaf_level"]),
                    str(row["sort_order"]),
                    "1",
                    sql_quote("import"),
                    "NULL",
                    "NULL",
                ]
            )
            + ")"
        )

    values_sql = ",\n".join(values)

    return f"""
DELETE FROM taobao_customer_service_scene_dictionary
WHERE company_id = {sql_quote(COMPANY_ID)}
  AND scene_category = {sql_quote(SCENE_CATEGORY)};

INSERT INTO taobao_customer_service_scene_dictionary (
  company_id,
  scene_category,
  scene_level1_code,
  scene_level1_name,
  scene_level2_code,
  scene_level2_name,
  scene_level3_code,
  scene_level3_name,
  leaf_level,
  sort_order,
  is_enabled,
  source,
  remark,
  extra_json
) VALUES
{values_sql};
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--workbook",
        default="/Users/hejiadong/project/customer_service_board/docs/客服会话问题标签.xlsx",
    )
    parser.add_argument("--host", default="rm-7xvjhs6448beic39wro.mysql.rds.aliyuncs.com")
    parser.add_argument("--port", default="3306")
    parser.add_argument("--user", default="common")
    parser.add_argument("--password", default="#Common123")
    parser.add_argument("--database", default="common")
    args = parser.parse_args()

    rows = load_rows(Path(args.workbook))
    sql = build_sql(rows)

    subprocess.run(
        [
            "mysql",
            f"-h{args.host}",
            f"-P{args.port}",
            f"-u{args.user}",
            f"-p{args.password}",
            args.database,
        ],
        input=sql,
        text=True,
        check=True,
    )

    print(f"imported_rows={len(rows)}")


if __name__ == "__main__":
    main()
